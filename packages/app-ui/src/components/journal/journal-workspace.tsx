"use client";

import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Progress } from "@tradstry/app-ui/components/ui/progress";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@tradstry/app-ui/components/ui/tabs";
import {
	useJournalStatus,
	useJournalTrades,
	useRefreshJournal,
} from "@tradstry/app-ui/hooks/journal-review";
import type { FlowStatus } from "@tradstry/app-ui/lib/service/journal-flow";
import { CreateTrades } from "./create-trades";
import { JournalAttention } from "./journal-attention";
import {
	JournalNavigationProvider,
	useJournalLocation,
} from "./journal-navigation";
import { JournalSetup } from "./journal-setup";
import { JournalToday } from "./journal-today";
import { JournalTrades } from "./journal-trades";
import { TradeSheet } from "./trade/trade-sheet";
import { useJournalAttention } from "./use-journal-attention";
import type { JournalView } from "./journal-route";

function SyncLine({ status, failed }: { status: FlowStatus | undefined; failed: boolean }) {
	if (failed) return <>Sync status unavailable</>;
	if (status?.importState === "offline") return <>Offline · showing saved trades</>;
	if (status?.importState === "failed") return <>Sync needs attention</>;
	if (status && status.sourceRevision > status.projectionRevision)
		return (
			<>
				<span className="sr-only">Updating your journal…</span>
				<Progress value={null} aria-label="Updating your journal" className="h-1.5 w-36" />
			</>
		);
	return <>{status?.enabled ? "Trades sync automatically" : "Automatic journal is not enabled yet"}</>;
}

export function JournalWorkspace({ workspaceId }: { workspaceId: string }) {
	const nav = useJournalLocation();
	const status = useJournalStatus(workspaceId, 8_000);
	const trades = useJournalTrades(workspaceId);
	const attention = useJournalAttention(workspaceId);
	const refresh = useRefreshJournal(workspaceId);
	const timezone = status.data?.timezone;
	const needsHistoryCheck = (trades.data ?? []).some((trade) => trade.lifecycleState === "incomplete");
	const showSetup = !!status.data && (!status.data.enabled || (needsHistoryCheck && nav.view !== "today"));
	return (
		<JournalNavigationProvider value={nav}>
			<Tabs
				value={nav.view}
				onValueChange={(view) => nav.goTo(view as JournalView)}
				className="min-h-0 min-w-0 flex-1 gap-4 p-3 md:p-5"
			>
				<div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
					<TabsList variant="line" aria-label="Journal views">
						<TabsTrigger value="today">Today</TabsTrigger>
						<TabsTrigger value="trades">Trades</TabsTrigger>
						<TabsTrigger value="attention">
							Needs attention
							{attention.count > 0 && <Badge className="ml-1">{attention.count}</Badge>}
						</TabsTrigger>
					</TabsList>
					<div className="ml-auto flex items-center gap-4">
						<div className="hidden text-xs text-muted-foreground sm:block" aria-live="polite">
							<SyncLine status={status.data} failed={status.isError} />
						</div>
						<CreateTrades trigger={<Button variant="outline" size="sm">Add a manual trade</Button>} />
					</div>
				</div>
				{showSetup && (
					<div className="shrink-0">
						<JournalSetup workspaceId={workspaceId} enabled={status.data!.enabled} onDone={refresh} />
					</div>
				)}
				<div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
					<TabsContent value="today">
						<JournalToday workspaceId={workspaceId} timezone={timezone} dateParam={nav.params.get("date")} />
					</TabsContent>
					<TabsContent value="trades">
						<JournalTrades
							workspaceId={workspaceId}
							timezone={timezone}
							enabled={!!status.data?.enabled}
							symbolParam={nav.params.get("symbol")}
							statusParam={nav.params.get("status")}
						/>
					</TabsContent>
					<TabsContent value="attention">
						<JournalAttention workspaceId={workspaceId} attention={attention} />
					</TabsContent>
				</div>
			</Tabs>
			<TradeSheet workspaceId={workspaceId} />
		</JournalNavigationProvider>
	);
}
