import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";

export function mergeCandidates(trade: JournalTrade, trades: JournalTrade[]) {
	return trades.filter(
		(other) =>
			other.id !== trade.id &&
			!!other.episodeId &&
			!other.retiredAt &&
			other.lifecycleState !== "incomplete" &&
			other.symbol === trade.symbol &&
			other.direction === trade.direction &&
			other.currency === trade.currency,
	);
}
