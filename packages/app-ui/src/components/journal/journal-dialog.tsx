"use client";

import type * as React from "react";
import { DialogContent } from "@tradstry/app-ui/components/ui/dialog";
import { cn } from "@tradstry/app-ui/lib/utils";

export function JournalDialogContent({
	className,
	...props
}: React.ComponentProps<typeof DialogContent>) {
	return (
		<DialogContent
			className={cn(
				"max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none",
				className,
			)}
			{...props}
		/>
	);
}
