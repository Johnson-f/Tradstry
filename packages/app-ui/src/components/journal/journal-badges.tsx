import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { cn } from "@tradstry/app-ui/lib/utils";
import { type BadgeSpec, netTone, type Tone } from "./journal-display";

const TONE_CLASSES: Record<Tone, string> = {
	good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	bad: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
	warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
	info: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
	muted: "bg-muted text-muted-foreground",
};

export function ToneBadge({
	spec,
	className,
}: {
	spec: BadgeSpec;
	className?: string;
}) {
	return (
		<Badge className={cn(TONE_CLASSES[spec.tone], className)}>{spec.text}</Badge>
	);
}

export function netClass(value: string | null) {
	const tone = netTone(value);
	return tone === "good"
		? "text-emerald-700 dark:text-emerald-400"
		: tone === "bad"
			? "text-rose-700 dark:text-rose-400"
			: undefined;
}

export function DirectionBadge({ direction }: { direction: string }) {
	return (
		<Badge
			className={cn(
				"capitalize",
				direction === "long"
					? TONE_CLASSES.good
					: direction === "short"
						? TONE_CLASSES.bad
						: TONE_CLASSES.muted,
			)}
		>
			{direction}
		</Badge>
	);
}
