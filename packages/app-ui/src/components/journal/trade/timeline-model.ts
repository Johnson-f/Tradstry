import type {
	Execution,
	TradeAction,
} from "@tradstry/app-ui/lib/service/journal-flow";

export function executionsFor(action: TradeAction, executions: Execution[]) {
	const own = executions.filter((execution) =>
		action.executionIds.includes(execution.transactionId),
	);
	const sameRole = own.filter((execution) => execution.role === action.role);
	return sameRole.length ? sameRole : own;
}

export function suggestedJoinFor(action: TradeAction, suggestions: string[][]) {
	return suggestions.find((group) =>
		action.executionIds.includes(group[0] ?? ""),
	);
}
