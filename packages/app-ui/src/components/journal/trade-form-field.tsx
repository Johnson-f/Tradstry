import type * as React from "react";
import { Label } from "@tradstry/app-ui/components/ui/label";
import { cn } from "@tradstry/app-ui/lib/utils";

export function TradeFormField({
	label,
	htmlFor,
	children,
	className,
}: {
	label: string;
	htmlFor?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
		</div>
	);
}
