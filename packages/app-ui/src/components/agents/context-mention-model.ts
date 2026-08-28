import type {
	AgentContextKind,
	AgentContextSearchResult,
	AgentDateRangeInput,
	AgentMessageContextInput,
} from "@tradstry/app-ui/lib/types/agents";

export interface ActiveMention {
	start: number;
	end: number;
	query: string;
}

const MULTI_SELECT_LIMIT = 5;

export function findActiveMention(
	value: string,
	cursor: number,
): ActiveMention | null {
	const beforeCursor = value.slice(0, cursor);
	const match = beforeCursor.match(/(?:^|\s)@([^@\n]{0,80})$/);
	if (!match || match.index === undefined) return null;
	const atOffset = match[0].indexOf("@");
	const start = match.index + atOffset;
	return {
		start,
		end: cursor,
		query: match[1]?.trimStart() ?? "",
	};
}

export function replaceActiveMention(
	value: string,
	mention: ActiveMention,
): { value: string; cursor: number } {
	const next = `${value.slice(0, mention.start)}${value.slice(mention.end)}`;
	return { value: next, cursor: mention.start };
}

export function parseContextMetadata(
	result: AgentContextSearchResult,
): Record<string, unknown> {
	try {
		const value: unknown = JSON.parse(result.metadataJson);
		return value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function addContextSelection(
	current: AgentContextSearchResult[],
	selection: AgentContextSearchResult,
): AgentContextSearchResult[] {
	if (current.some((item) => item.key === selection.key)) return current;
	if (selection.kind === "MARKET" || selection.kind === "DATE_RANGE") {
		return [
			...current.filter((item) => item.kind !== selection.kind),
			selection,
		];
	}
	const matching = current.filter((item) => item.kind === selection.kind);
	if (matching.length >= MULTI_SELECT_LIMIT) return current;
	return [...current, selection];
}

export function removeContextSelection(
	current: AgentContextSearchResult[],
	key: string,
): AgentContextSearchResult[] {
	return current.filter((item) => item.key !== key);
}

export function createCustomDateSelection(
	dateRange: AgentDateRangeInput,
): AgentContextSearchResult {
	return {
		key: `date_range:custom:${dateRange.from}:${dateRange.to}`,
		kind: "DATE_RANGE",
		id: null,
		title: "Custom range",
		subtitle: `${dateRange.from} – ${dateRange.to}`,
		metadataJson: JSON.stringify(dateRange),
	};
}

export function serializeContextSelections(
	selections: AgentContextSearchResult[],
): AgentMessageContextInput | undefined {
	const context: AgentMessageContextInput = {
		references: selections.map(({ key, kind, id, title, subtitle }) => ({
			key,
			kind,
			id,
			title,
			subtitle,
		})),
	};
	const idsByKind = (kind: AgentContextKind) =>
		selections
			.filter((item) => item.kind === kind && item.id)
			.map((item) => item.id as string);

	const tradeIds = idsByKind("TRADE");
	const playbookIds = idsByKind("PLAYBOOK");
	const noteIds = idsByKind("NOTE");
	const mediaIds = idsByKind("MEDIA");
	if (tradeIds.length) context.tradeIds = tradeIds;
	if (playbookIds.length) context.playbookIds = playbookIds;
	if (noteIds.length) context.noteIds = noteIds;
	if (mediaIds.length) context.mediaIds = mediaIds;

	const market = selections.find((item) => item.kind === "MARKET");
	if (market) {
		const metadata = parseContextMetadata(market);
		context.marketSymbol =
			typeof metadata.symbol === "string" ? metadata.symbol : market.title;
	}

	const date = selections.find((item) => item.kind === "DATE_RANGE");
	if (date) {
		const metadata = parseContextMetadata(date);
		if (typeof metadata.from === "string" && typeof metadata.to === "string") {
			context.dateRange = { from: metadata.from, to: metadata.to };
		}
	}

	return selections.length ? context : undefined;
}
