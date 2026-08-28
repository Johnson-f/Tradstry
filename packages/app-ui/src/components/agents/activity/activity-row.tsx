import {
	AiBrain01Icon,
	AlertCircleIcon,
	BotIcon,
	CheckmarkCircle02Icon,
	Loading03Icon,
	Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AgentActivityEntry } from "@tradstry/app-ui/lib/types/agents";
import { cn } from "@tradstry/app-ui/lib/utils";
import { formatActivityDuration } from "./activity-model";

export function ActivityRow({ entry }: { entry: AgentActivityEntry }) {
	const detail =
		entry.detail ??
		entry.metadata.symbol ??
		entry.metadata.dateRangeLabel ??
		(entry.metadata.recordCount !== null
			? `${entry.metadata.recordCount} records`
			: null);
	const failed = ["FAILED", "INTERRUPTED"].includes(entry.status);
	const active = entry.status === "STARTED";
	return (
		<div
			className={cn(
				"relative flex min-w-0 items-start gap-2 py-1",
				entry.parentActivityId && "ml-4",
			)}
		>
			<span
				className={cn(
					"mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground/75",
					active && "text-foreground/70",
					failed && "text-amber-700 dark:text-amber-300",
				)}
			>
				<HugeiconsIcon
					icon={statusIcon(entry)}
					strokeWidth={1.8}
					className={cn(
						"size-3",
						active && "animate-spin motion-reduce:animate-none",
					)}
				/>
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-baseline gap-2">
					<span
						className={cn(
							"truncate text-[0.68rem] font-medium text-foreground/75",
							failed && "text-amber-800 dark:text-amber-200",
						)}
					>
						{entry.label}
					</span>
					{entry.durationMs !== null ? (
						<span className="ml-auto shrink-0 text-[0.6rem] tabular-nums text-muted-foreground/65">
							{formatActivityDuration(entry.durationMs)}
						</span>
					) : null}
				</div>
				{detail ? (
					<p className="mt-0.5 line-clamp-2 text-[0.63rem] leading-4 text-muted-foreground/70">
						{detail}
					</p>
				) : null}
			</div>
		</div>
	);
}

function statusIcon(entry: AgentActivityEntry) {
	if (entry.status === "STARTED") return Loading03Icon;
	if (entry.status === "FAILED" || entry.status === "INTERRUPTED") {
		return AlertCircleIcon;
	}
	if (entry.status === "COMPLETED") return CheckmarkCircle02Icon;
	if (entry.category === "SUBAGENT") return BotIcon;
	if (entry.category === "TOOL") return Wrench01Icon;
	return AiBrain01Icon;
}
