import { createHash } from "node:crypto";
import type { DesktopDatabase } from "./database.ts";
import type { GraphqlClient } from "./protocol.ts";

type Pending = { owner_id: string; workspace_id: string; client_id: string; mutation_id: string; payload_hash: string; query_text: string; variables_json: string; state: string; response_json: string | null; last_error: string | null };
const READS = new Set(["JournalFlowStatus", "JournalTradesV2", "JournalDetailV2", "JournalChartV2", "JournalSuggestionsV2"]);
const DRAFTS = new Set(["SaveJournalContext", "SaveJournalReviewDraft", "MarkJournalTradeReviewed"]);
const ONLINE_ONLY = new Set(["PreviewJournalGrouping", "ConfirmJournalGrouping", "PreviewUndoJournalGrouping", "EnsureJournalContextNote", "OpenJournalReviewSession", "MoveJournalReviewCursor", "PreviewJournalSuggestion", "DismissJournalSuggestion", "ResetJournalLearning", "PrepareJournalFlow", "EnableJournalFlow"]);

function operation(query: string): string | null { return query.match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1] ?? null; }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function transportFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return error instanceof Error && /fetch failed|network|offline|ECONN|ENOTFOUND|EAI_AGAIN|timed? ?out|Backend returned 5\d\d/i.test(error.message);
}
function needsAuthentication(error:unknown):boolean {return error instanceof Error && /Not signed in|Backend returned 40[13]/i.test(error.message);}

export class JournalFlowRepository {
  readonly #store: DesktopDatabase;
  readonly #remote: GraphqlClient;
  readonly #owner: () => Promise<string | null>;
  #flushing: Promise<void> | null = null;
  #refreshing: Promise<void> | null = null;

  constructor(store: DesktopDatabase, remote: GraphqlClient, owner: () => Promise<string | null>) {
    this.#store = store; this.#remote = remote; this.#owner = owner;
  }

  handles(query: string): boolean { const name = operation(query); return !!name && (READS.has(name) || DRAFTS.has(name) || ONLINE_ONLY.has(name)); }

