"use client";

import type * as React from "react";

import { cn } from "@tradstry/app-ui/lib/utils";

/**
 * Native scrollbars move with the viewport, including compositor-driven wheel/touch
 * scrolling. A separately positioned JavaScript thumb can lag behind that movement.
 *
 * Sizing gotcha: the viewport is `size-full` — `height: 100%` — so vertical scrolling needs
 * a parent with a *definite* height (`h-*`, or `flex-1 min-h-0` inside a bounded column).
 * A `max-h-*` on the root does nothing: 100% of an auto height is auto, and the content just
 * grows. When you want "grow to fit, capped", put the cap on the viewport instead:
 * `[&>[data-radix-scroll-area-viewport]]:max-h-56`.
 *
 * Keep the viewport marker and content wrapper used by existing sizing selectors and
 * viewport refs. Vertical content wraps normally; horizontal content can grow wider.
 */
function ScrollArea({
	className,
	children,
	orientation = "vertical",
	viewportRef,
	type = "auto",
	...props
}: React.ComponentProps<"div"> & {
	orientation?: "vertical" | "horizontal" | "both";
	viewportRef?: React.Ref<HTMLDivElement>;
	/** Native visibility follows the browser/OS preference unless space is always reserved. */
	type?: "auto" | "always";
}) {
	const overflow = type === "always" ? "scroll" : "auto";
	return (
		<div
			data-slot="scroll-area"
			className={cn("relative", className)}
			{...props}
		>
			<div
				ref={viewportRef}
				tabIndex={0}
				data-slot="scroll-area-viewport"
				data-radix-scroll-area-viewport=""
				className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]"
				style={{
					overflowX: orientation === "vertical" ? "hidden" : overflow,
					overflowY: orientation === "horizontal" ? "hidden" : overflow,
				}}
			>
				<div className={cn("min-w-full", orientation !== "vertical" && "table")}>
					{children}
				</div>
			</div>
		</div>
	);
}

export { ScrollArea };
