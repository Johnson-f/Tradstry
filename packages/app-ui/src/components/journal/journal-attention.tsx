"use client";

import {
	Alert02Icon,
	ArrowDataTransferHorizontalIcon,
	Copy01Icon,
	LinkSquare02Icon,
	Notebook01Icon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	useKeepOrphanedNote,
	useUnjoinActions,
} from "@tradstry/app-ui/hooks/journal-review";
import type {
	ContinuationSuggestion,
	JournalTrade,
} from "@tradstry/app-ui/lib/service/journal-flow";
import {
	type AttentionItem,
	holdingsKey,
} from "./journal-attention-model";
import {
	ContinuationDialog,
	DuplicateDialog,
	FixHistoryDialog,
	suggestedStartingQuantity,
} from "./journal-dialogs";
import { useJournalNavigation } from "./journal-navigation";
import type { useJournalAttention } from "./use-journal-attention";

type Dialog =
	| { kind: "fix"; entryId: string }
	| { kind: "starting"; entryId: string; suggestedQuantity?: string }
	| { kind: "continuation"; suggestion: ContinuationSuggestion }
	| { kind: "duplicate"; trade: JournalTrade };

type Row = {
	icon: IconSvgElement;
	title: string;
	text: string;
	tradeId?: string;
	actions: { label: string; onClick: () => void }[];
};

type Answers = {
	open: (dialog: Dialog) => void;
	openTrade: (id: string) => void;
	wait: (key: string) => void;
	unjoin: (joinId: string) => void;
	keep: (noteId: string) => void;
};

function describe(item: AttentionItem, { open, openTrade, wait, unjoin, keep }: Answers): Row {
	switch (item.kind) {
		case "continuation":
			return {
				icon: ArrowDataTransferHorizontalIcon,
				title: "Possible ticker change",
				text: `${item.suggestion.fromSymbol} → ${item.suggestion.toSymbol}, same position? ${item.suggestion.explanation}`,
				actions: [{ label: "Review", onClick: () => open({ kind: "continuation", suggestion: item.suggestion }) }],
			};
		case "holdings": {
			const { mismatch } = item;
			return {
				icon: Alert02Icon,
				title: `Holdings don’t match · ${mismatch.symbol}`,
				text: `${mismatch.message} Broker holds ${mismatch.held} · imported history shows ${mismatch.imported}.`,
				tradeId: mismatch.entryId ?? undefined,
				actions: [
					...(mismatch.entryId
						? [{
								label: "Add starting position",
								onClick: () => open({
									kind: "starting",
									entryId: mismatch.entryId!,
									suggestedQuantity: suggestedStartingQuantity(mismatch.held, mismatch.imported),
								}),
							}]
						: []),
					{
						label: "Wait for next sync",
						onClick: () => {
							wait(holdingsKey(mismatch));
							toast(`${mismatch.symbol} is hidden for now. It comes back if the numbers change.`);
						},
					},
				],
			};
		}
		case "history":
			return {
				icon: Alert02Icon,
				title: `History can’t be calculated · ${item.trade.symbol}`,
				text: item.trade.issueMessage ?? "The executions don’t add up yet.",
				tradeId: item.trade.id,
				actions: [{ label: "Fix history", onClick: () => open({ kind: "fix", entryId: item.trade.id }) }],
			};
		case "duplicate":
			return {
				icon: Copy01Icon,
				title: `Possible duplicate · ${item.trade.symbol}`,
				text: "This trade is left out of your totals until you decide whether it is a trade you made twice.",
				tradeId: item.trade.id,
				actions: [{ label: "Review", onClick: () => open({ kind: "duplicate", trade: item.trade }) }],
			};
		case "outdated":
			return {
				icon: RefreshIcon,
				title: `Review results changed · ${item.trade.symbol}`,
				text: "A sync changed this trade after you reviewed it. Check the new results.",
				tradeId: item.trade.id,
				actions: [{ label: "Review again", onClick: () => openTrade(item.trade.id) }],
			};
		case "broken-join":
			return {
				icon: LinkSquare02Icon,
				title: `Combined fills no longer fit · ${item.join.symbol}`,
				text: "A sync moved one of the fills you combined, so they no longer sit side by side in one trade.",
				tradeId: item.join.entryId,
				actions: [{ label: "Undo combine", onClick: () => unjoin(item.join.joinId) }],
			};
		case "orphan":
			return {
				icon: Notebook01Icon,
				title: "Note on a removed execution",
				text: `${item.note.reason ? `“${item.note.reason}” was` : "A note was"} written on an execution your broker no longer reports. It isn’t deleted.`,
				actions: [{ label: "Keep as a record", onClick: () => keep(item.note.id) }],
			};
	}
}