  async execute(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const owner = await this.#owner();
    if (!owner) throw new Error("Sign in to use your journal");
    const workspace = variables.workspaceId;
    if (typeof workspace !== "string" || !workspace) throw new Error("A journal workspace is required");
    const name = operation(query)!;
    if (DRAFTS.has(name)) return this.#save(owner, workspace, query, variables);
    if (READS.has(name) || name === "OpenJournalReviewSession") {
      const { clientId: _client, mutationId: _mutation, ...stable } = variables;
      const key = digest([query, stable]);
      try {
        await this.flush();
        const result = await this.#remote(query, variables);
        if (await this.#owner() !== owner) throw new Error("The signed-in account changed");
        this.#store.db.prepare("INSERT INTO journal_flow_cache(owner_id,workspace_id,cache_key,query_text,variables_json,response_json) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_id,workspace_id,cache_key) DO UPDATE SET response_json=excluded.response_json,query_text=excluded.query_text,variables_json=excluded.variables_json,updated_at=datetime('now')")
          .run(owner, workspace, key, query, JSON.stringify(variables), JSON.stringify(result));
        return result;
      } catch (error) {
        if (!transportFailure(error)) throw error;
        const cached = this.#store.db.prepare("SELECT response_json FROM journal_flow_cache WHERE owner_id=? AND workspace_id=? AND cache_key=?").get(owner, workspace, key) as { response_json: string } | undefined;
        if (!cached) throw new Error("Offline. Connect once to load this part of your journal.");
        const result = JSON.parse(cached.response_json) as Record<string, unknown>;
        if (name === "JournalFlowStatus") {
          const status = result.journalFlowStatus;
          if (status && typeof status === "object") result.journalFlowStatus = { ...status, importState: "offline", lastError: null };
        }
        return result;
      }
    }
    const result = await this.#remote(query, variables);
    this.#store.db.prepare("DELETE FROM journal_flow_cache WHERE owner_id=? AND workspace_id=?").run(owner, workspace);
    return result;
  }

  async #save(owner: string, workspace: string, query: string, variables: Record<string, unknown>): Promise<unknown> {
    const { clientId, mutationId } = variables;
    if (typeof clientId !== "string" || typeof mutationId !== "string") throw new Error("A mutation identity is required");
    const hash = digest([query, variables]);
    const prior = this.#store.db.prepare("SELECT * FROM journal_flow_outbox WHERE owner_id=? AND client_id=? AND mutation_id=?").get(owner, clientId, mutationId) as Pending | undefined;
    if (prior && (prior.payload_hash !== hash || prior.workspace_id !== workspace)) throw new Error("IDEMPOTENCY_CONFLICT: this request identity was already used");
    if (prior?.state === "acknowledged") return JSON.parse(prior.response_json!);
    if (prior?.state === "conflict") throw new Error(prior.last_error ?? "CONFLICT: review this pending change");
    this.#store.db.prepare("INSERT OR IGNORE INTO journal_flow_outbox(owner_id,workspace_id,client_id,mutation_id,payload_hash,query_text,variables_json) VALUES (?,?,?,?,?,?,?)")
      .run(owner, workspace, clientId, mutationId, hash, query, JSON.stringify(variables));
    const row = this.#store.db.prepare("SELECT * FROM journal_flow_outbox WHERE owner_id=? AND client_id=? AND mutation_id=?").get(owner, clientId, mutationId) as Pending;
    try { return await this.#transmit(row); }
    catch (error) { if (transportFailure(error)) throw new Error("Offline or unavailable. This change is pending and will sync when connected."); throw error; }
  }

  async #transmit(row: Pending): Promise<unknown> {
    if (await this.#owner() !== row.owner_id) throw new Error("The signed-in account changed");
    try {
      const response = await this.#remote(row.query_text, JSON.parse(row.variables_json) as Record<string, unknown>);
      this.#store.db.prepare("UPDATE journal_flow_outbox SET state='acknowledged',response_json=?,last_error=NULL,updated_at=datetime('now') WHERE owner_id=? AND client_id=? AND mutation_id=?")
        .run(JSON.stringify(response), row.owner_id, row.client_id, row.mutation_id);
      this.#patchCache(row, response);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Journal sync failed";
      const state = transportFailure(error) || needsAuthentication(error) ? "pending" : "conflict";
      this.#store.db.prepare("UPDATE journal_flow_outbox SET state=?,last_error=?,updated_at=datetime('now') WHERE owner_id=? AND client_id=? AND mutation_id=?").run(state, message, row.owner_id, row.client_id, row.mutation_id);
      throw error;
    }
  }

  #patchCache(row: Pending, response: unknown): void {
    if (!response || typeof response !== "object") return;
    const object = response as Record<string, unknown>;
    const field = "saveJournalContext" in object ? "journalContextV2" : "saveJournalReviewDraft" in object ? "journalReviewDraftV2" : null;
    if (!field) return;
    const saved = object[field === "journalContextV2" ? "saveJournalContext" : "saveJournalReviewDraft"];
    const input = (JSON.parse(row.variables_json) as { input?: { entryId?: string } }).input;
    const cached = this.#store.db.prepare("SELECT cache_key,variables_json,response_json FROM journal_flow_cache WHERE owner_id=? AND workspace_id=?").all(row.owner_id, row.workspace_id) as { cache_key: string; variables_json: string; response_json: string }[];
    for (const item of cached) {
      const variables = JSON.parse(item.variables_json) as { entryId?: string };
      if (variables.entryId !== input?.entryId) continue;
      const data = JSON.parse(item.response_json) as Record<string, unknown>;
      if (field in data) this.#store.db.prepare("UPDATE journal_flow_cache SET response_json=? WHERE owner_id=? AND workspace_id=? AND cache_key=?").run(JSON.stringify({ ...data, [field]: saved }), row.owner_id, row.workspace_id, item.cache_key);
    }
  }

