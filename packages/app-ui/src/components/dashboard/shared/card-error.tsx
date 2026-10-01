"use client";

import {
	Alert02Icon,
	ArrowReloadHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { cn } from "@tradstry/app-ui/lib/utils";

export type DashboardErrorCategory = "network" | "session" | "unknown";

function errorText(error: unknown) {
	if (error instanceof Error)
		return `${error.name} ${error.message}`.toLowerCase();
	return String(error ?? "").toLowerCase();
}

export function dashboardErrorCategory(error: unknown): DashboardErrorCategory {
	const message = errorText(error);
	if (
		/\b(401|403)\b|unauthori[sz]ed|forbidden|jwt|token.{0,20}expired|session.{0,20}expired/.test(
			message,
		)
	) {
		return "session";
	}
	if (
		/failed to fetch|network|load failed|connection|offline|timed? ?out|econn/.test(
			message,
		)
	) {
		return "network";
	}
	return "unknown";
}

export function dashboardErrorDescription(error: unknown) {
	switch (dashboardErrorCategory(error)) {
		case "network":
			return "We couldn’t reach Tradstry. Check your connection and try again.";
		case "session":
			return "Your session may have expired. Refresh the page or sign in again.";
		default:
			return "Something interrupted this view. Try again in a moment.";
	}
}

export function DashboardCardError({
	title,
	error,
	onRetry,
	className,
}: {
	title: string;
	error: unknown;
	onRetry: () => unknown;
	className?: string;
}) {
	return (
		<section
			role="alert"
			className={cn(
				"flex min-h-36 items-center rounded-2xl border border-amber-200/70 bg-amber-50/35 p-4 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/15",
				className,
			)}
		>
			<div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-start gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
						<HugeiconsIcon
							icon={Alert02Icon}
							className="size-4"
							strokeWidth={2}
							aria-hidden
						/>
					</div>
					<div className="min-w-0">
						<p className="text-sm font-semibold text-foreground">
							{title} couldn’t load
						</p>
						<p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
							{dashboardErrorDescription(error)}
						</p>
					</div>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="shrink-0"
					onClick={() => void onRetry()}
				>
					<HugeiconsIcon
						icon={ArrowReloadHorizontalIcon}
						className="size-3.5"
						strokeWidth={2}
						aria-hidden
					/>
					Try again
				</Button>
			</div>
		</section>
	);
}
