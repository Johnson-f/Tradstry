"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import { money, tradeDate } from "./journal-format";

export function JournalChart({
	workspaceId,
	entryId,
	revision,
}: {
	workspaceId: string;
	entryId: string;
	revision: number;
}) {
	const fetcher = useGraphQL();
	const platform = useTradstryPlatform();
	const [range, setRange] = React.useState<{
		from: number | null;
		to: number | null;
	}>({ from: null, to: null });
	const [from, setFrom] = React.useState("");
	const [to, setTo] = React.useState("");
	const [rangeOpen, setRangeOpen] = React.useState(false);
	const [hover, setHover] = React.useState(0);
	const query = useQuery({
		queryKey: [
			"journal-flow",
			platform.user.email,
			workspaceId,
			"chart",
			entryId,
			revision,
			range,
		],
		queryFn: () =>
			flow.chart(fetcher, workspaceId, entryId, range.from, range.to),
		retry: false,
		staleTime: 300_000,
	});
	const data = query.data;
	const geometry = React.useMemo(() => {
		if (!data?.bars.length) return null;
		const low = Math.min(...data.bars.map((bar) => bar.close));
		const high = Math.max(...data.bars.map((bar) => bar.close));
		const span = high - low || Math.max(Math.abs(high) * 0.01, 1);
		const x = (stamp: number) =>
			30 + ((stamp - data.start) / (data.end - data.start)) * 900;
		const y = (price: number) => 190 - ((price - low) / span) * 150;
		return {
			x,
			y,
			low,
			high,
			path: data.bars
				.map(
					(bar, index) =>
						`${index ? "L" : "M"}${x(bar.timestamp).toFixed(2)},${y(bar.close).toFixed(2)}`,
				)
				.join(" "),
		};
	}, [data]);
	const active = data?.bars[Math.min(hover, Math.max(0, data.bars.length - 1))];
	const timestamp = (value: number) =>
		new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
			timeZone: data?.timezone,
		}).format(new Date(value * 1000));
	return (
		<section className="overflow-hidden rounded-xl border bg-card">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
				<div>
					<h2 className="text-sm font-semibold">
						Price history
						{data?.seriesKind === "underlying"
							? ` · ${data.symbol} underlying stock`
							: ""}
					</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{data?.provider
							? `${data.provider} · ${data.interval} · closing prices`
							: "Trade window"}
					</p>
				</div>
				<Popover open={rangeOpen} onOpenChange={setRangeOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="h-8 px-3"
							aria-label="Change chart date range"
						>
							Date range
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-72 space-y-3">
						<p className="text-sm font-medium">Chart date range</p>
						<div className="grid grid-cols-2 gap-2">
							<label className="grid gap-1.5 text-xs">
								From (UTC)
								<Input
									type="date"
									className="h-9"
									value={from}
									onChange={(event) => setFrom(event.target.value)}
								/>
							</label>
							<label className="grid gap-1.5 text-xs">
								To (UTC)
								<Input
									type="date"
									className="h-9"
									value={to}
									onChange={(event) => setTo(event.target.value)}
								/>
							</label>
						</div>
						<div className="flex justify-between gap-2">
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									setRange({ from: null, to: null });
									setFrom("");
									setTo("");
									setRangeOpen(false);
								}}
							>
								Trade window
							</Button>
							<Button
								size="sm"
								disabled={!from || !to || from > to}
								onClick={() => {
									setRange({
										from: Date.parse(from + "T00:00:00Z") / 1000,
										to: Date.parse(to + "T23:59:59Z") / 1000,
									});
									setRangeOpen(false);
								}}
							>
								Apply
							</Button>
						</div>
					</PopoverContent>
				</Popover>
			</div>
			{query.isLoading ? (
				<div role="status" className="p-4">
					<span className="sr-only">Loading price history…</span>
					<div
						aria-hidden="true"
						className="space-y-4 [&_[data-slot=skeleton]]:motion-reduce:animate-none"
					>
						<div className="flex items-center gap-3">
							<Skeleton className="h-6 w-24" />
							<Skeleton className="h-3 w-36" />
						</div>
						<Skeleton className="h-48 w-full rounded-lg" />
						<div className="flex justify-between">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-3 w-20" />
						</div>
					</div>
				</div>
			) : query.isError ? (
				<div className="grid h-56 place-content-center gap-3 p-5 text-center">
					<p className="text-sm text-muted-foreground">
						Price history could not be loaded. Your executions and review are
						still available.
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void query.refetch()}
					>
						Retry chart
					</Button>
				</div>
			) : geometry && data && active ? (
				<div className="px-4 pt-3">
					<div
						className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"
						aria-live="polite"
						aria-atomic="true"
					>
						<span className="text-xl font-medium tracking-tight tabular-nums">
							{money(active.close.toString(), data.currency)}
						</span>
						<span className="text-[11px] text-muted-foreground">
							{timestamp(active.timestamp)}
						</span>
					</div>
					<svg
						className="block h-auto min-h-40 w-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
						viewBox="0 0 1000 240"
						role="img"
						aria-label={`${data.symbol} closing-price history. Use left and right arrows to inspect prices. Execution markers show time only.`}
						tabIndex={0}
						onKeyDown={(event) => {
							if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
								event.preventDefault();
								setHover((value) =>
									Math.max(
										0,
										Math.min(
											data.bars.length - 1,
											value + (event.key === "ArrowRight" ? 1 : -1),
										),
									),
								);
							}
						}}
						onPointerMove={(event) => {
							const bounds = event.currentTarget.getBoundingClientRect();
							const position =
								((event.clientX - bounds.left) / bounds.width) * 1000;
							const stamp =
								data.start + ((position - 30) / 900) * (data.end - data.start);
							let closest = 0;
							for (let i = 1; i < data.bars.length; i++) {
								if (
									Math.abs(data.bars[i]!.timestamp - stamp) <
									Math.abs(data.bars[closest]!.timestamp - stamp)
								)
									closest = i;
							}
							setHover(closest);
						}}
					>
						{[40, 115, 190].map((y) => (
							<line
								key={y}
								x1={30}
								x2={930}
								y1={y}
								y2={y}
								stroke="currentColor"
								className="text-border"
							/>
						))}
						<path
							d={geometry.path}
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							className="text-foreground"
							vectorEffect="non-scaling-stroke"
						/>
						<line
							x1={geometry.x(active.timestamp)}
							x2={geometry.x(active.timestamp)}
							y1={25}
							y2={195}
							stroke="currentColor"
							strokeDasharray="3 4"
							className="text-muted-foreground"
						/>
						<circle
							cx={geometry.x(active.timestamp)}
							cy={geometry.y(active.close)}
							r={4}
							fill="currentColor"
						/>
						{data.markers
							.filter(
								(marker) =>
									marker.timestamp !== null &&
									marker.precision === "timestamp" &&
									marker.timestamp >= data.start &&
									marker.timestamp <= data.end,
							)
							.map((marker, index) => (
								<g key={`${marker.transactionId}:${index}`}>
									<line
										x1={geometry.x(marker.timestamp!)}
										x2={geometry.x(marker.timestamp!)}
										y1={195}
										y2={205}
										stroke="currentColor"
										className="text-muted-foreground"
									/>
									<circle
										cx={geometry.x(marker.timestamp!)}
										cy={216}
										r={8}
										className={
											marker.side.startsWith("BUY")
												? "fill-emerald-600"
												: "fill-rose-600"
										}
									/>
									<text
										x={geometry.x(marker.timestamp!)}
										y={220}
										textAnchor="middle"
										fill="white"
										fontSize={9}
									>
										{marker.side.startsWith("BUY") ? "B" : "S"}
									</text>
									<title>
										{marker.side} {marker.quantity} at{" "}
										{money(marker.price, data.currency)} ·{" "}
										{timestamp(marker.timestamp!)}
									</title>
								</g>
							))}
						<text
							x={944}
							y={45}
							fontSize={11}
							fill="currentColor"
							className="text-muted-foreground"
						>
							{money(geometry.high.toString(), data.currency)}
						</text>
						<text
							x={944}
							y={195}
							fontSize={11}
							fill="currentColor"
							className="text-muted-foreground"
						>
							{money(geometry.low.toString(), data.currency)}
						</text>
					</svg>
					<div className="flex flex-wrap justify-between gap-2 pb-3 text-[11px] text-muted-foreground">
						<span>
							{tradeDate(
								new Date(data.start * 1000).toISOString(),
								data.timezone,
							)}
						</span>
						<span>{data.timezone}</span>
						<span>
							{tradeDate(
								new Date(data.end * 1000).toISOString(),
								data.timezone,
							)}
						</span>
					</div>
				</div>
			) : (
				<div className="grid h-48 place-content-center p-6 text-center text-sm text-muted-foreground">
					No usable price history for this range.
				</div>
			)}
			{data?.message && (
				<p className="border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
					{data.message}
				</p>
			)}
		</section>
	);
}