  async flush(): Promise<void> {
    if (this.#flushing) return this.#flushing;
    this.#flushing = (async () => {
      const owner = await this.#owner(); if (!owner) return;
      const pending = this.#store.db.prepare("SELECT * FROM journal_flow_outbox WHERE owner_id=? AND state='pending' ORDER BY created_at,rowid LIMIT 50").all(owner) as Pending[];
      for (const row of pending) { try { await this.#transmit(row); } catch (error) { if (transportFailure(error) || needsAuthentication(error)) break; } }
    })().finally(() => { this.#flushing = null; });
    return this.#flushing;
  }

  async sync(): Promise<void> {
    if (this.#refreshing) return this.#refreshing;
    this.#refreshing=(async()=>{
      await this.flush();
      const owner=await this.#owner(); if(!owner)return;
      const workspaces=this.#store.db.prepare("SELECT DISTINCT workspace_id FROM journal_flow_cache WHERE owner_id=?").all(owner) as {workspace_id:string}[];
      for(const {workspace_id:workspaceId} of workspaces){
        const previous=this.#store.db.prepare("SELECT cursor FROM journal_flow_sync WHERE owner_id=? AND workspace_id=?").get(owner,workspaceId) as {cursor:string}|undefined;
        const response=await this.#remote(`query JournalSnapshotV2($workspaceId:String!,$cursor:String){journalSnapshotV2(workspaceId:$workspaceId,cursor:$cursor){cursor reset tombstones trades{id workspaceId sourceKind episodeId symbol symbolName direction currency openDate closeDate entryPrice exitPrice enteredQuantity remainingQuantity realizedNet feesPaid contractMultiplier lifecycleState outcome tags{id name color} reviewState recordVersion materializedRevision issueCode issueMessage possibleDuplicates retiredAt successorId}}}`,{workspaceId,cursor:previous?.cursor??null}) as {journalSnapshotV2:{cursor:string;reset:boolean;trades:unknown[];tombstones:string[]}};
        const snapshot=response.journalSnapshotV2;
        if(!snapshot.reset)continue;
        const cached=this.#store.db.prepare("SELECT cache_key,query_text,variables_json FROM journal_flow_cache WHERE owner_id=? AND workspace_id=?").all(owner,workspaceId) as {cache_key:string;query_text:string;variables_json:string}[];
        const updates:{key:string;value:unknown}[]=[];
        for(const item of cached){
          const name=operation(item.query_text);
          if(name==="JournalTradesV2")updates.push({key:item.cache_key,value:{journalTradesV2:snapshot.trades}});
          else if(name && READS.has(name) && name!=="JournalChartV2") updates.push({key:item.cache_key,value:await this.#remote(item.query_text,JSON.parse(item.variables_json) as Record<string,unknown>)});
        }
        if(await this.#owner()!==owner)return;
        this.#store.db.exec("BEGIN IMMEDIATE");
        try{
          for(const update of updates)this.#store.db.prepare("UPDATE journal_flow_cache SET response_json=?,updated_at=datetime('now') WHERE owner_id=? AND workspace_id=? AND cache_key=?").run(JSON.stringify(update.value),owner,workspaceId,update.key);
          this.#store.db.prepare("INSERT INTO journal_flow_sync(owner_id,workspace_id,cursor) VALUES(?,?,?) ON CONFLICT(owner_id,workspace_id) DO UPDATE SET cursor=excluded.cursor").run(owner,workspaceId,snapshot.cursor);
          this.#store.db.exec("COMMIT");
        }catch(error){this.#store.db.exec("ROLLBACK");throw error;}
      }
    })().finally(()=>{this.#refreshing=null;});
    return this.#refreshing;
  }
}
