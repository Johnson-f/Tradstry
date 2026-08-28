"use client";

import {
	BookOpen01Icon,
	Calendar03Icon,
	Cancel01Icon,
	ChartLineData01Icon,
	Image01Icon,
	Loading03Icon,
	Note01Icon,
	TradeUpIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import type {
	AgentContextKind,
	AgentContextSearchResult,
} from "@tradstry/app-ui/lib/types/agents";
import { cn } from "@tradstry/app-ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { createCustomDateSelection } from "./context-mention-model";

const GROUPS: Array<{ kind: AgentContextKind; label: string }> = [
	{ kind: "TRADE", label: "Trades" },
	{ kind: "PLAYBOOK", label: "Playbooks" },
	{ kind: "NOTE", label: "Notes" },
	{ kind: "MEDIA", label: "Media" },
	{ kind: "MARKET", label: "Markets" },
	{ kind: "DATE_RANGE", label: "Dates" },
];

export function ContextIcon({
	kind,
	className,
}: {
	kind: AgentContextKind;
	className?: string;
}) {
	const icon =
		kind === "TRADE"
			? TradeUpIcon
			: kind === "PLAYBOOK"
				? BookOpen01Icon
				: kind === "NOTE"
					? Note01Icon
					: kind === "MEDIA"
						? Image01Icon
						: kind === "MARKET"
							? ChartLineData01Icon
							: Calendar03Icon;
	return <HugeiconsIcon icon={icon} strokeWidth={1.8} className={className} />;
}

export function ContextPicker({
	query,
	results,
	loading,
	error,
	activeIndex,
	selectedKeys,
	customRangeOpen,
	onActiveIndexChange,
	onSelect,
	onOpenCustomRange,
	onCloseCustomRange,
}: {
	query: string;
	results: AgentContextSearchResult[];
	loading: boolean;
	error: Error | null;
	activeIndex: number;
	selectedKeys: Set<string>;
	customRangeOpen: boolean;
	onActiveIndexChange: (index: number) => void;
	onSelect: (result: AgentContextSearchResult) => void;
	onOpenCustomRange: () => void;
	onCloseCustomRange: () => void;
}) {
	const [from, setFrom] = React.useState("");
	const [to, setTo] = React.useState("");
	const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

	React.useEffect(() => {
		optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	const choose = (result: AgentContextSearchResult) => {
		if (result.key === "date_range:custom") {
			onOpenCustomRange();
			return;
		}
		onSelect(result);
	};

	return (
		<motion.div
			role="listbox"
			aria-label="Attach context"
			onKeyDown={(event) => {
				if (event.key !== "Escape" || !customRangeOpen) return;
				event.preventDefault();
				event.stopPropagation();
				onCloseCustomRange();
			}}
			initial={{ opacity: 0, y: 5, scale: 0.99 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: 3, scale: 0.995 }}
			transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
			className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-30 max-h-[min(25rem,52vh)] overflow-hidden rounded-2xl border border-border/80 bg-popover shadow-[0_20px_60px_rgba(0,0,0,0.16)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.42)]"
		>
			<div className="flex items-center border-b border-border/60 px-3 py-2.5">
				<span className="text-xs font-medium">Add context</span>
				<span className="ml-2 min-w-0 truncate text-[0.65rem] text-muted-foreground">
					{query ? `Searching “${query}”` : "Search your workspace"}
				</span>
				{loading ? (
					<HugeiconsIcon
						icon={Loading03Icon}
						strokeWidth={1.8}
						className="ml-auto size-3.5 animate-spin text-muted-foreground"
					/>
				) : null}
			</div>

			{customRangeOpen ? (
				<div className="p-3">
					<div className="mb-3 flex items-center gap-2">
						<ContextIcon kind="DATE_RANGE" className="size-4" />
						<div>
							<div className="text-xs font-medium">Custom date range</div>
							<div className="text-[0.65rem] text-muted-foreground">
								Both dates are included
							</div>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<label className="space-y-1 text-[0.65rem] text-muted-foreground">
							<span>From</span>
							<input
								type="date"
								value={from}
								max={to || undefined}
								onChange={(event) => setFrom(event.target.value)}
								className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-foreground/30"
							/>
						</label>
						<label className="space-y-1 text-[0.65rem] text-muted-foreground">
							<span>To</span>
							<input
								type="date"
								value={to}
								min={from || undefined}
								onChange={(event) => setTo(event.target.value)}
								className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-foreground/30"
							/>
						</label>
					</div>
					<div className="mt-3 flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onCloseCustomRange}
						>
							Back
						</Button>
						<Button
							type="button"
							size="sm"
							disabled={!from || !to || from > to}
							onClick={() => onSelect(createCustomDateSelection({ from, to }))}
						>
							Add range
						</Button>
					</div>
				</div>
			) : error ? (
				<p className="px-3 py-5 text-center text-xs text-destructive">
					Couldn’t search your workspace.
				</p>
			) : !loading && !results.length ? (
				<p className="px-3 py-5 text-center text-xs text-muted-foreground">
					No matching context found.
				</p>
			) : (
				<div className="max-h-[min(21rem,45vh)] overflow-y-auto p-1.5">
					{GROUPS.map((group) => {
						const groupResults = results.filter(
							(result) => result.kind === group.kind,
						);
						if (!groupResults.length) return null;
						return (
							<div key={group.kind} className="pb-1.5 last:pb-0">
								<div className="px-2 pb-1 pt-1.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
									{group.label}
								</div>
								{groupResults.map((result) => {
									const index = results.indexOf(result);
									const selected = selectedKeys.has(result.key);
									return (
										<button
											ref={(node) => {
												optionRefs.current[index] = node;
											}}
											type="button"
											role="option"
											aria-selected={selected}
											onMouseEnter={() => onActiveIndexChange(index)}
											onClick={() => choose(result)}
											className={cn(
												"flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left outline-none transition-colors",
												index === activeIndex
													? "bg-muted"
													: "hover:bg-muted/60",
											)}
										>
											<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border/70">
												<ContextIcon kind={result.kind} className="size-4" />
											</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-xs font-medium">
													{result.title}
												</span>
												<span className="mt-0.5 block truncate text-[0.65rem] text-muted-foreground">
													{result.subtitle}
												</span>
											</span>
											{selected ? (
												<span className="text-[0.6rem] font-medium text-muted-foreground">
													Added
												</span>
											) : null}
										</button>
									);
								})}
							</div>
						);
					})}
				</div>
			)}
		</motion.div>
	);
}

export function ContextChips({
	selections,
	onRemove,
}: {
	selections: AgentContextSearchResult[];
	onRemove: (key: string) => void;
}) {
	return (
		<AnimatePresence initial={false}>
			{selections.length ? (
				<motion.div
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					exit={{ opacity: 0, height: 0 }}
					className="flex flex-wrap gap-1.5 overflow-hidden px-1 pb-2"
				>
					{selections.map((selection) => (
						<motion.span
							layout
							key={selection.key}
							initial={{ opacity: 0, scale: 0.94 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.94 }}
							className="flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 py-1 pl-2 pr-1 text-[0.65rem]"
						>
							<ContextIcon
								kind={selection.kind}
								className="size-3 shrink-0 text-muted-foreground"
							/>
							<span className="max-w-32 truncate">{selection.title}</span>
							<button
								type="button"
								aria-label={`Remove ${selection.title} context`}
								onClick={() => onRemove(selection.key)}
								className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
							>
								<HugeiconsIcon
									icon={Cancel01Icon}
									strokeWidth={2}
									className="size-3"
								/>
							</button>
						</motion.span>
					))}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
