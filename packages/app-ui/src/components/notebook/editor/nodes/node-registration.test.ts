import { expect, test } from "bun:test";
import { LinkedTradeNode } from "./linked-trade-node";
import { NotebookImageNode } from "./notebook-image-node";
import { NotebookVideoNode } from "./notebook-video-node";
import { TradeTableNode } from "./trade-table-node";

test("rendering nodes define their own Lexical type", () => {
  for (const node of [
    NotebookImageNode,
    NotebookVideoNode,
    LinkedTradeNode,
    TradeTableNode,
  ]) {
    expect(Object.hasOwn(node, "getType")).toBe(true);
  }
});
