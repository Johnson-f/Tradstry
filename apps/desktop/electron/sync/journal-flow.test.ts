import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { openDesktopDatabase } from "./database.ts";
import { JournalFlowRepository } from "./journal-flow.ts";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

test("an offline draft keeps its identity until the server acknowledges it", async () => {
  const store = openDesktopDatabase(":memory:", schema);
  let offline = true;
  let calls = 0;
  const repo = new JournalFlowRepository(store, async (_query, variables) => {
    calls++;
    if (offline) throw new TypeError("fetch failed");
    assert.equal(variables.mutationId, "draft-1");
    return { saveJournalReviewDraft: { version: 1, takeaway: "Keep the planned exit" } };
  }, async () => "owner-a");
  const query = "mutation SaveJournalReviewDraft { saveJournalReviewDraft { version } }";
  const variables = {workspaceId:"account-a",clientId:"desktop-a",mutationId:"draft-1",input:{entryId:"trade-a",expectedVersion:0,takeaway:"Keep the planned exit"}};
  try {
    await assert.rejects(repo.execute(query,variables), /pending/);
    assert.equal(store.db.prepare("SELECT state FROM journal_flow_outbox").get()?.state, "pending");
    offline=false;
    await repo.flush();
    const result=await repo.execute(query,variables);
    assert.deepEqual(result,{saveJournalReviewDraft:{version:1,takeaway:"Keep the planned exit"}});
    assert.equal(calls,2);
    await assert.rejects(repo.execute(query,{...variables,input:{...variables.input,takeaway:"Changed body"}}),/IDEMPOTENCY_CONFLICT/);
  } finally { store.close(); }
});

test("desktop refresh removes retired trades and never shares another owner's offline cache", async () => {
  const store = openDesktopDatabase(":memory:", schema);
  let owner="owner-a";
  let offline=false;
  const repo=new JournalFlowRepository(store,async(query)=>{
    if(offline)throw new TypeError("fetch failed");
    if(query.includes("JournalSnapshotV2"))return {journalSnapshotV2:{cursor:"revision-2",reset:true,trades:[{id:"survivor"}],tombstones:["retired"]}};
    return {journalTradesV2:[{id:"retired"},{id:"survivor"}]};
  },async()=>owner);
  const query="query JournalTradesV2 { journalTradesV2 { id } }";
  try {
    await repo.execute(query,{workspaceId:"account-a"});
    await repo.sync();
    offline=true;
    assert.deepEqual(await repo.execute(query,{workspaceId:"account-a"}),{journalTradesV2:[{id:"survivor"}]});
    owner="owner-b";
    await assert.rejects(repo.execute(query,{workspaceId:"account-a"}),/Connect once/);
  } finally { store.close(); }
});
