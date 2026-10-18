"use client";

import * as React from "react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerTitle,
} from "@tradstry/app-ui/components/ui/drawer";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@tradstry/app-ui/components/ui/sheet";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { useTradeDetail } from "@tradstry/app-ui/hooks/journal-review";
import { useIsMobile } from "@tradstry/app-ui/hooks/use-mobile";
import { useJournalNavigation } from "../journal-navigation";
import { TradeSheetView } from "./trade-sheet-view";

type EscapeGuard = (event: Event) => void;

function SheetSkeleton() {
	return (
		<div role="status" className="flex-1 space-y-4 p-5">
			<span className="sr-only">Loading trade…</span>
			<div aria-hidden="true" className="space-y-4 [&_[data-slot=skeleton]]:motion-reduce:animate-none">
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-2">
						<Skeleton className="h-6 w-40" />
						<Skeleton className="h-3 w-56" />
					</div>
					<Skeleton className="h-6 w-20" />
				</div>
				<Skeleton className="h-8 w-72" />
				<Skeleton className="h-40 w-full rounded-xl" />
				<Skeleton className="h-24 w-full rounded-xl" />
			</div>
		</div>
	);
}

function SheetContents({
	workspaceId,
	entryId,
	registerEscape,
	onClose,
}: {
	workspaceId: string;
	entryId: string;
	registerEscape: (guard: EscapeGuard | null) => void;
	onClose: () => void;
}) {
	const detail = useTradeDetail(workspaceId, entryId);
	if (detail.isLoading) return <SheetSkeleton />;
	if (detail.isError || !detail.data?.journalTradeV2)
		return (
			<div className="space-y-3 p-6 text-sm">
				<p>This trade could not be loaded.</p>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => void detail.refetch()}>Retry</Button>
					<Button variant="ghost" onClick={onClose}>Close</Button>
				</div>
			</div>
		);
	return (
		<TradeSheetView
			key={entryId}
			workspaceId={workspaceId}
			data={detail.data}
			refetch={async () => (await detail.refetch()).data}
			onClose={onClose}
			registerEscape={registerEscape}
		/>
	);
}

export function TradeSheet({ workspaceId }: { workspaceId: string }) {
	const nav = useJournalNavigation();
	const mobile = useIsMobile();
	const [lastId, setLastId] = React.useState(nav.tradeId);
	const escapeGuard = React.useRef<EscapeGuard | null>(null);
	React.useEffect(() => {
		if (nav.tradeId) setLastId(nav.tradeId);
	}, [nav.tradeId]);
	const entryId = nav.tradeId ?? lastId;
	if (!entryId) return null;
	const open = !!nav.tradeId;
	const frame = {
		onEscapeKeyDown: (event: KeyboardEvent) => escapeGuard.current?.(event),
		onCloseAutoFocus: (event: Event) => {
			const target = nav.returnFocus.current;
			if (!target?.isConnected) return;
			event.preventDefault();
			target.focus({ preventScroll: true });
		},
	};
	const contents = (
		<SheetContents
			workspaceId={workspaceId}
			entryId={entryId}
			registerEscape={(guard) => {
				escapeGuard.current = guard;
			}}
			onClose={nav.closeTrade}
		/>
	);
	const onOpenChange = (next: boolean) => {
		if (!next) nav.closeTrade();
	};
	return mobile ? (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent
				className="h-[96dvh] data-[vaul-drawer-direction=bottom]:max-h-[96dvh]"
				{...frame}
			>
				<DrawerTitle className="sr-only">Trade details</DrawerTitle>
				<DrawerDescription className="sr-only">The timeline, review, notes and history for this trade.</DrawerDescription>
				<div className="flex min-h-0 flex-1 flex-col">{contents}</div>
			</DrawerContent>
		</Drawer>
	) : (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				showCloseButton={false}
				className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[44rem]"
				{...frame}
			>
				<SheetTitle className="sr-only">Trade details</SheetTitle>
				<SheetDescription className="sr-only">The timeline, review, notes and history for this trade.</SheetDescription>
				{contents}
			</SheetContent>
		</Sheet>
	);
}
