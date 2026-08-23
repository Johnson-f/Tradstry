"use client";

import {
	ArrowUpRight01Icon,
	Delete02Icon,
	PencilEdit01Icon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tradstry/app-ui/components/ui/empty";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@tradstry/app-ui/components/ui/tabs";
import {
	useDeletePlaybook,
	usePlaybooks,
} from "@tradstry/app-ui/hooks/playbook";
import type { PlaybookWithStats } from "@tradstry/app-ui/lib/types/playbook";
import { cn } from "@tradstry/app-ui/lib/utils";
import * as React from "react";
import { toast } from "sonner";
import { CreatePlaybookDialog } from "./create-playbook";
import { EditPlaybookDialog } from "./edit-playbook";
import { PrinciplesTab } from "./principles-tab";
import { RulesView } from "./rules-view";

const currencyFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

function formatPercent(value: number) {
	return `${value.toFixed(2)}%`;
}

function formatUsd(value: number) {
	return currencyFormatter.format(value);
}

function Stat({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: "profit" | "loss";
}) {
	return (
		<div className="bg-card px-3 py-2.5">
			<dt className="text-[0.58rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
				{label}
			</dt>
			<dd
				className={cn(
					"mt-0.5 text-sm font-semibold tabular-nums",
					tone === "profit" && "text-profit",
					tone === "loss" && "text-loss",
				)}
			>
				{value}
			</dd>
		</div>
	);
}

function PlaybookCard({
	playbook,
	index,
	confirming,
	deleting,
	onConfirmingChange,
	onDelete,
}: {
	playbook: PlaybookWithStats;
	index: number;
	confirming: boolean;
	deleting: boolean;
	onConfirmingChange: (open: boolean) => void;
	onDelete: () => void;
}) {
	return (
		<article
			className="playbook-card-enter group relative flex h-[31rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-border/75 bg-card transition-colors duration-200 hover:border-foreground/20"
			style={
				{
					"--playbook-delay": `${Math.min(index, 8) * 45}ms`,
				} as React.CSSProperties
			}
		>
			<header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
				<div className="min-w-0">
					<div className="flex min-w-0 items-center gap-2">
						<h3 className="truncate text-base font-semibold tracking-[-0.02em]">
							{playbook.name}
						</h3>
						<Badge variant="outline" className="shrink-0 text-[0.58rem]">
							{playbook.availability === "all"
								? "All accounts"
								: `${playbook.workspaceIds.length} ${playbook.workspaceIds.length === 1 ? "account" : "accounts"}`}
						</Badge>
					</div>
					<p className="mt-1 truncate text-xs text-muted-foreground">
						Edge · {playbook.edgeName}
					</p>
				</div>

				<div className="flex shrink-0 items-center gap-0.5 opacity-65 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
					<EditPlaybookDialog
						playbook={playbook}
						trigger={
							<Button
								variant="ghost"
								size="icon-sm"
								className="text-muted-foreground"
							>
								<HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
								<span className="sr-only">Edit playbook</span>
							</Button>
						}
					/>
					<Popover open={confirming} onOpenChange={onConfirmingChange}>
						<PopoverTrigger asChild>
							<Button
								size="icon-sm"
								variant="ghost"
								className="text-muted-foreground hover:text-destructive"
								disabled={deleting}
							>
								<HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
								<span className="sr-only">Delete playbook</span>
							</Button>
						</PopoverTrigger>
						<PopoverContent align="end" className="space-y-3">
							<div className="space-y-1">
								<p className="text-sm font-semibold">Delete playbook?</p>
								<p className="text-sm text-muted-foreground">
									This permanently deletes {playbook.name} and removes it from
									linked trades.
								</p>
							</div>
							<div className="flex justify-end gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => onConfirmingChange(false)}
								>
									Cancel
								</Button>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={deleting}
									onClick={onDelete}
								>
									{deleting ? "Deleting..." : "Delete"}
								</Button>
							</div>
						</PopoverContent>
					</Popover>
				</div>
			</header>

			<dl className="grid grid-cols-2 gap-px border-y border-border/65 bg-border/65 sm:grid-cols-4">
				<Stat label="Win rate" value={formatPercent(playbook.winRate)} />
				<Stat
					label="Net P&L"
					value={formatUsd(playbook.cumulativeProfit)}
					tone={playbook.cumulativeProfit >= 0 ? "profit" : "loss"}
				/>
				<Stat label="Avg gain" value={formatUsd(playbook.averageGain)} />
				<Stat label="Avg loss" value={formatUsd(playbook.averageLoss)} />
			</dl>

			<div className="min-h-0 flex-1 px-4 py-4">
				<div className="mb-3 flex items-center justify-between">
					<p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						Execution rules
					</p>
					<span className="text-[0.6rem] text-muted-foreground">
						Scroll to review
					</span>
				</div>
				<RulesView
					entryRules={playbook.entryRules}
					exitRules={playbook.exitRules}
					positionSizingRules={playbook.positionSizingRules}
					additionalRules={playbook.additionalRules}
					className="h-[14rem]"
					columns
				/>
			</div>

			<footer className="flex h-12 shrink-0 items-center justify-between border-t border-border/65 px-4">
				<span className="text-xs text-muted-foreground">
					{playbook.tradeCount} linked{" "}
					{playbook.tradeCount === 1 ? "trade" : "trades"}
				</span>
				<EditPlaybookDialog
					playbook={playbook}
					trigger={
						<Button variant="ghost" size="sm" className="-mr-2">
							Open playbook
							<HugeiconsIcon
								icon={ArrowUpRight01Icon}
								strokeWidth={2}
								className="transition-transform duration-200 group-hover/button:translate-x-0.5 motion-reduce:transition-none"
							/>
						</Button>
					}
				/>
			</footer>
		</article>
	);
}

export function Playbook() {
	const playbooksQuery = usePlaybooks();
	const deletePlaybook = useDeletePlaybook();
	const [confirmingPlaybookId, setConfirmingPlaybookId] = React.useState<
		string | null
	>(null);
	const playbooks = playbooksQuery.data ?? [];

	async function handleDelete(id: string, name: string) {
		const toastId = toast.loading(`Deleting ${name}...`);
		try {
			await deletePlaybook.mutateAsync(id);
			toast.success("Playbook deleted.", { id: toastId });
			setConfirmingPlaybookId(null);
		} catch (submissionError) {
			toast.error(
				submissionError instanceof Error
					? submissionError.message
					: "Failed to delete playbook.",
				{ id: toastId },
			);
		}
	}

	return (
		<Tabs defaultValue="playbooks" className="gap-3">
			<div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
				<TabsList>
					<TabsTrigger value="playbooks">Playbooks</TabsTrigger>
					<TabsTrigger value="principles">Principles</TabsTrigger>
				</TabsList>
				<CreatePlaybookDialog />
			</div>

			<TabsContent value="playbooks">
				{playbooksQuery.isLoading ? (
					<div className="grid gap-4 lg:grid-cols-2">
						<div className="h-[31rem] animate-pulse rounded-2xl bg-muted" />
						<div className="h-[31rem] animate-pulse rounded-2xl bg-muted" />
					</div>
				) : null}

				{playbooksQuery.isError ? (
					<p className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
						Failed to load playbooks.
					</p>
				) : null}

				{!playbooksQuery.isLoading && playbooks.length === 0 ? (
					<Empty layout="page">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
							</EmptyMedia>
							<EmptyTitle>No playbooks yet</EmptyTitle>
							<EmptyDescription>
								Create a playbook to start tracking rules and stats.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<CreatePlaybookDialog
								trigger={
									<Button size="lg">
										<HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
										Create Playbook
									</Button>
								}
							/>
						</EmptyContent>
					</Empty>
				) : null}

				{!playbooksQuery.isLoading && playbooks.length > 0 ? (
					<div className="grid gap-4 lg:grid-cols-2">
						{playbooks.map((playbook, index) => (
							<PlaybookCard
								key={playbook.id}
								playbook={playbook}
								index={index}
								confirming={confirmingPlaybookId === playbook.id}
								deleting={deletePlaybook.isPending}
								onConfirmingChange={(open) =>
									setConfirmingPlaybookId(open ? playbook.id : null)
								}
								onDelete={() => handleDelete(playbook.id, playbook.name)}
							/>
						))}
					</div>
				) : null}
			</TabsContent>

			<TabsContent value="principles">
				<PrinciplesTab />
			</TabsContent>
		</Tabs>
	);
}
