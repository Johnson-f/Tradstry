"use client";

import {
	ArrowUp01Icon,
	Loading03Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import type { SkipReason } from "@tradstry/app-ui/lib/service/journal-flow";
import { SKIP_LABELS } from "../journal-display";
import { SkipMenuItems } from "../journal-skip-items";
import type { FooterStep } from "./footer-step";

function Note({ children }: { children: React.ReactNode }) {
	return <p className="min-w-0 flex-1 text-xs text-muted-foreground">{children}</p>;
}

export function TradeFooter({
	step,
	skipReason,
	readOnlyReason,
	marking,
	pendingReview,
	reviewAgainLabel,
	canMark,
	busy,
	onFixHistory,
	onWriteEntryNote,
	onWriteReview,
	onMarkReviewed,
	onEditReview,
	onSkip,
	onUndoSkip,
}: {
	step: FooterStep;
	skipReason: SkipReason | null;
	readOnlyReason: string;
	marking: boolean;
	pendingReview: boolean;
	reviewAgainLabel: string;
	canMark: boolean;
	busy: boolean;
	onFixHistory: () => void;
	onWriteEntryNote: () => void;
	onWriteReview: () => void;
	onMarkReviewed: () => void;
	onEditReview: () => void;
	onSkip: (reason: SkipReason) => void;
	onUndoSkip: () => void;
}) {
	switch (step.kind) {
		case "read-only":
			return <Note>{readOnlyReason}</Note>;
		case "fix-history":
			return (
				<>
					<Note>This trade is left out of your totals until the history adds up.</Note>
					<Button onClick={onFixHistory}>Fix history</Button>
				</>
			);
		case "write-entry-note":
			return (
				<>
					<Note>Write it while the trade is open. That’s when it’s honest.</Note>
					<Button onClick={onWriteEntryNote}>Write entry note</Button>
				</>
			);
		case "holding":
			return (
				<Note>
					{step.held ? `${step.held} held · ` : ""}You can review this once it exits.
				</Note>
			);
		case "edit-review":
			return (
				<>
					<p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
						<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} aria-hidden="true" className="size-3.5 text-emerald-600" />
						Reviewed
					</p>
					<Button variant="outline" onClick={onEditReview}>Edit review</Button>
				</>
			);
		case "undo-skip":
			return (
				<>
					<Note>Skipped{skipReason ? ` · ${SKIP_LABELS[skipReason]}` : ""}</Note>
					<Button variant="outline" disabled={busy} onClick={onUndoSkip}>Undo skip</Button>
				</>
			);
		case "review":
			return (
				<>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" disabled={busy}>
								Skip
								<HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent side="top" align="start" className="w-64">
							<SkipMenuItems onSkip={onSkip} />
						</DropdownMenuContent>
					</DropdownMenu>
					<span className="flex-1" />
					{step.onReviewTab ? (
						<Button aria-busy={marking} disabled={marking || !canMark} onClick={onMarkReviewed}>
							{marking ? (
								<>
									<HugeiconsIcon icon={Loading03Icon} strokeWidth={2} aria-hidden="true" className="motion-safe:animate-spin" />
									<span className="sr-only">Saving review</span>
								</>
							) : pendingReview ? (
								"Check pending review"
							) : step.again ? (
								reviewAgainLabel
							) : (
								"Mark reviewed"
							)}
						</Button>
					) : (
						<Button onClick={onWriteReview}>Write review</Button>
					)}
				</>
			);
	}
}
