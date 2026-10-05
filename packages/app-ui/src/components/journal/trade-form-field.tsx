import type * as React from "react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import { cn } from "@tradstry/app-ui/lib/utils";

export function TradeFieldHelp({
	label,
	description,
}: {
	label: string;
	description: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={`About ${label}`}
					className="inline-flex shrink-0 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
				>
					<HugeiconsIcon
						icon={InformationCircleIcon}
						className="size-4"
						strokeWidth={2}
						aria-hidden
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={6}
				className="max-w-64 px-3 py-2 text-left"
			>
				{description}
			</TooltipContent>
		</Tooltip>
	);
}

export function TradeFormField({
	label,
	description,
	htmlFor,
	children,
	className,
}: {
	label: string;
	description?: string;
	htmlFor?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<div className="flex items-center gap-1.5">
				<Label htmlFor={htmlFor}>{label}</Label>
				{description && (
					<TradeFieldHelp label={label} description={description} />
				)}
			</div>
			{children}
		</div>
	);
}
