import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tradstry/app-ui/hooks/brokerage", () => ({
	useReportBrokerageDataIssue: () => ({
		isPending: false,
		mutateAsync: async () => ({
			id: "report-1",
			diagnosticId: "diag-1",
			createdAt: "2026-08-22T00:00:00Z",
		}),
		reset: () => undefined,
	}),
}));

const { SyncConfidenceCard } = await import("./sync-confidence-card");

test("groups brokerage health and sync metrics into one compact overview", () => {
	const html = renderToStaticMarkup(
		<SyncConfidenceCard
			workspaceId="workspace-cash"
			workspaceName="Webull Individual Cash"
			brokerageAccountName="Webull Individual Cash"
			outcome={{
				diagnosticId: "diag-1",
				status: "completed",
				error: null,
				startedAt: "2026-08-22T00:59:00Z",
				finishedAt: "2026-08-22T01:00:00Z",
				succeededAt: "2026-08-22T01:00:00Z",
				nextScheduledAt: "2026-08-22T06:00:00Z",
				transactionsSynced: 797,
				holdingsSynced: 0,
				balancesSynced: 1,
			}}
			reconciliation={undefined}
			connectionDisabled={false}
			isRefreshing={false}
			isSyncing={false}
			isReconnecting={false}
			onSync={() => undefined}
			onReconnect={() => undefined}
		/>,
	);

	expect(html).toContain('aria-label="Brokerage sync overview"');
	expect(html).toContain("797");
	expect(html).toContain("Transactions");
	expect(html).toContain("Last successful");
});
