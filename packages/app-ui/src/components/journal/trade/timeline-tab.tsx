"use client";

import * as React from "react";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@tradstry/app-ui/components/ui/collapsible";
import {
	useJoinActions,
	useTradeActions,
	useTradeOutcome,
	useUnjoinActions,
} from "@tradstry/app-ui/hooks/journal-review";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { JournalChart } from "../journal-chart";
import { JournalSuggestions } from "../journal-suggestions";
import { ActionRow } from "./action-row";
import { errorText } from "./action-notes";
import { executionsFor, suggestedJoinFor } from "./timeline-model";
import type { DetailData, EditorTarget } from "./trade-types";

function ChartSection({
	workspaceId,
	trade,
}: {
	workspaceId: string;
	trade: JournalTrade;
}) {
	const [open, setOpen] = React.useState(
		() =>
			typeof window === "undefined" ||
			window.matchMedia("(min-width: 768px)").matches,
	);
	const toggleRef = React.useRef<HTMLButtonElement>(null);
	return (
		<Collapsible
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				requestAnimationFrame(() => toggleRef.current?.focus());
			}}
			className="border-b pb-5"
		>
			{!open && (
				<CollapsibleTrigger
					ref={toggleRef}
					className="flex w-full items-center justify-between gap-3 rounded-sm py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span className="text-sm font-medium">Price history</span>
					<span className="ml-auto text-xs text-muted-foreground">
						Show chart
					</span>
					<HugeiconsIcon
						icon={ArrowDown01Icon}
						strokeWidth={1.8}
						aria-hidden="true"
						className="size-4 text-muted-foreground"
					/>
				</CollapsibleTrigger>
			)}
			<CollapsibleContent>
				<JournalChart
					workspaceId={workspaceId}
					entryId={trade.id}
					revision={trade.materializedRevision}
					headerAction={
						<CollapsibleTrigger asChild>
							<Button
								ref={toggleRef}
								size="icon-sm"
								variant="ghost"
								aria-label="Hide price history"
								className="text-muted-foreground"
							>
								<HugeiconsIcon
									icon={ArrowUp01Icon}
									strokeWidth={1.8}
									aria-hidden="true"
								/>
							</Button>
						</CollapsibleTrigger>
					}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}

function Actions({
	workspaceId,
	trade,
	data,
	timezone,
	readOnly,
	editor,
	onEdit,
}: {
	workspaceId: string;
	trade: JournalTrade;
	data: DetailData;
	timezone?: string;
	readOnly: boolean;
	editor: EditorTarget | null;
	onEdit: (target: EditorTarget | null) => void;
}) {
	const actions = useTradeActions(workspaceId, trade.id);
	const outcome = useTradeOutcome(workspaceId, trade.id, !!trade.episodeId);
	const join = useJoinActions(workspaceId);
	const unjoin = useUnjoinActions(workspaceId);
	const separate = async (joinId: string) => {
		try {
			await unjoin.mutateAsync({ joinId });
			toast.success("Fills are separate again");
		} catch (reason) {
			toast.error(errorText(reason));
		}
	};
	const combine = async (executionIds: string[]) => {
		try {
			const joinId = await join.mutateAsync({
				entryId: trade.id,
				executionIds,
			});
			toast.success(`Combined ${executionIds.length} fills into one`, {
				action: { label: "Undo", onClick: () => void separate(joinId) },
			});
		} catch (reason) {
			toast.error(errorText(reason));
		}
	};
	if (actions.isLoading)
		return (
			<p role="status" className="py-4 text-sm text-muted-foreground">
				Loading actions…
			</p>
		);
	if (actions.isError || !actions.data)
		return (
			<div className="rounded-xl border p-4 text-sm">
				<p>The actions for this trade could not be loaded.</p>
				<Button
					className="mt-2"
					variant="outline"
					size="sm"
					onClick={() => void actions.refetch()}
				>
					Retry
				</Button>
			</div>
		);
	const { actions: list, suggestedJoins } = actions.data;
	if (!list.length)
		return (
			<p className="rounded-xl border p-4 text-sm text-muted-foreground">
				This trade has no broker executions, so it has no actions.
			</p>
		);
	return (
		<section aria-label="Trade activity" className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<h3 className="text-sm font-medium">Trade activity</h3>
				<span className="text-[11px] text-muted-foreground">
					{list.length} {list.length === 1 ? "action" : "actions"}
				</span>
			</div>
			<ol aria-label="Actions">
				{list.map((action, index) => (
					<ActionRow
						key={action.anchorExecutionId + action.role}
						workspaceId={workspaceId}
						trade={trade}
						action={action}
						executions={executionsFor(action, data.journalExecutionsV2)}
						landing={outcome.data?.actions.find(
							(item) => item.anchorExecutionId === action.anchorExecutionId,
						)}
						suggestion={suggestedJoinFor(action, suggestedJoins)}
						followedByMore={index < list.length - 1}
						timezone={timezone}
						readOnly={readOnly}
						busy={join.isPending || unjoin.isPending}
						editor={editor}
						onEdit={onEdit}
						onCombine={(ids) => void combine(ids)}
						onUnjoin={(joinId) => void separate(joinId)}
						onReload={() => void actions.refetch()}
					/>
				))}
			</ol>
		</section>
	);
}

export function TimelineTab({
	workspaceId,
	trade,
	data,
	timezone,
	readOnly,
	editor,
	onEdit,
	onChanged,
}: {
	workspaceId: string;
	trade: JournalTrade;
	data: DetailData;
	timezone?: string;
	readOnly: boolean;
	editor: EditorTarget | null;
	onEdit: (target: EditorTarget | null) => void;
	onChanged: () => void | Promise<void>;
}) {
	return (
		<div className="space-y-6">
			<ChartSection workspaceId={workspaceId} trade={trade} />
			{trade.episodeId ? (
				<Actions
					workspaceId={workspaceId}
					trade={trade}
					data={data}
					timezone={timezone}
					readOnly={readOnly}
					editor={editor}
					onEdit={onEdit}
				/>
			) : (
				!data.journalExecutionsV2.length && (
					<p className="rounded-xl border p-4 text-sm text-muted-foreground">
						This manually recorded trade has no linked broker executions.
					</p>
				)
			)}
			{trade.lifecycleState === "open" && trade.remainingQuantity && (
				<p className="text-xs text-muted-foreground">
					{trade.remainingQuantity} still held. New executions show up here as
					they sync.
				</p>
			)}
			{!readOnly && trade.episodeId && (
				<JournalSuggestions
					workspaceId={workspaceId}
					trade={trade}
					onChanged={onChanged}
				/>
			)}
		</div>
	);
}
