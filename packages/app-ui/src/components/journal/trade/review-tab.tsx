"use client";

import * as React from "react";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@tradstry/app-ui/components/ui/collapsible";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@tradstry/app-ui/components/ui/toggle-group";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { TradeFormField as Field } from "../trade-form-field";
import { BrokerDetails } from "./broker-details";
import { ReviewResults } from "./review-results";
import { ReviewSetup } from "./review-setup";
import { SaveFeedback, SaveStatus } from "./save-feedback";
import type { DetailData } from "./trade-types";
import { STOP_PRICE_ERROR, type TradeReview } from "./use-trade-review";

const CHOICES = [
	["entered_early", "Entered early"],
	["entered_late", "Entered late"],
	["moved_stop", "Moved my stop"],
	["exited_early", "Exited early"],
	["held_too_long", "Held too long"],
	["oversized", "Sized too big"],
	["sized_well", "Sized well"],
	["followed_exit_plan", "Followed my exit plan"],
] as const;
const ADHERENCE = [
	["yes", "Yes"],
	["partly", "Partly"],
	["no", "No"],
	["no_plan", "I had no plan"],
] as const;
const FIELD_CLASS =
	"w-full resize-none rounded-lg border border-input bg-muted/15 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60";

export function ReviewTab({
	workspaceId,
	trade,
	data,
	review,
	timezone,
	readOnly,
	locked,
	onFixHistory,
}: {
	workspaceId: string;
	trade: JournalTrade;
	data: DetailData;
	review: TradeReview;
	timezone?: string;
	readOnly: boolean;
	locked: boolean;
	onFixHistory: () => void;
}) {
	const { context, draft } = review;
	const id = React.useId();
	const [detailsOpen, setDetailsOpen] = React.useState(false);
	const closed = trade.lifecycleState === "closed";
	const frozen = readOnly || locked;
	const showStopError = review.stopTouched && !!review.stopError;
	const saveState = (["conflict", "failed", "saving", "pending"] as const).find(
		(state) => context.state === state || draft.state === state,
	) ?? "saved";
	React.useEffect(() => {
		// Keep details open while the user corrects a stop revealed by validation.
		if (showStopError) setDetailsOpen(true);
	}, [showStopError]);
	if (trade.lifecycleState === "incomplete")
		return (
			<div className="grid place-items-center gap-3 rounded-xl border border-dashed p-8 text-center">
				<h3 className="text-sm font-medium">Fix the history first</h3>
				<p className="max-w-sm text-xs text-muted-foreground">
					Results can’t be worked out until the history adds up.
				</p>
				{!readOnly && <Button onClick={onFixHistory}>Fix history</Button>}
			</div>
		);
	return (
		<div className="space-y-6">
			<ReviewResults workspaceId={workspaceId} trade={trade} />
			{!closed && (
				<p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
					You can review this once it exits.
				</p>
			)}
			{trade.reviewState === "outdated" && (
				<p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
					The results or context changed. Take another look before confirming.
				</p>
			)}
			{closed && (
				<section aria-label="Trade review" className="space-y-5">
					<div className="space-y-3">
						<div className="flex items-start justify-between gap-3">
							<div className="space-y-1">
								<label htmlFor={`${id}-takeaway`} className="text-sm font-semibold">Your takeaway</label>
								<p id={`${id}-takeaway-help`} className="text-xs text-muted-foreground">What you’ll repeat or change next time.</p>
							</div>
							<SaveStatus state={saveState} />
						</div>
						<textarea
							id={`${id}-takeaway`}
							aria-describedby={`${id}-takeaway-help`}
							disabled={frozen}
							value={draft.value.takeaway}
							onChange={(event) => draft.update({ ...draft.value, takeaway: event.target.value })}
							onBlur={() => void draft.flush().catch(() => {})}
							placeholder="A sentence is enough."
							maxLength={4000}
							rows={3}
							className={`${FIELD_CLASS} min-h-24`}
						/>
						{!frozen && <p className="text-[11px] text-muted-foreground">Saved automatically. Add a takeaway to mark reviewed.</p>}
					</div>
					<Field label="Followed your plan?">
						<ToggleGroup
							type="single"
							spacing={1}
							disabled={frozen}
							aria-label="Followed your plan"
							className="w-full flex-wrap rounded-lg bg-muted/60 p-1 sm:w-fit"
							value={draft.value.planAdherence ?? ""}
							onValueChange={(value) => draft.update({ ...draft.value, planAdherence: value || null })}
						>
							{ADHERENCE.map(([value, label]) => (
								<ToggleGroupItem key={value} value={value} className="h-8 grow px-3 font-normal text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">{label}</ToggleGroupItem>
							))}
						</ToggleGroup>
					</Field>
				</section>
			)}
			<div className="space-y-2 empty:hidden">
				<SaveFeedback
					error={context.error === STOP_PRICE_ERROR ? null : context.error}
					state={context.state}
					onRetry={() => context.flush()}
					onResolve={() => review.resolveConflict("context")}
				/>
				<SaveFeedback
					error={draft.error}
					state={draft.state}
					onRetry={() => draft.flush()}
					onResolve={() => review.resolveConflict("draft")}
				/>
			</div>
			<div>
				<Collapsible open={detailsOpen || showStopError} onOpenChange={setDetailsOpen} className="group/details border-t">
					<div className="flex items-center gap-3">
						<CollapsibleTrigger className="flex min-w-0 flex-1 items-center justify-between gap-3 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
							<span className="space-y-1">
								<span className="block text-sm font-medium">Trade Detail</span>
								<span className="block text-xs text-muted-foreground">Tags, playbook, risk and notes</span>
							</span>
							<HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-data-[state=open]/details:rotate-180" />
						</CollapsibleTrigger>
						{!closed && <SaveStatus state={saveState} />}
					</div>
					{/* Keep the stop input mounted so validation can reveal and focus it. */}
					<CollapsibleContent forceMount className="pt-1 pb-5 data-[state=closed]:hidden">
						<ReviewSetup workspaceId={workspaceId} trade={trade} data={data} review={review} disabled={frozen} />
					</CollapsibleContent>
				</Collapsible>
				{closed && (
					<Collapsible defaultOpen={draft.value.choiceIds.length > 0} className="group/patterns border-t">
						<CollapsibleTrigger className="flex w-full items-center justify-between gap-3 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
							<span className="text-sm font-medium">Trade Pattern</span>
							<span className="ml-auto text-xs text-muted-foreground">{draft.value.choiceIds.length ? `${draft.value.choiceIds.length} selected` : "Optional"}</span>
							<HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-data-[state=open]/patterns:rotate-180" />
						</CollapsibleTrigger>
						<CollapsibleContent className="pb-4">
							<ToggleGroup
								type="multiple"
								spacing={1}
								disabled={frozen}
								aria-label="Trade Pattern"
								className="grid w-full grid-cols-1 sm:grid-cols-2"
								value={draft.value.choiceIds}
								onValueChange={(choiceIds) => draft.update({ ...draft.value, choiceIds })}
							>
								{CHOICES.map(([value, label]) => (
									<ToggleGroupItem key={value} value={value} className="h-auto min-h-9 justify-start gap-2 whitespace-normal px-2.5 py-2 text-left font-normal">
										<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} aria-hidden="true" className="size-3.5 shrink-0 opacity-0 group-data-[state=on]/toggle:opacity-100" />
										{label}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</CollapsibleContent>
					</Collapsible>
				)}
				<BrokerDetails trade={trade} timezone={timezone} />
			</div>
		</div>
	);
}
