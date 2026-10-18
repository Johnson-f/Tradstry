import { describe, expect, test } from "bun:test";
import type { Execution, TradeAction } from "@tradstry/app-ui/lib/service/journal-flow";
import { executionsFor, suggestedJoinFor } from "./timeline-model";

const execution = (transactionId: string, role: string) => ({ transactionId, role }) as Execution;
const action = (role: string, executionIds: string[]) => ({ role, executionIds }) as TradeAction;

describe("executionsFor", () => {
	const executions = [execution("a", "entry"), execution("b", "entry"), execution("b", "exit"), execution("c", "exit")];

	test("an action owns the executions it lists", () => {
		expect(executionsFor(action("entry", ["a", "b"]), executions)).toHaveLength(2);
	});

	test("an execution that crosses zero belongs to each action for its own part", () => {
		const exit = executionsFor(action("exit", ["b"]), executions);
		expect(exit).toEqual([execution("b", "exit")]);
	});

	test("falls back to the listed executions when no role matches", () => {
		expect(executionsFor(action("exit", ["a"]), executions)).toEqual([execution("a", "entry")]);
	});
});

describe("suggestedJoinFor", () => {
	test("matches the action holding the first execution of a suggestion", () => {
		const groups = [["a", "b"]];
		expect(suggestedJoinFor(action("entry", ["a"]), groups)).toEqual(["a", "b"]);
		expect(suggestedJoinFor(action("entry", ["z"]), groups)).toBeUndefined();
	});
});
