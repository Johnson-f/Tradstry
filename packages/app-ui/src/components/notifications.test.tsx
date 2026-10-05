import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Notification } from "@tradstry/app-ui/lib/types/notifications";
import { NotificationRow } from "./notifications";

const notification: Notification = {
	id: "notification-1",
	eventType: "AgentRunReady",
	title: "Tradstry AI finished your analysis",
	body: "Open the conversation to review the evidence-backed answer.",
	deepLink: "/dashboard?agentConversation=conversation-1",
	groupCount: 1,
	read: false,
	createdAt: "2026-10-03T12:00:00Z",
	updatedAt: "2026-10-03T12:00:00Z",
};

test("shortens the standard AI update and announces its unread state", () => {
	const html = renderToStaticMarkup(
		<NotificationRow notification={notification} onSelect={() => undefined} />,
	);
	expect(html).toContain("Your analysis is ready");
	expect(html).toContain("View the answer in your conversation.");
	expect(html).toContain("Unread:");
	expect(html).toMatch(/datetime="2026-10-03T12:00:00\.000Z"/i);
});

test("preserves specific notification content and grouped update counts", () => {
	const html = renderToStaticMarkup(
		<NotificationRow
			notification={{
				...notification,
				title: "Analysis of your last five trades",
				body: "Two entries exceeded the planned size.",
				groupCount: 3,
				read: true,
			}}
			onSelect={() => undefined}
		/>,
	);
	expect(html).toContain("Analysis of your last five trades");
	expect(html).toContain("Two entries exceeded the planned size.");
	expect(html).toContain("3 updates");
	expect(html).not.toContain("Unread:");
});

test("renders unknown notification types and unavailable dates safely", () => {
	const html = renderToStaticMarkup(
		<NotificationRow
			notification={{
				...notification,
				eventType: "FutureEvent",
				title: "Account update",
				body: "",
				createdAt: "invalid",
				deepLink: null,
			}}
			onSelect={() => undefined}
		/>,
	);
	expect(html).toContain("Account update");
	expect(html).not.toContain("Invalid Date");
	expect(html).not.toMatch(/datetime=/i);
});
