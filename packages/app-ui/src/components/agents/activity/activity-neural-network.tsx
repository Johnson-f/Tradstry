"use client";

import type {
	AgentActivityEntry,
	AgentRunStatus,
} from "@tradstry/app-ui/lib/types/agents";
import { cn } from "@tradstry/app-ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import * as React from "react";
import {
	type ActivityHubStatus,
	type ActivityNeuralNode,
	buildActivityNeuralGraph,
} from "./activity-neural-model";

const ParticleNetwork = React.lazy(() =>
	import("@designcodeio/threeui/components/ParticleNetwork").then((module) => ({
		default: module.ParticleNetwork,
	})),
);

const HUB = { x: 286, y: 53 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function ActivityNeuralNetwork({
	entries,
	runStatus,
	reconnecting = false,
	loading = false,
	theme = "system",
	enableParticles = true,
}: {
	entries: AgentActivityEntry[];
	runStatus: AgentRunStatus;
	reconnecting?: boolean;
	loading?: boolean;
	theme?: "light" | "dark" | "system";
	enableParticles?: boolean;
}) {
	const reducedMotion = useReducedMotion() === true;
	const [enhanced, setEnhanced] = React.useState(false);
	const [inView, setInView] = React.useState(false);
	const [pageVisible, setPageVisible] = React.useState(true);
	const hostRef = React.useRef<HTMLDivElement>(null);
	const fieldRef = React.useRef<HTMLDivElement>(null);
	const running = runStatus === "QUEUED" || runStatus === "RUNNING";
	const graph = React.useMemo(
		() =>
			buildActivityNeuralGraph(entries, runStatus, { reconnecting, loading }),
		[entries, runStatus, reconnecting, loading],
	);
	const animateActivity =
		running &&
		!reconnecting &&
		!loading &&
		!reducedMotion &&
		inView &&
		pageVisible;

	React.useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const observer = new IntersectionObserver(([entry]) =>
			setInView(entry?.isIntersecting === true),
		);
		const updateVisibility = () => setPageVisible(!document.hidden);
		observer.observe(host);
		updateVisibility();
		document.addEventListener("visibilitychange", updateVisibility);
		return () => {
			observer.disconnect();
			document.removeEventListener("visibilitychange", updateVisibility);
		};
	}, []);

	React.useEffect(() => {
		const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
		const connection = navigator as Navigator & {
			connection?: { saveData?: boolean };
		};
		const update = () =>
			setEnhanced(
				enableParticles &&
					!reducedMotion &&
					finePointer.matches &&
					window.innerWidth >= 768 &&
					connection.connection?.saveData !== true,
			);

		update();
		finePointer.addEventListener("change", update);
		window.addEventListener("resize", update, { passive: true });
		return () => {
			finePointer.removeEventListener("change", update);
			window.removeEventListener("resize", update);
		};
	}, [enableParticles, reducedMotion]);

	const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const field = fieldRef.current;
		if (!field || reducedMotion) return;
		const bounds = event.currentTarget.getBoundingClientRect();
		const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 8;
		const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 6;
		field.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.05)`;
	};

	const onPointerLeave = () => {
		if (fieldRef.current) {
			fieldRef.current.style.transform = "translate3d(0, 0, 0) scale(1.05)";
		}
	};

	return (
		<div
			ref={hostRef}
			role="img"
			aria-label={`Response activity network: ${graph.summary}${graph.omittedCount ? `. Latest ${graph.nodes.length} activities shown` : ""}`}
			onPointerMove={onPointerMove}
			onPointerLeave={onPointerLeave}
			className="relative h-[7.25rem] overflow-hidden rounded-xl border border-border/60 bg-muted/20"
		>
			{enhanced && animateActivity ? (
				<div
					ref={fieldRef}
					aria-hidden="true"
					inert
					className="pointer-events-none absolute inset-[-5%] opacity-[0.14] mix-blend-multiply transition-transform duration-300 ease-out dark:opacity-[0.2] dark:mix-blend-screen"
					style={{ transform: "translate3d(0, 0, 0) scale(1.05)" }}
				>
					<ParticleFallback>
						<React.Suspense fallback={null}>
							<ParticleNetwork
								mode={theme === "system" ? "auto" : theme}
								speed={
									entries.some((entry) => entry.status === "STARTED")
										? 0.55
										: 0.18
								}
								size={0.72}
								gap={2}
								length={1.08}
								density={0.65}
								strokeWidth={0.72}
								opacity={0.68}
								hue={-155}
								saturation={0.7}
								brightness={1.02}
								className="size-full"
							/>
						</React.Suspense>
					</ParticleFallback>
				</div>
			) : null}

			<svg
				viewBox="0 0 320 106"
				preserveAspectRatio="xMidYMid meet"
				aria-hidden="true"
				className="absolute inset-x-0 top-0 h-[6.2rem] w-full"
			>
				{graph.nodes.map((node) => (
					<motion.path
						key={`edge:${node.activityId}`}
						d={edgePath(node, graph.nodes)}
						fill="none"
						stroke="currentColor"
						strokeWidth={node.status === "STARTED" ? 1.35 : 0.9}
						strokeDasharray={node.status === "STARTED" ? "3 4" : undefined}
						className={cn("opacity-35", statusTone(node.status))}
						initial={animateActivity ? { pathLength: 0, opacity: 0 } : false}
						animate={{
							pathLength: 1,
							opacity: node.status === "STARTED" ? 0.72 : 0.35,
						}}
						transition={{
							duration: animateActivity ? 0.5 : 0,
							ease: EASE_OUT,
						}}
					/>
				))}

				{graph.nodes.map((node, index) => (
					<ActivityNode
						key={node.activityId}
						node={node}
						index={index}
						reducedMotion={!animateActivity}
					/>
				))}

				<g className={statusTone(graph.hubStatus)}>
					{graph.hubStatus === "STARTED" && animateActivity ? (
						<motion.circle
							cx={HUB.x}
							cy={HUB.y}
							r={13}
							fill="none"
							stroke="currentColor"
							animate={{ r: [11, 16], opacity: [0.42, 0] }}
							transition={{
								duration: 1.7,
								repeat: Number.POSITIVE_INFINITY,
								ease: "easeOut",
							}}
						/>
					) : null}
					<circle
						cx={HUB.x}
						cy={HUB.y}
						r={10}
						fill="currentColor"
						className="opacity-90"
					/>
					<text
						x={HUB.x}
						y={HUB.y + 2.7}
						textAnchor="middle"
						className="fill-background text-[7px] font-semibold"
					>
						AI
					</text>
				</g>
			</svg>

			<div className="absolute inset-x-3 bottom-2 flex min-w-0 items-center gap-2">
				<span
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						"bg-current",
						statusTone(graph.hubStatus),
						animateActivity && "motion-safe:animate-pulse",
					)}
				/>
				<span className="min-w-0 flex-1 truncate text-[0.65rem] text-muted-foreground">
					{graph.summary}
				</span>
				{graph.omittedCount > 0 ? (
					<span className="shrink-0 text-[0.56rem] text-muted-foreground/70">
						{graph.nodes.length}/{graph.nodes.length + graph.omittedCount}
					</span>
				) : null}
				<span className="shrink-0 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-muted-foreground/55">
					{loading
						? "loading"
						: reconnecting
							? "offline"
							: running
								? "live"
								: runStatus === "WAITING_FOR_APPROVAL"
									? "paused"
									: "saved"}
				</span>
			</div>
		</div>
	);
}

function ActivityNode({
	node,
	index,
	reducedMotion,
}: {
	node: ActivityNeuralNode;
	index: number;
	reducedMotion: boolean;
}) {
	const active = node.status === "STARTED";
	return (
		<g className={statusTone(node.status)}>
			<title>{`${node.label}: ${node.status.toLowerCase()}`}</title>
			{active && !reducedMotion ? (
				<motion.circle
					cx={node.x}
					cy={node.y}
					r={7}
					fill="none"
					stroke="currentColor"
					animate={{ r: [6, 10], opacity: [0.5, 0] }}
					transition={{
						duration: 1.4,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeOut",
					}}
				/>
			) : null}
			<motion.circle
				cx={node.x}
				cy={node.y}
				r={5.25}
				fill="currentColor"
				initial={reducedMotion ? false : { r: 3.7, opacity: 0 }}
				animate={{ r: 5.25, opacity: 0.9 }}
				transition={{
					duration: reducedMotion ? 0 : 0.32,
					delay: reducedMotion ? 0 : index * 0.06,
					ease: EASE_OUT,
				}}
			/>
			<text
				x={node.x}
				y={node.y + 2.2}
				textAnchor="middle"
				className="fill-background text-[5.5px] font-medium"
			>
				{node.ordinal ? String(node.ordinal).padStart(2, "0") : "R"}
			</text>
		</g>
	);
}

function edgePath(node: ActivityNeuralNode, nodes: ActivityNeuralNode[]) {
	const parent = node.parentActivityId
		? nodes.find((candidate) => candidate.activityId === node.parentActivityId)
		: null;
	const target = parent ?? HUB;
	const bend = Math.max(24, (target.x - node.x) * 0.45);
	return `M ${node.x} ${node.y} C ${node.x + bend} ${node.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`;
}

function statusTone(status: ActivityHubStatus) {
	if (status === "FAILED" || status === "INTERRUPTED") {
		return "text-destructive";
	}
	if (status === "COMPLETED") return "text-emerald-600 dark:text-emerald-400";
	if (status === "CANCELLED") return "text-muted-foreground/45";
	if (status === "WAITING" || status === "RECONNECTING")
		return "text-amber-600 dark:text-amber-400";
	if (status === "LOADING") return "text-muted-foreground";
	return "text-foreground/75";
}

class ParticleFallback extends React.Component<
	React.PropsWithChildren,
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? null : this.props.children;
	}
}
