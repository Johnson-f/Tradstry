"use client";

import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import type { TradeAlert } from "./trade-alerts-model";

const ACTION_LABELS: Record<TradeAlert["kind"], (alert: TradeAlert) => string> = {
	successor: () => "Open current trade",
	history: () => "Fix history",
	duplicate: (alert) => (alert.kind === "duplicate" && alert.blocking ? "Keep as a separate trade" : "Compare"),
	holdings: () => "Add starting position",
	continuation: () => "Review",
	join: () => "Undo combine",
};

export function TradeAlerts({
	alerts,
	readOnly,
	busy,
	onAct,
}: {
	alerts: TradeAlert[];
	readOnly: boolean;
	busy: boolean;
	onAct: (alert: TradeAlert) => void;
}) {
	if (!alerts.length) return null;
	return (
		<section
			aria-label="Needs attention on this trade"
			className="divide-y divide-amber-500/20 rounded-xl border border-amber-500/20 bg-amber-500/5"
		>
			{alerts.map((alert) => (
				<div key={alert.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
					<HugeiconsIcon icon={Alert02Icon} strokeWidth={2} aria-hidden="true" className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
					<p className="min-w-0 flex-1 text-xs text-amber-900 dark:text-amber-200">{alert.text}</p>
					{(alert.kind === "successor" ? !!alert.successorId : !readOnly) && (
						<Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(alert)}>
							{ACTION_LABELS[alert.kind](alert)}
						</Button>
					)}
				</div>
			))}
		</section>
	);
}
