import type { SnapTradeOAuthStatus } from "./types/brokerage";

export type SnapTradeOAuthPhase =
	| "idle"
	| "waiting"
	| "setup"
	| "reauthorizing"
	| "error";

export function snapTradeOAuthPhase(
	status: Pick<SnapTradeOAuthStatus, "status" | "intent"> | null | undefined,
): SnapTradeOAuthPhase {
	if (!status) return "idle";
	if (status.status === "pending" || status.status === "processing") {
		return "waiting";
	}
	if (status.status !== "authorized") return "error";
	return status.intent === "reauthorize" ? "reauthorizing" : "setup";
}
