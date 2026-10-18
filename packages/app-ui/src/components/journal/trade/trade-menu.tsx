"use client";

import {
	Alert02Icon,
	Clock01Icon,
	Copy01Icon,
	Delete02Icon,
	GitBranchIcon,
	GitMergeIcon,
	MoreHorizontalIcon,
	PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";

export type MenuAction =
	| "split"
	| "merge"
	| "starting"
	| "fix"
	| "edit"
	| "copy"
	| "delete";

function Item({
	icon,
	action,
	onSelect,
	disabled,
	hint,
	destructive,
	children,
}: {
	icon: IconSvgElement;
	action: MenuAction;
	onSelect: (action: MenuAction) => void;
	disabled?: boolean;
	hint?: string;
	destructive?: boolean;
	children: React.ReactNode;
}) {
	return (
		<DropdownMenuItem
			disabled={disabled}
			variant={destructive ? "destructive" : "default"}
			onSelect={() => onSelect(action)}
		>
			<HugeiconsIcon icon={icon} strokeWidth={2} aria-hidden="true" />
			<span className="flex-1">{children}</span>
			{hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
		</DropdownMenuItem>
	);
}

export function TradeMenu({
	trade,
	readOnly,
	onSelect,
}: {
	trade: JournalTrade;
	readOnly: boolean;
	onSelect: (action: MenuAction) => void;
}) {
	const manual = trade.sourceKind === "manual";
	const grouped = !!trade.episodeId && !readOnly;
	const resolved = grouped && trade.lifecycleState !== "incomplete";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="icon" variant="ghost" aria-label="Trade actions">
					<HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<Item icon={GitBranchIcon} action="split" onSelect={onSelect} disabled={!resolved}>Split trade</Item>
				<Item icon={GitMergeIcon} action="merge" onSelect={onSelect} disabled={!resolved}>Merge with another trade…</Item>
				<Item icon={Clock01Icon} action="starting" onSelect={onSelect} disabled={!grouped}>Starting position…</Item>
				{grouped && trade.lifecycleState === "incomplete" && (
					<Item icon={Alert02Icon} action="fix" onSelect={onSelect}>Fix history</Item>
				)}
				{manual && !readOnly && (
					<Item icon={PencilEdit01Icon} action="edit" onSelect={onSelect}>Edit trade</Item>
				)}
				<Item icon={Copy01Icon} action="copy" onSelect={onSelect}>Copy link</Item>
				<DropdownMenuSeparator />
				<Item
					icon={Delete02Icon}
					action="delete"
					destructive
					onSelect={onSelect}
					disabled={!manual || readOnly}
					hint={manual ? undefined : "Only trades added by hand"}
				>
					Delete trade
				</Item>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
