"use client";

import {
	AiBrain01Icon,
	ArrowUpRight01Icon,
	BankIcon,
	Calendar03Icon,
	ChartLineData01Icon,
	CheckListIcon,
	File02Icon,
	Loading03Icon,
	Notification03Icon,
	NotificationOff03Icon,
	TickDouble01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import {
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useNotificationStream,
	useNotifications,
	useUnreadNotificationCount,
} from "@tradstry/app-ui/hooks/notifications";
import type { Notification } from "@tradstry/app-ui/lib/types/notifications";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";

function timeAgo(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return formatDistanceToNowStrict(date, { addSuffix: true });
}

const EVENT_ICONS = {
	AgentRunReady: AiBrain01Icon,
	ArtifactReady: File02Icon,
	FillsLanded: ChartLineData01Icon,
	BrokerageConnectionDisabled: BankIcon,
	PrincipleViolated: CheckListIcon,
	DailyRecap: CheckListIcon,
	WeeklyReview: Calendar03Icon,
	MarketMonitorTriggered: ChartLineData01Icon,
};

export function NotificationRow({
	notification,
	onSelect,
}: {
	notification: Notification;
	onSelect: (notification: Notification) => void;
}) {
	const icon =
		EVENT_ICONS[notification.eventType as keyof typeof EVENT_ICONS] ??
		Notification03Icon;
	const title =
		notification.eventType === "AgentRunReady" &&
		notification.title === "Tradstry AI finished your analysis"
			? "Your analysis is ready"
			: notification.title;
	const body =
		notification.eventType === "AgentRunReady" &&
		notification.body ===
			"Open the conversation to review the evidence-backed answer."
			? "View the answer in your conversation."
			: notification.body;
	const date = new Date(notification.createdAt);
	return (
		<button
			type="button"
			onClick={() => onSelect(notification)}
			className={cn(
				"group flex w-full items-start gap-3 rounded-xl p-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
				!notification.read && "bg-muted/35",
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-lg border",
					notification.read
						? "border-transparent bg-muted/40 text-muted-foreground"
						: "border-border/70 bg-background text-foreground",
				)}
			>
				<HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
			</span>
			<span className="min-w-0 flex-1">
				{!notification.read && <span className="sr-only">Unread: </span>}
				<span className="flex items-start justify-between gap-2">
					<span
						className={cn(
							"line-clamp-2 text-xs leading-5",
							notification.read ? "font-medium" : "font-semibold",
						)}
					>
						{title}
					</span>
					{notification.deepLink && (
						<HugeiconsIcon
							icon={ArrowUpRight01Icon}
							aria-hidden="true"
							className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
						/>
					)}
				</span>
				{body ? (
					<span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
						{body}
					</span>
				) : null}
				<span className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
					<time
						dateTime={
							Number.isNaN(date.getTime()) ? undefined : date.toISOString()
						}
						title={
							Number.isNaN(date.getTime()) ? undefined : date.toLocaleString()
						}
					>
						{timeAgo(notification.createdAt)}
					</time>
					{notification.groupCount > 1 && (
						<span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
							{notification.groupCount} updates
						</span>
					)}
				</span>
			</span>
		</button>
	);
}

export function NotificationsButton() {
	const { navigate } = useTradstryPlatform();
	const [open, setOpen] = useState(false);

	useNotificationStream();

	const { data: unreadCount = 0 } = useUnreadNotificationCount();
	const {
		data: notifications,
		isLoading,
		isError,
		isFetching,
		refetch,
	} = useNotifications();
	const markRead = useMarkNotificationRead();
	const markAllRead = useMarkAllNotificationsRead();

	const items = notifications ?? [];
	const unread = items.filter((item) => !item.read);
	const earlier = items.filter((item) => item.read);

	function handleSelect(notification: Notification) {
		if (!notification.read) {
			markRead.mutate(notification.id, {
				onError: () => toast.error("Could not mark notification as read."),
			});
		}
		if (notification.deepLink) {
			setOpen(false);
			navigate(notification.deepLink);
		}
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative"
					aria-label={
						unreadCount > 0
							? `Notifications, ${unreadCount} unread`
							: "Notifications"
					}
				>
					<HugeiconsIcon
						icon={Notification03Icon}
						strokeWidth={2}
						className="size-4.5"
					/>
					{unreadCount > 0 ? (
						<span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-semibold text-primary-foreground tabular-nums">
							{unreadCount > 99 ? "99+" : unreadCount}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>

			<PopoverContent
				align="end"
				sideOffset={10}
				collisionPadding={12}
				aria-label="Notifications"
				className="flex max-h-[var(--radix-popover-content-available-height)] w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl p-0 shadow-lg"
			>
				<header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3.5">
					<div className="flex items-center gap-2">
						<h2 className="text-sm font-semibold">Notifications</h2>
						{unreadCount > 0 && (
							<span
								className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
								aria-label={unreadCount + " unread"}
							>
								{unreadCount}
							</span>
						)}
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
						onClick={() =>
							markAllRead.mutate(undefined, {
								onError: () =>
									toast.error("Could not mark notifications as read."),
							})
						}
						disabled={unreadCount === 0 || markAllRead.isPending}
						aria-busy={markAllRead.isPending}
					>
						<HugeiconsIcon
							icon={markAllRead.isPending ? Loading03Icon : TickDouble01Icon}
							aria-hidden="true"
							strokeWidth={1.8}
							className={cn(
								"size-3.5",
								markAllRead.isPending &&
									"animate-spin motion-reduce:animate-none",
							)}
						/>
						Mark all read
					</Button>
				</header>
				<ScrollArea className="min-h-0 [&>[data-radix-scroll-area-viewport]]:max-h-[min(28rem,calc(var(--radix-popover-content-available-height)-4rem))] [&>[data-radix-scroll-area-viewport]>div]:!block">
					{isLoading ? (
						<div
							role="status"
							aria-label="Loading notifications"
							className="space-y-5 p-4"
						>
							{[0, 1, 2].map((key) => (
								<div key={key} className="flex gap-3">
									<Skeleton className="size-9 shrink-0 rounded-lg" />
									<div className="flex-1 space-y-2">
										<Skeleton className="h-3 w-3/4" />
										<Skeleton className="h-3 w-full" />
										<Skeleton className="h-2 w-16" />
									</div>
								</div>
							))}
						</div>
					) : isError && items.length === 0 ? (
						<div
							role="alert"
							className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center"
						>
							<p className="text-sm font-medium">Couldn’t load notifications</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isFetching}
								onClick={() => void refetch()}
							>
								{isFetching ? "Retrying…" : "Try again"}
							</Button>
						</div>
					) : items.length === 0 ? (
						<div className="flex min-h-52 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
							<span className="flex size-11 items-center justify-center rounded-xl border bg-muted/30">
								<HugeiconsIcon
									icon={NotificationOff03Icon}
									aria-hidden="true"
									strokeWidth={1.8}
									className="size-5 text-muted-foreground"
								/>
							</span>
							<div>
								<p className="text-sm font-medium">No notifications yet</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Your trading updates will appear here.
								</p>
							</div>
						</div>
					) : (
						<div className="space-y-3 p-2">
							{[
								{ label: "Unread", items: unread },
								{
									label: unread.length > 0 ? "Earlier" : "Recent",
									items: earlier,
								},
							]
								.filter((group) => group.items.length > 0)
								.map((group) => (
									<section key={group.label} aria-label={group.label}>
										<h3 className="px-3 pb-2 pt-2 text-[11px] font-medium text-muted-foreground">
											{group.label}
										</h3>
										<ul className="space-y-1">
											{group.items.map((notification) => (
												<li key={notification.id}>
													<NotificationRow
														notification={notification}
														onSelect={handleSelect}
													/>
												</li>
											))}
										</ul>
									</section>
								))}
						</div>
					)}
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
