import type {
	AgentContextKind,
	AgentContextReferenceInput,
	AgentMessage,
} from "@tradstry/app-ui/lib/types/agents";

export type AgentAnswerBlock =
	| { kind: "paragraph"; text: string }
	| { kind: "metric"; label: string; value: string }
	| { kind: "list"; title: string | null; items: string[] }
	| { kind: "warning"; text: string }
	| { kind: "action_proposal"; proposalId: string };

export type ParsedAgentMessage =
	| { kind: "user"; text: string; contexts: AgentContextReferenceInput[] }
	| { kind: "assistant"; blocks: AgentAnswerBlock[] }
	| { kind: "action"; status: string }
	| { kind: "unknown"; text: string };

function object(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseBlock(value: unknown): AgentAnswerBlock | null {
	const block = object(value);
	const kind = text(block?.kind);
	if (!block || !kind) return null;

	if (kind === "paragraph" || kind === "warning") {
		const content = text(block.text);
		return content ? { kind, text: content } : null;
	}
	if (kind === "metric") {
		const label = text(block.label);
		const valueText = text(block.value);
		return label && valueText ? { kind, label, value: valueText } : null;
	}
	if (kind === "list") {
		const items = Array.isArray(block.items)
			? block.items.map(text).filter((item): item is string => item !== null)
			: [];
		return items.length ? { kind, title: text(block.title), items } : null;
	}
	if (kind === "action_proposal") {
		const proposalId = text(block.proposal_id) ?? text(block.proposalId);
		return proposalId ? { kind, proposalId } : null;
	}
	return null;
}

const CONTEXT_KINDS = new Set<AgentContextKind>([
	"TRADE",
	"PLAYBOOK",
	"NOTE",
	"MEDIA",
	"MARKET",
	"DATE_RANGE",
]);

function parseContextReference(
	value: unknown,
): AgentContextReferenceInput | null {
	const reference = object(value);
	const key = text(reference?.key);
	const title = text(reference?.title);
	const rawKind = text(reference?.kind)?.toUpperCase();
	if (!reference || !key || !title || !rawKind) return null;
	const kind = rawKind as AgentContextKind;
	if (!CONTEXT_KINDS.has(kind)) return null;
	return {
		key,
		kind,
		id: typeof reference.id === "string" ? reference.id : null,
		title,
		subtitle:
			typeof reference.subtitle === "string" ? reference.subtitle.trim() : "",
	};
}

export function parseAgentMessage(message: AgentMessage): ParsedAgentMessage {
	let value: Record<string, unknown> | null = null;
	try {
		value = object(JSON.parse(message.contentJson));
	} catch {
		return { kind: "unknown", text: "This message could not be displayed." };
	}

	if (message.role === "user") {
		const context = object(value?.context);
		const contexts = Array.isArray(context?.references)
			? context.references
					.map(parseContextReference)
					.filter(
						(reference): reference is AgentContextReferenceInput =>
							reference !== null,
					)
			: [];
		return {
			kind: "user",
			text: text(value?.text) ?? "Message unavailable",
			contexts,
		};
	}
	if (message.role === "assistant") {
		const blocks = Array.isArray(value?.blocks)
			? value.blocks
					.map(parseBlock)
					.filter((block): block is AgentAnswerBlock => block !== null)
			: [];
		return { kind: "assistant", blocks };
	}
	if (message.role === "action") {
		return { kind: "action", status: text(value?.status) ?? "updated" };
	}
	return { kind: "unknown", text: "Unsupported message" };
}

export function messageTextForClipboard(
	message: ParsedAgentMessage,
): string | null {
	if (message.kind === "user" || message.kind === "unknown") {
		return message.text;
	}
	if (message.kind !== "assistant") return null;

	const sections = message.blocks.flatMap((block) => {
		if (block.kind === "paragraph" || block.kind === "warning") {
			return [block.text];
		}
		if (block.kind === "metric") {
			return [`${block.label}: ${block.value}`];
		}
		if (block.kind === "list") {
			return [
				[block.title, ...block.items.map((item) => `- ${item}`)]
					.filter((line): line is string => Boolean(line))
					.join("\n"),
			];
		}
		return [];
	});

	return sections.length ? sections.join("\n\n") : null;
}
