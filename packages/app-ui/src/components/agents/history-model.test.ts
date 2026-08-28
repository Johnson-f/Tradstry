import { describe, expect, test } from "bun:test";
import type { AgentConversation } from "@tradstry/app-ui/lib/types/agents";
import {
	formatConversationUpdatedAt,
	nextConversationAfterDelete,
} from "./history-model";

function conversation(id: string): AgentConversation {
	return {
		id,
		workspaceId: "workspace-1",
		title: id,
		createdAt: "2026-08-27T00:00:00Z",
		updatedAt: "2026-08-27T00:00:00Z",
	};
}

describe("agent history model", () => {
	test("selects the following chat, then the previous chat after deletion", () => {
		const conversations = [
			conversation("a"),
			conversation("b"),
			conversation("c"),
		];
		expect(nextConversationAfterDelete(conversations, "b")).toBe("c");
		expect(nextConversationAfterDelete(conversations, "c")).toBe("b");
		expect(nextConversationAfterDelete([conversation("a")], "a")).toBeNull();
	});

	test("formats recent and older update times compactly", () => {
		const now = new Date("2026-08-27T12:00:00Z");
		expect(formatConversationUpdatedAt("2026-08-27T11:59:40Z", now)).toBe(
			"Just now",
		);
		expect(formatConversationUpdatedAt("2026-08-27T11:42:00Z", now)).toBe(
			"18m ago",
		);
		expect(formatConversationUpdatedAt("2026-08-26T12:00:00Z", now)).toBe(
			"Yesterday",
		);
		expect(formatConversationUpdatedAt("2026-08-20T12:00:00Z", now)).toBe(
			"Aug 20",
		);
	});
});
