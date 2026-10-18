import {
	DropdownMenuItem,
	DropdownMenuLabel,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import type { SkipReason } from "@tradstry/app-ui/lib/service/journal-flow";
import { SKIP_LABELS, SKIP_REASONS } from "./journal-display";

export function SkipMenuItems({ onSkip }: { onSkip: (reason: SkipReason) => void }) {
	return (
		<>
			<DropdownMenuLabel>Skip the review</DropdownMenuLabel>
			{SKIP_REASONS.map((reason) => (
				<DropdownMenuItem key={reason} onSelect={() => onSkip(reason)}>
					<span className="flex flex-col">
						{SKIP_LABELS[reason]}
						{reason === "review_later" && (
							<span className="text-[11px] text-muted-foreground">
								Comes back in the next daily review
							</span>
						)}
					</span>
				</DropdownMenuItem>
			))}
		</>
	);
}
