"use client";

import {
	ArrowDown01Icon,
	MinusSignIcon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import type {
	Execution,
	JournalTrade,
	OutcomeAction,
	TradeAction,
} from "@tradstry/app-ui/lib/service/journal-flow";
import { cn } from "@tradstry/app-ui/lib/utils";
import { ExecutionHeldBy } from "../journal-grouping";
import { executionTime, formatR, money, tradeDate } from "../journal-format";
import {
	ACTION_LABELS,
	AddNoteButton,
	HindsightEditor,
	NoteEditor,
	NoteText,
} from "./action-notes";
import type { EditorTarget } from "./trade-types";

function actionTime(action: TradeAction, timezone?: string) {
	const format = (value: string) =>
		new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
			timeZone: timezone,
		}).format(new Date(value));
	return action.firstExecutedAt === action.lastExecutedAt
		? format(action.firstExecutedAt)
		: `${format(action.firstExecutedAt)} to ${format(action.lastExecutedAt)}`;
}

function ExecutionList({
	executions,
	currency,
	timezone,
}: {
	executions: Execution[];
	currency: string | null;
	timezone?: string;
}) {
	return (
		<ul className="mt-3 divide-y border-y border-border/60 bg-muted/20 text-xs">
			{executions.map((execution, index) => (
				<li
					key={`${execution.transactionId}:${execution.role}:${index}`}
					className="grid gap-x-4 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]"
				>
					<span className="text-muted-foreground">
						{execution.startingPosition
							? `Starting position · ${tradeDate(execution.executedAt, timezone)}`
							: executionTime(execution, timezone)}
					</span>
					<span className="tabular-nums sm:text-right">
						{execution.side} {execution.quantity} at{" "}
						{money(execution.price, currency)}
						<span className="text-muted-foreground">
							{" "}
							· {money(execution.fee, currency)} fee
						</span>
					</span>
					{execution.heldBy.length > 0 && (
						<div className="sm:col-span-2">
							<ExecutionHeldBy holders={execution.heldBy} timezone={timezone} />
						</div>
					)}
				</li>
			))}
		</ul>
	);
}

