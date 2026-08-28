import type { AgentConversation } from "@tradstry/app-ui/lib/types/agents";

export function nextConversationAfterDelete(
	conversations: AgentConversation[],
	deletedId: string,
): string | null {
	const index = conversations.findIndex(
		(conversation) => conversation.id === deletedId,
	);
	if (index < 0) return conversations[0]?.id ?? null;
	return conversations[index + 1]?.id ?? conversations[index - 1]?.id ?? null;
}

export function formatConversationUpdatedAt(
	value: string,
	now = new Date(),
): string {
	const updatedAt = new Date(value);
	if (Number.isNaN(updatedAt.getTime())) return "Recently";
	const elapsed = Math.max(0, now.getTime() - updatedAt.getTime());
	const minutes = Math.floor(elapsed / 60_000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days}d ago`;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	}).format(updatedAt);
}
