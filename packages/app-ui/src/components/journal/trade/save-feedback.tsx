"use client";

import {
	AlertCircleIcon,
	Loading03Icon,
	PencilEdit01Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { cn } from "@tradstry/app-ui/lib/utils";

const SAVE_LABELS: Record<string, string> = {
	saved: "Saved",
	saving: "Saving…",
	pending: "Editing",
	conflict: "Conflict",
	failed: "Save failed",
};

export function SaveStatus({ state }: { state: string }) {
	const failed = state === "failed" || state === "conflict";
	return (
		<span
			aria-live="polite"
			aria-atomic="true"
			className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground"
		>
			<HugeiconsIcon
				icon={
					state === "saved"
						? Tick02Icon
						: state === "saving"
							? Loading03Icon
							: failed
								? AlertCircleIcon
								: PencilEdit01Icon
				}
				strokeWidth={1.8}
				aria-hidden="true"
				className={cn(
					"size-3.5 shrink-0",
					state === "saving" && "motion-safe:animate-spin",
					failed && "text-destructive",
				)}
			/>
			{SAVE_LABELS[state] ?? state}
		</span>
	);
}

export function SaveFeedback({
	error,
	state,
	onRetry,
	onResolve,
}: {
	error: string | null;
	state: string;
	onRetry: () => Promise<unknown>;
	onResolve: () => Promise<void>;
}) {
	if (!error) return null;
	return (
		<div role="alert" className="rounded-lg bg-destructive/5 p-3 text-xs">
			<p className="text-destructive">{error}</p>
			<div className="mt-2 flex flex-wrap gap-2">
				<Button size="sm" variant="outline" onClick={() => void onRetry().catch(() => {})}>
					Retry saving
				</Button>
				{state === "conflict" && (
					<Button size="sm" variant="outline" onClick={() => void onResolve().catch(() => {})}>
						Keep my changes
					</Button>
				)}
			</div>
		</div>
	);
}