export function ActionRow({
	workspaceId,
	trade,
	action,
	executions,
	landing,
	suggestion,
	followedByMore,
	timezone,
	readOnly,
	busy,
	editor,
	onEdit,
	onCombine,
	onUnjoin,
	onReload,
}: {
	workspaceId: string;
	trade: JournalTrade;
	action: TradeAction;
	executions: Execution[];
	landing: OutcomeAction | undefined;
	suggestion: string[] | undefined;
	followedByMore: boolean;
	timezone?: string;
	readOnly: boolean;
	busy: boolean;
	editor: EditorTarget | null;
	onEdit: (target: EditorTarget | null) => void;
	onCombine: (executionIds: string[]) => void;
	onUnjoin: (joinId: string) => void;
	onReload: () => void;
}) {
	const [expanded, setExpanded] = React.useState(false);
	const detailsId = React.useId();
	const plan = action.notes.find((note) => note.kind === "plan");
	const hindsight = action.notes.filter(
		(note) => note.kind === "hindsight" && note.parentId === plan?.id,
	);
	const editing =
		editor?.anchorExecutionId === action.anchorExecutionId ? editor.kind : null;
	const open = (kind: EditorTarget["kind"]) =>
		onEdit({ anchorExecutionId: action.anchorExecutionId, kind });
	const isEntry = action.kind === "entry";
	const buying = action.kind === "entry" || action.kind === "add";
	return (
		<li
			className={cn(
				"relative flex gap-3",
				followedByMore &&
					"pb-6 after:absolute after:top-8 after:bottom-0 after:left-3.5 after:w-px after:bg-border",
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
					buying
						? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
						: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
				)}
			>
				<HugeiconsIcon
					icon={buying ? PlusSignIcon : MinusSignIcon}
					strokeWidth={1.8}
					className="size-3.5"
				/>
			</span>
			<div className="min-w-0 flex-1 pt-0.5">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className="text-sm font-medium">
						{ACTION_LABELS[action.kind]}
					</span>
					<span className="text-sm text-muted-foreground tabular-nums">
						{action.quantity} @ {money(action.price, trade.currency)}
					</span>
					{landing?.distanceFromStopR && (
						<Badge variant="secondary" className="tabular-nums">
							{formatR(landing.distanceFromStopR)} vs stop
						</Badge>
					)}
					{action.joinId && <Badge variant="secondary">Combined</Badge>}
					{!readOnly && !action.joinId && suggestion && (
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							title={`${suggestion.length} executions on the same side at the same price, seconds apart. They may be one order.`}
							onClick={() => onCombine(suggestion)}
						>
							Combine?
						</Button>
					)}
					<span className="w-full text-[11px] text-muted-foreground tabular-nums sm:ml-auto sm:w-auto">
						{actionTime(action, timezone)}
					</span>
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
					<span className="tabular-nums">
						Position after: {action.positionAfter}
					</span>
					<span aria-hidden="true">·</span>
					<button
						type="button"
						aria-expanded={expanded}
						aria-controls={detailsId}
						className="inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() => setExpanded(!expanded)}
					>
						{action.executionIds.length}{" "}
						{action.executionIds.length === 1 ? "execution" : "executions"}
						<HugeiconsIcon
							icon={ArrowDown01Icon}
							className={cn(
								"size-3 transition-transform motion-reduce:transition-none",
								expanded && "rotate-180",
							)}
							aria-hidden="true"
						/>
					</button>
					{!readOnly && action.joinId && (
						<>
							<span aria-hidden="true">·</span>
							<button
								type="button"
								disabled={busy}
								className="rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
								onClick={() => onUnjoin(action.joinId!)}
							>
								Undo combine
							</button>
						</>
					)}
				</div>
				<div id={detailsId} hidden={!expanded}>
					{expanded && (
						<ExecutionList
							executions={executions}
							currency={trade.currency}
							timezone={timezone}
						/>
					)}
				</div>
				{editing === "note" ? (
					<NoteEditor
						workspaceId={workspaceId}
						entryId={trade.id}
						action={action}
						note={plan}
						followedByMore={followedByMore}
						onReload={onReload}
						onClose={() => onEdit(null)}
					/>
				) : plan ? (
					<div className="mt-3 space-y-2 border-l-2 border-border/70 py-1 pl-3">
						<NoteText note={plan} action={action} currency={trade.currency} />
						{!readOnly && (
							<div className="flex flex-wrap items-center gap-2">
								{plan.locked ? (
									editing !== "hindsight" && (
										<AddNoteButton
											label="Hindsight note"
											onClick={() => open("hindsight")}
										/>
									)
								) : (
									<>
										<Button
											size="sm"
											variant="outline"
											onClick={() => open("note")}
										>
											Edit
										</Button>
										<span className="text-[11px] text-muted-foreground">
											Editable until the next execution
										</span>
									</>
								)}
							</div>
						)}
					</div>
				) : isEntry && !readOnly ? (
					<div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-muted/35 px-3 py-2.5">
						<div className="min-w-0 flex-1 space-y-0.5">
							<p className="text-xs font-medium">No entry note</p>
							<p className="text-[11px] text-muted-foreground">
								Record your reason, stop and target.
							</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							className="h-7"
							onClick={() => open("note")}
						>
							Write entry note
						</Button>
					</div>
				) : (
					!readOnly && (
						<AddNoteButton label="Add a note" onClick={() => open("note")} />
					)
				)}
				{hindsight.map((note) => (
					<div key={note.id} className="mt-2 rounded-xl bg-muted/40 px-3 py-2">
						<p className="mb-1 text-[11px] font-medium text-muted-foreground">
							Hindsight note
						</p>
						<NoteText note={note} currency={trade.currency} />
					</div>
				))}
				{editing === "hindsight" && plan && (
					<HindsightEditor
						workspaceId={workspaceId}
						parentId={plan.id}
						onClose={() => onEdit(null)}
					/>
				)}
			</div>
		</li>
	);
}
