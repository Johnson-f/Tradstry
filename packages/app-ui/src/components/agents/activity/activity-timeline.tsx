"use client";

import { AiBrain01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@tradstry/app-ui/components/ui/collapsible";
import { useAgentMessageActivity } from "@tradstry/app-ui/hooks/agents";
import type {
	AgentActivityEntry,
	AgentActivitySummary,
	AgentRunStatus,
} from "@tradstry/app-ui/lib/types/agents";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import { motion } from "motion/react";
import * as React from "react";
import {
	foldActivityEntries,
	thinkingHeaderLabel,
	thinkingNarrative,
} from "./activity-model";
import { ActivityNeuralNetwork } from "./activity-neural-network";
import { ActivityRow } from "./activity-row";

export function AgentActivityTimeline({
	messageId,
	summary,
	liveEntries = [],
	runStatus = summary?.status ?? "COMPLETED",
	running = false,
	error = null,
}: {
	messageId?: string;
	summary?: AgentActivitySummary;
	liveEntries?: AgentActivityEntry[];
	runStatus?: AgentRunStatus;
	running?: boolean;
	error?: Error | null;
}) {
	const { theme, kind } = useTradstryPlatform();
	const [open, setOpen] = React.useState(running);
	const wasRunning = React.useRef(running);
	const detail = useAgentMessageActivity(
		messageId ?? null,
		open && !running && Boolean(messageId),
	);

	React.useEffect(() => {
		if (running) setOpen(true);
		if (wasRunning.current && !running) setOpen(false);
		wasRunning.current = running;
	}, [running]);

	const entries = foldActivityEntries(
		running ? liveEntries : (detail.data?.entries ?? liveEntries),
		runStatus,
	);
	const label = thinkingHeaderLabel({
		running,
		hasError: Boolean(error),
		summary,
		entries,
	});

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="group/thinking flex min-h-8 w-full items-center gap-2 rounded-md py-1 text-left text-muted-foreground transition-[color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:text-foreground/75 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
				>
					<HugeiconsIcon
						icon={AiBrain01Icon}
						strokeWidth={1.7}
						className="size-[1.05rem] shrink-0"
					/>
					<span className="min-w-0 flex-1 truncate text-sm font-medium tracking-[-0.01em]">
						{label}
					</span>
					{running ? (
						<span className="size-1.5 shrink-0 rounded-full bg-foreground/45 motion-safe:animate-pulse" />
					) : null}
					<HugeiconsIcon
						icon={ArrowDown01Icon}
						strokeWidth={1.8}
						className={cn(
							"size-3.5 shrink-0 transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
							open && "rotate-180",
						)}
					/>
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<motion.div
					initial={{ opacity: 0, transform: "translateY(-2px)" }}
					animate={{ opacity: 1, transform: "translateY(0px)" }}
					transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
					className="pb-2 pl-7 pr-1"
				>
					<ActivityNeuralNetwork
						entries={entries}
						runStatus={detail.data?.summary.status ?? runStatus}
						reconnecting={Boolean(error || detail.error)}
						loading={!running && detail.isLoading}
						theme={theme}
						enableParticles={kind === "web"}
					/>
					<p className="mt-2.5 text-xs leading-5 text-muted-foreground/70">
						{thinkingNarrative({
							running,
							hasError: Boolean(error),
							entries,
						})}
					</p>
					{error ? (
						<p className="mt-2 text-[0.68rem] text-muted-foreground">
							Reconnecting to live activity…
						</p>
					) : null}
					{detail.isLoading && !running ? (
						<p className="mt-2 text-[0.68rem] text-muted-foreground">
							Loading saved activity…
						</p>
					) : null}
					{detail.error && !running ? (
						<button
							type="button"
							onClick={() => void detail.refetch()}
							className="mt-2 text-[0.68rem] text-destructive underline-offset-2 hover:underline"
						>
							Couldn’t load saved activity. Retry
						</button>
					) : null}
					{entries.length ? (
						<div className="mt-2.5 border-l border-border/55 pl-3">
							{entries.map((entry) => (
								<ActivityRow key={entry.activityId} entry={entry} />
							))}
						</div>
					) : null}
					{!entries.length && !detail.isLoading && !error ? (
						<p className="mt-2 text-[0.68rem] text-muted-foreground">
							{running ? "Starting…" : "No saved activity for this response."}
						</p>
					) : null}
				</motion.div>
			</CollapsibleContent>
		</Collapsible>
	);
}
