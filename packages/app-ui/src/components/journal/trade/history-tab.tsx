"use client";

import { Button } from "@tradstry/app-ui/components/ui/button";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { tradeDate } from "../journal-format";
import { useJournalNavigation } from "../journal-navigation";
import type { DetailData } from "./trade-types";

export function HistoryTab({
	trade,
	data,
	readOnly,
	onUndo,
}: {
	trade: JournalTrade;
	data: DetailData;
	readOnly: boolean;
	onUndo: (operationId: string) => void;
}) {
	const { switchTrade } = useJournalNavigation();
	const reviews = data.journalReviewHistoryV2 ?? [];
	const changes = data.journalGroupingHistoryV2;
	if (!reviews.length && !changes.length)
		return (
			<div className="rounded-xl border px-6 py-12 text-center">
				<h3 className="text-sm font-medium">No history yet</h3>
				<p className="mt-2 text-sm text-muted-foreground">
					Saved reviews and grouping changes will appear here.
				</p>
			</div>
		);
	return (
		<div className="space-y-4">
			{changes.length > 0 && (
				<details open className="rounded-xl border px-4 py-3">
					<summary className="cursor-pointer text-sm font-medium">Grouping history</summary>
					<div className="mt-3">
						{changes.map((operation) => (
							<div key={operation.id} className="flex flex-wrap items-center gap-2 border-t py-3 text-sm">
								<span className="mr-auto capitalize">
									{operation.kind} · {tradeDate(operation.createdAt)}
									{operation.state === "undone" ? " · undone" : ""}
								</span>
								{operation.entryIds
									?.filter((id) => id !== trade.id)
									.map((id) => (
										<Button key={id} size="sm" variant="link" onClick={() => switchTrade(id)}>
											Related trade
										</Button>
									))}
								{operation.state === "committed" && !readOnly && (
									<Button size="sm" variant="outline" onClick={() => onUndo(operation.id)}>
										Undo
									</Button>
								)}
							</div>
						))}
					</div>
				</details>
			)}
			{reviews.length > 0 && (
				<details open className="rounded-xl border px-4 py-3">
					<summary className="cursor-pointer text-sm font-medium">
						Earlier reviews <span className="ml-1 text-xs text-muted-foreground">{reviews.length}</span>
					</summary>
					<div className="mt-3 space-y-3">
						{reviews.map((review) => (
							<article key={review.id} className="border-t pt-3 text-sm">
								<p className="text-xs text-muted-foreground">
									Review {review.version} · {tradeDate(review.createdAt)}
									{review.entryRevision !== trade.materializedRevision ? " · earlier results" : ""}
								</p>
								<p className="mt-2 whitespace-pre-wrap">
									{review.takeaway ||
										"Completed in the previous journal. Original reflection is preserved in your data export."}
								</p>
								{review.choiceIds.length > 0 && (
									<p className="mt-2 text-xs text-muted-foreground">{review.choiceIds.join(" · ")}</p>
								)}
							</article>
						))}
					</div>
				</details>
			)}
		</div>
	);
}
