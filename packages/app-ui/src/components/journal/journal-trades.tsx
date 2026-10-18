"use client";

import {
	Cancel01Icon,
	FilterIcon,
	GitMergeIcon,
	Search01Icon,
	Sorting05Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@tradstry/app-ui/components/ui/table";
import {
	useJournalTrades,
	useRefreshJournal,
} from "@tradstry/app-ui/hooks/journal-review";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import { cn } from "@tradstry/app-ui/lib/utils";
import { netClass, ToneBadge } from "./journal-badges";
import { reviewBadge, stateBadge } from "./journal-display";
import { formatR, money, tradeSpan } from "./journal-format";
import { GroupingDialog } from "./journal-grouping";
import { useJournalNavigation } from "./journal-navigation";
import {
	type FilterGroup,
	filterChips,
	filterTrades,
	initialFilters,
	LIFECYCLE_OPTIONS,
	NO_FILTERS,
	REVIEW_OPTIONS,
	SORT_OPTIONS,
	type SortKey,
	sortTrades,
	toggleFilter,
	type TradeFilters,
} from "./journal-trades-model";

function openQuantity(trade: JournalTrade) {
	return trade.lifecycleState === "open" && trade.remainingQuantity ? trade.remainingQuantity : "—";
}

function FilterGroupBox({
	group,
	title,
	options,
	filters,
	onToggle,
}: {
	group: FilterGroup;
	title: string;
	options: readonly { value: string; label: string }[];
	filters: TradeFilters;
	onToggle: (group: FilterGroup, value: string) => void;
}) {
	const id = React.useId();

	return (
		<fieldset className="min-w-0 p-1.5">
			<legend className="float-left w-full px-2.5 pt-1.5 pb-2 text-[11px] font-medium text-muted-foreground">
				{title}
			</legend>
			<div className="clear-both space-y-0.5">
				{options.map((option) => {
					const checked = filters[group].includes(option.value);
					const optionId = `${id}-${option.value}`;

					return (
						<Label
							key={option.value}
							htmlFor={optionId}
							className={cn(
								"min-h-8 cursor-pointer gap-2.5 rounded-md px-2.5 py-2 font-normal hover:bg-accent focus-within:bg-accent",
								checked && "bg-accent text-accent-foreground",
							)}
						>
							<Checkbox
								id={optionId}
								checked={checked}
								onCheckedChange={() => onToggle(group, option.value)}
								className="cursor-pointer after:hidden data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
							/>
							<span className="leading-4">{option.label}</span>
						</Label>
					);
				})}
			</div>
		</fieldset>
	);
}

export function JournalTrades({
	workspaceId,
	timezone,
	enabled,
	symbolParam,
	statusParam,
}: {
	workspaceId: string;
	timezone?: string;
	enabled: boolean;
	symbolParam: string | null;
	statusParam: string | null;
}) {
	const nav = useJournalNavigation();
	const platform = useTradstryPlatform();
	const trades = useJournalTrades(workspaceId);
	const refresh = useRefreshJournal(workspaceId);
	const [search, setSearch] = React.useState("");
	const [filters, setFilters] = React.useState<TradeFilters>(NO_FILTERS);
	const [sort, setSort] = React.useState<SortKey>("newest");
	const [selected, setSelected] = React.useState<string[]>([]);
	const [merging, setMerging] = React.useState(false);
	React.useEffect(() => {
		if (symbolParam) setSearch(symbolParam);
		if (statusParam) setFilters(initialFilters(statusParam));
	}, [symbolParam, statusParam]);
	const entries = trades.data ?? [];
	const list = sortTrades(filterTrades(entries, search, filters), sort);
	const chips = filterChips(filters);
	const selectedTrades = entries.filter((trade) => selected.includes(trade.id));
	const toggle = (group: FilterGroup, value: string) => setFilters(toggleFilter(filters, group, value));
	const select = (id: string, checked: boolean) =>
		setSelected(checked ? [...selected, id] : selected.filter((item) => item !== id));
	const selectable = (trade: JournalTrade) => !!trade.episodeId && trade.lifecycleState !== "incomplete";

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-0 flex-1 basis-56 sm:max-w-xs">
					<HugeiconsIcon icon={Search01Icon} strokeWidth={2} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						aria-label="Search trades"
						placeholder="Search symbol or company…"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="h-9 pl-8"
					/>
				</div>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="lg"
							className={cn("h-9 gap-1.5", chips.length > 0 && "border-foreground/20 bg-muted")}
						>
							<HugeiconsIcon icon={FilterIcon} strokeWidth={2} aria-hidden="true" />
							Filters
							{chips.length > 0 && <Badge className="min-w-4 justify-center tabular-nums">{chips.length}</Badge>}
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="start"
						aria-label="Trade filters"
						className="max-h-(--radix-popover-content-available-height) w-64 max-w-(--radix-popover-content-available-width) overflow-y-auto overscroll-contain p-0"
					>
						<div className="flex items-center justify-between border-b px-4 py-2.5">
							<span className="text-xs font-medium">Filters</span>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="-mr-2 text-muted-foreground"
								disabled={chips.length === 0}
								onClick={() => setFilters(NO_FILTERS)}
							>
								Clear all
							</Button>
						</div>
						<FilterGroupBox group="lifecycle" title="Trade status" options={LIFECYCLE_OPTIONS} filters={filters} onToggle={toggle} />
						<div className="border-t">
							<FilterGroupBox group="review" title="Review status" options={REVIEW_OPTIONS} filters={filters} onToggle={toggle} />
						</div>
					</PopoverContent>
				</Popover>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="lg" className="h-9" aria-label="Sort trades">
							<HugeiconsIcon icon={Sorting05Icon} strokeWidth={2} aria-hidden="true" />
							{SORT_OPTIONS.find((option) => option.value === sort)?.label}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-44">
						<DropdownMenuRadioGroup value={sort} onValueChange={(value) => setSort(value as SortKey)}>
							{SORT_OPTIONS.map((option) => (
								<DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
				<span role="status" className="ml-auto text-xs text-muted-foreground">{list.length} trades</span>
			</div>
			{chips.length > 0 && (
				<div className="flex flex-wrap items-center gap-1.5">
					{chips.map((chip) => (
						<span key={`${chip.group}:${chip.value}`} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-xs">
							{chip.label}
							<button
								type="button"
								aria-label={`Remove ${chip.label} filter`}
								className="grid size-4 place-items-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => toggle(chip.group, chip.value)}
							>
								<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" className="size-3" />
							</button>
						</span>
					))}
					<Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>Clear all</Button>
				</div>
			)}
			{trades.isLoading ? (
				<p role="status" className="p-8 text-center text-sm text-muted-foreground">Loading your trades…</p>
			) : trades.isError ? (
				<div className="p-8 text-center text-sm">
					<p>We couldn’t load your journal.</p>
					<Button className="mt-3" variant="outline" onClick={() => void trades.refetch()}>Retry</Button>
				</div>
			) : list.length === 0 ? (
				<div className="grid min-h-48 place-content-center gap-3 rounded-xl border border-dashed p-8 text-center">
					<h2 className="text-sm font-medium">{entries.length ? "No trades match" : "Your trades will show up here"}</h2>
					<p className="max-w-sm text-xs text-muted-foreground">
						{entries.length
							? "Try another symbol or clear the filters."
							: "Connect your brokerage to bring in your executions, or add a trade yourself."}
					</p>
					{!entries.length && (
						<Button className="mx-auto" variant="outline" onClick={() => platform.navigate("/dashboard/brokerage")}>
							Go to brokerage
						</Button>
					)}
				</div>
			) : (
				<>
					<div className="hidden overflow-hidden rounded-xl border md:block">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10"><span className="sr-only">Select</span></TableHead>
									<TableHead>Trade</TableHead>
									<TableHead>Dates</TableHead>
									<TableHead>State</TableHead>
									<TableHead className="text-right">Open qty</TableHead>
									<TableHead className="text-right">Net</TableHead>
									<TableHead className="text-right">R</TableHead>
									<TableHead>Review</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{list.map((trade) => (
									<TableRow
										key={trade.id}
										className="cursor-pointer"
										data-state={selected.includes(trade.id) ? "selected" : undefined}
										onClick={(event) => nav.openTrade(trade.id, { trigger: event.currentTarget.querySelector<HTMLElement>("[data-trade-open]") })}
									>
										<TableCell onClick={(event) => event.stopPropagation()}>
											<Checkbox
												aria-label={`Select ${trade.symbol} trade`}
												checked={selected.includes(trade.id)}
												disabled={!selectable(trade)}
												onCheckedChange={(checked) => select(trade.id, checked === true)}
											/>
										</TableCell>
										<TableCell>
											<button
												type="button"
												data-trade-open
												className="rounded-sm text-left text-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
												onClick={(event) => {
													event.stopPropagation();
													nav.openTrade(trade.id, { trigger: event.currentTarget });
												}}
											>
												{trade.symbol}
											</button>
											{trade.sourceKind === "manual" && <Badge variant="secondary" className="ml-2">Manual</Badge>}
											<p className="mt-0.5 max-w-60 truncate text-muted-foreground capitalize">
												{[trade.symbolName, trade.direction].filter(Boolean).join(" · ")}
											</p>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{tradeSpan(trade, timezone)}
											{!trade.openDate && trade.executionCount > 0 && (
												<p className="mt-0.5">{trade.executionCount} executions</p>
											)}
										</TableCell>
										<TableCell><ToneBadge spec={stateBadge(trade)} /></TableCell>
										<TableCell className="text-right tabular-nums">{openQuantity(trade)}</TableCell>
										<TableCell className={cn("text-right font-medium tabular-nums", netClass(trade.realizedNet))}>
											{money(trade.realizedNet, trade.currency)}
										</TableCell>
										<TableCell className="text-right text-muted-foreground tabular-nums">{formatR(trade.realizedR)}</TableCell>
										<TableCell><ToneBadge spec={reviewBadge(trade)} /></TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<ul className="divide-y rounded-xl border md:hidden">
						{list.map((trade) => (
							<li key={trade.id} className="flex items-start gap-3 p-3">
								<Checkbox
									className="mt-0.5"
									aria-label={`Select ${trade.symbol} trade`}
									checked={selected.includes(trade.id)}
									disabled={!selectable(trade)}
									onCheckedChange={(checked) => select(trade.id, checked === true)}
								/>
								<button
									type="button"
									className="min-w-0 flex-1 space-y-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onClick={(event) => nav.openTrade(trade.id, { trigger: event.currentTarget })}
								>
									<span className="flex items-baseline justify-between gap-3">
										<span className="text-sm font-semibold">
											{trade.symbol} <span className="text-xs font-normal capitalize text-muted-foreground">{trade.direction}</span>
										</span>
										<span className={cn("text-sm font-medium tabular-nums", netClass(trade.realizedNet))}>
											{money(trade.realizedNet, trade.currency)}
										</span>
									</span>
									<span className="flex flex-wrap items-center gap-1.5">
										<ToneBadge spec={stateBadge(trade)} />
										<ToneBadge spec={reviewBadge(trade)} />
									</span>
									<span className="block text-xs text-muted-foreground">{tradeSpan(trade, timezone)}</span>
								</button>
							</li>
						))}
					</ul>
				</>
			)}
			{selected.length > 1 && (
				<div
					role="region"
					aria-label="Selected trades"
					className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border bg-popover px-4 py-2.5 text-xs shadow-lg"
				>
					<span>{selected.length} selected</span>
					<span className="flex items-center gap-2">
						<Button size="sm" disabled={!enabled} onClick={() => setMerging(true)}>
							<HugeiconsIcon icon={GitMergeIcon} strokeWidth={2} aria-hidden="true" />
							Merge {selected.length} trades
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
					</span>
				</div>
			)}
			<GroupingDialog
				open={merging}
				onOpenChange={setMerging}
				workspaceId={workspaceId}
				entries={selectedTrades}
				mode="merge"
				onDone={async () => {
					const count = selected.length;
					setSelected([]);
					await refresh();
					toast.success(`Merged ${count} trades`);
				}}
			/>
		</div>
	);
}
