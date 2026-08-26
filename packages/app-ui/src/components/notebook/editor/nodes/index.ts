import { STANDARD_NODES } from "@tradstry/notebook-core";
import { LinkedTradeNode } from "./linked-trade-node";
import { NotebookImageNode } from "./notebook-image-node";
import { NotebookVideoNode } from "./notebook-video-node";
import { TradeTableNode } from "./trade-table-node";

/** The shared node union, with this client's rendering subclasses substituted in. */
export const WEB_NODES = [
  ...STANDARD_NODES,
  NotebookImageNode,
  NotebookVideoNode,
  LinkedTradeNode,
  TradeTableNode,
];