export function JournalAttention({
	workspaceId,
	attention,
}: {
	workspaceId: string;
	attention: ReturnType<typeof useJournalAttention>;
}) {
	const nav = useJournalNavigation();
	const [dialog, setDialog] = React.useState<Dialog | null>(null);
	const openTrade = (id: string, trigger?: HTMLElement | null) => nav.openTrade(id, { trigger });
	const close = (open: boolean) => !open && setDialog(null);
	const unjoin = useUnjoinActions(workspaceId);
	const keepNote = useKeepOrphanedNote(workspaceId);
	const answer = (task: Promise<unknown>, done: string) =>
		task.then(() => toast(done)).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "That didn’t work. Try again."));
	const rows = attention.items.map((item) => ({
		item,
		row: describe(item, {
			open: setDialog,
			openTrade,
			wait: attention.wait,
			unjoin: (joinId) => void answer(unjoin.mutateAsync({ joinId }), "Fills are separate again"),
			keep: (noteId) => void answer(keepNote.mutateAsync({ noteId }), "Note kept as a record"),
		}),
	}));
	const renderRow = ({ item, row }: (typeof rows)[number]) => (
		<li key={item.id} className="flex flex-wrap items-start gap-3 p-4">
			<span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
				<HugeiconsIcon icon={row.icon} strokeWidth={2} aria-hidden="true" className="size-4" />
			</span>
			<div className="min-w-0 flex-1 basis-60">
				<h3 className="text-sm font-medium">{row.title}</h3>
				<p className="mt-0.5 text-xs text-muted-foreground">{row.text}</p>
				{row.tradeId && (
					<Button
						size="sm"
						variant="link"
						className="mt-1 h-auto px-0"
						onClick={(event) => openTrade(row.tradeId!, event.currentTarget)}
					>
						Open trade
					</Button>
				)}
			</div>
			{row.actions.length > 0 && (
				<div className="flex flex-wrap gap-2 max-sm:w-full">
					{row.actions.map((action, index) => (
						<Button key={action.label} size="sm" variant={index === 0 ? "default" : "outline"} onClick={action.onClick}>
							{action.label}
						</Button>
					))}
				</div>
			)}
		</li>
	);
	return (
		<div className="space-y-4">
			{attention.failed && <p className="text-xs text-muted-foreground">Some checks could not be loaded.</p>}
			{attention.loading ? (
				<p role="status" className="p-8 text-center text-sm text-muted-foreground">Checking your journal…</p>
			) : rows.length === 0 ? (
				<div className="rounded-xl border border-dashed p-8 text-center">
					<h2 className="text-sm font-medium">Nothing needs you</h2>
					<p className="mt-1.5 text-xs text-muted-foreground">Every trade adds up, and every review is current.</p>
				</div>
			) : (
				<>
					<p className="text-xs text-muted-foreground">
						These are waiting on you. Nothing here is guessed; each one needs your answer.
					</p>
					<ul className="divide-y rounded-xl border bg-card">{rows.map(renderRow)}</ul>
				</>
			)}
			{dialog?.kind === "fix" && (
				<FixHistoryDialog open onOpenChange={close} workspaceId={workspaceId} entryId={dialog.entryId} />
			)}
			{dialog?.kind === "starting" && (
				<FixHistoryDialog
					open
					onOpenChange={close}
					workspaceId={workspaceId}
					entryId={dialog.entryId}
					startingOnly
					suggestedQuantity={dialog.suggestedQuantity}
				/>
			)}
			{dialog?.kind === "continuation" && (
				<ContinuationDialog open onOpenChange={close} workspaceId={workspaceId} suggestion={dialog.suggestion} />
			)}
			{dialog?.kind === "duplicate" && (
				<DuplicateDialog open onOpenChange={close} workspaceId={workspaceId} trade={dialog.trade} />
			)}
		</div>
	);
}
