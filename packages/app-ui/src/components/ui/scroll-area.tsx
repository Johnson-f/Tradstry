"use client";

import type * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";

import { cn } from "@tradstry/app-ui/lib/utils";

/**
 * Sizing gotcha: the viewport is `size-full` — `height: 100%` — so vertical scrolling needs
 * a parent with a *definite* height (`h-*`, or `flex-1 min-h-0` inside a bounded column).
 * A `max-h-*` on the root does nothing: 100% of an auto height is auto, and the content just
 * grows. When you want "grow to fit, capped", put the cap on the viewport instead:
 * `[&>[data-radix-scroll-area-viewport]]:max-h-56`.
 *
 * Vertical content wraps normally; horizontal content can grow wider.
 */
function ScrollArea({
	className,
	children,
	orientation = "vertical",
	viewportRef,
	type = "auto",
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
	orientation?: "vertical" | "horizontal" | "both";
	viewportRef?: React.Ref<HTMLDivElement>;
}) {
	return (
		<ScrollAreaPrimitive.Root
			data-slot="scroll-area"
			className={cn("relative", className)}
			type={type}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				ref={viewportRef}
				tabIndex={0}
				data-slot="scroll-area-viewport"
				className={cn(
					"size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
					orientation === "vertical" && "[&>div]:block!",
				)}
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			{orientation !== "horizontal" && <ScrollBar />}
			{orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	);
}

function ScrollBar({
	className,
	orientation = "vertical",
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
	return (
		<ScrollAreaPrimitive.ScrollAreaScrollbar
			data-slot="scroll-area-scrollbar"
			data-orientation={orientation}
			orientation={orientation}
			className={cn(
				"flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
				className,
			)}
			{...props}
		>
			<ScrollAreaPrimitive.ScrollAreaThumb
				data-slot="scroll-area-thumb"
				className="relative flex-1 rounded-full bg-border"
			/>
		</ScrollAreaPrimitive.ScrollAreaScrollbar>
	);
}

export { ScrollArea, ScrollBar };
