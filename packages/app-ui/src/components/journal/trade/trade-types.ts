import type * as flow from "@tradstry/app-ui/lib/service/journal-flow";

export type DetailData = Awaited<ReturnType<typeof flow.detail>>;
export type SheetTab = "timeline" | "review" | "notes" | "history";
export type TradeQueue = { date: string | null };
export type EditorTarget = { anchorExecutionId: string; kind: "note" | "hindsight" };
