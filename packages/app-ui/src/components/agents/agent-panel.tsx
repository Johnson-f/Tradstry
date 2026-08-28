"use client";

import {
	Add01Icon,
	AiChat01Icon,
	AlertCircleIcon,
	ArrowUp02Icon,
	BotIcon,
	Cancel01Icon,
	ChatSparkIcon,
	Copy01Icon,
	Delete02Icon,
	Edit02Icon,
	InformationCircleIcon,
	Loading03Icon,
	MoreHorizontalIcon,
	SidebarLeftIcon,
	StopIcon,
	Tick02Icon,
	Time01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradstryMark } from "@tradstry/app-ui/components/logo";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Card, CardContent } from "@tradstry/app-ui/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tradstry/app-ui/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import {
	useAgentActionProposal,
	useAgentCapabilities,
	useAgentContextSearch,
	useAgentConversations,
	useAgentMessageActivitySummaries,
	useAgentMessages,
	useAgentRun,
	useAgentRunActivity,
	useApproveAgentAction,
	useCancelAgentRun,
	useCreateAgentConversation,
	useDeleteAgentConversation,
	useRejectAgentAction,
	useRenameAgentConversation,
	useSendAgentMessage,
} from "@tradstry/app-ui/hooks/agents";
import type {
	AgentActionProposal,
	AgentActivityEntry,
	AgentActivitySummary,
	AgentContextSearchResult,
	AgentConversation,
	AgentMessage,
	AgentRunStatus,
} from "@tradstry/app-ui/lib/types/agents";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";
import {
	addContextSelection,
	findActiveMention,
	removeContextSelection,
	replaceActiveMention,
	serializeContextSelections,
} from "./context-mention-model";
import { AgentActivityTimeline } from "./activity";
import { ContextChips, ContextIcon, ContextPicker } from "./context-picker";
import {
	formatConversationUpdatedAt,
	nextConversationAfterDelete,
} from "./history-model";
import {
	type AgentAnswerBlock,
	messageTextForClipboard,
	parseAgentMessage,
} from "./message-model";
import { useAgentPanelStore } from "./store";

const TERMINAL_RUN_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const QUICK_EASE = [0.23, 1, 0.32, 1] as const;

export function AgentPanelTrigger() {
	const open = useAgentPanelStore((state) => state.open);
	const toggleOpen = useAgentPanelStore((state) => state.toggleOpen);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-lg"
					aria-label={open ? "Close Ask Tradstry" : "Open Ask Tradstry"}
					aria-pressed={open}
					onClick={toggleOpen}
					className="rounded-lg text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/8"
				>
					<HugeiconsIcon icon={ChatSparkIcon} strokeWidth={1.8} />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{open ? "Close Ask Tradstry" : "Ask Tradstry"}
			</TooltipContent>
		</Tooltip>
	);
}

export function AgentPanel() {
	const workspace = useActiveWorkspace();
	const platform = useTradstryPlatform();
	const open = useAgentPanelStore((state) => state.open);
	const historyOpen = useAgentPanelStore((state) => state.historyOpen);
	const setOpen = useAgentPanelStore((state) => state.setOpen);
	const setHistoryOpen = useAgentPanelStore((state) => state.setHistoryOpen);
	const selectedByWorkspace = useAgentPanelStore(
		(state) => state.selectedByWorkspace,
	);
	const newChatByWorkspace = useAgentPanelStore(
		(state) => state.newChatByWorkspace,
	);
	const selectConversation = useAgentPanelStore(
		(state) => state.selectConversation,
	);
	const startNewChat = useAgentPanelStore((state) => state.startNewChat);
	const drafts = useAgentPanelStore((state) => state.drafts);
	const setDraft = useAgentPanelStore((state) => state.setDraft);
	const contexts = useAgentPanelStore((state) => state.contexts);
	const setContexts = useAgentPanelStore((state) => state.setContexts);
	const activeRuns = useAgentPanelStore((state) => state.activeRuns);
	const setActiveRun = useAgentPanelStore((state) => state.setActiveRun);
	const removeConversation = useAgentPanelStore(
		(state) => state.removeConversation,
	);
	const workspaceId = workspace?.id ?? null;
	const capabilities = useAgentCapabilities();
	const agentReady = capabilities.data?.enabled === true;
	const conversations = useAgentConversations(
		open && agentReady ? workspaceId : null,
	);
	const selectedConversationId = workspaceId
		? (selectedByWorkspace[workspaceId] ?? null)
		: null;
	const isNewChat = workspaceId
		? newChatByWorkspace[workspaceId] === true
		: true;
	const messages = useAgentMessages(
		open && agentReady && !isNewChat ? selectedConversationId : null,
	);
	const createConversation = useCreateAgentConversation();
	const sendMessage = useSendAgentMessage();
	const cancelRun = useCancelAgentRun();
	const activeRun = selectedConversationId
		? activeRuns[selectedConversationId]
		: undefined;
	const run = useAgentRun(activeRun?.runId ?? null);
	const runActivity = useAgentRunActivity(
		activeRun?.runId ?? null,
		activeRun?.conversationId ?? null,
	);
	const assistantMessageIds = React.useMemo(
		() =>
			(messages.data ?? [])
				.filter((message) => message.role === "assistant")
				.map((message) => message.id),
		[messages.data],
	);
	const activitySummaries =
		useAgentMessageActivitySummaries(assistantMessageIds);
	const activitySummaryByMessage = React.useMemo(
		() =>
			new Map(
				(activitySummaries.data ?? []).map((summary) => [
					summary.messageId,
					summary,
				]),
			),
		[activitySummaries.data],
	);
	const draftKey = selectedConversationId ?? `new:${workspaceId ?? "none"}`;
	const draft = drafts[draftKey] ?? "";
	const selectedContexts = contexts[draftKey] ?? [];
	const latestUserMessage = messages.data
		? [...messages.data].reverse().find((message) => message.role === "user")
		: undefined;
	const threadEndRef = React.useRef<HTMLDivElement>(null);
	const threadViewportRef = React.useRef<HTMLDivElement>(null);
	const latestUserMessageRef = React.useRef<HTMLDivElement>(null);
	const pendingTurnAnchorRef = React.useRef<{
		conversationId: string;
		afterSequence: number;
	} | null>(null);
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const [cursor, setCursor] = React.useState(0);
	const [debouncedMentionQuery, setDebouncedMentionQuery] = React.useState("");
	const [dismissedMention, setDismissedMention] = React.useState<string | null>(
		null,
	);
	const [activeContextIndex, setActiveContextIndex] = React.useState(0);
	const [customRangeOpen, setCustomRangeOpen] = React.useState(false);
	const [sendError, setSendError] = React.useState<string | null>(null);
	const [turnAnchor, setTurnAnchor] = React.useState<{
		messageId: string;
		tailHeight: number;
	} | null>(null);
	const [panelPresent, setPanelPresent] = React.useState(open);
	const shouldReduceMotion = useReducedMotion();
	const threadVersion = `${messages.data?.at(-1)?.id ?? ""}:${runActivity.entries.at(-1)?.sequence ?? 0}:${activeRun?.runId ?? ""}`;
	const activeMention = findActiveMention(draft, cursor);
	const activeMentionKey = activeMention
		? `${draftKey}:${activeMention.start}:${activeMention.end}:${activeMention.query}`
		: null;
	const contextPickerOpen = Boolean(
		activeMention && activeMentionKey !== dismissedMention,
	);
	const contextSearch = useAgentContextSearch(
		contextPickerOpen ? workspaceId : null,
		debouncedMentionQuery,
		contextPickerOpen,
	);
	const contextResults = contextSearch.data ?? [];

	React.useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea || !open) return;
		textarea.style.height = "auto";
		textarea.style.height = `${textarea.scrollHeight}px`;
	}, [draft, historyOpen, open]);

	React.useLayoutEffect(() => {
		const pending = pendingTurnAnchorRef.current;
		const messageElement = latestUserMessageRef.current;
		const viewport = threadViewportRef.current;
		if (
			!pending ||
			pending.conversationId !== selectedConversationId ||
			!latestUserMessage ||
			latestUserMessage.sequence <= pending.afterSequence ||
			!messageElement ||
			!viewport
		) {
			return;
		}
		pendingTurnAnchorRef.current = null;
		setTurnAnchor({
			messageId: latestUserMessage.id,
			tailHeight: Math.max(
				0,
				viewport.clientHeight - messageElement.offsetHeight - 24,
			),
		});
	}, [latestUserMessage, selectedConversationId]);

	React.useLayoutEffect(() => {
		if (!turnAnchor || latestUserMessage?.id !== turnAnchor.messageId) return;
		latestUserMessageRef.current?.scrollIntoView({
			behavior: shouldReduceMotion ? "auto" : "smooth",
			block: "start",
		});
	}, [latestUserMessage?.id, shouldReduceMotion, turnAnchor]);

	React.useEffect(() => {
		setTurnAnchor(null);
		const pending = pendingTurnAnchorRef.current;
		if (pending && pending.conversationId !== selectedConversationId) {
			pendingTurnAnchorRef.current = null;
		}
	}, [selectedConversationId]);

	React.useEffect(() => {
		if (!activeMention || !contextPickerOpen) return;
		if (!activeMention.query) {
			setDebouncedMentionQuery("");
			return;
		}
		const timeout = window.setTimeout(
			() => setDebouncedMentionQuery(activeMention.query),
			150,
		);
		return () => window.clearTimeout(timeout);
	}, [activeMention?.query, activeMention?.start, contextPickerOpen]);

	React.useEffect(() => {
		setActiveContextIndex(0);
	}, [debouncedMentionQuery, draftKey]);

	React.useEffect(() => {
		if (activeContextIndex < contextResults.length) return;
		setActiveContextIndex(Math.max(0, contextResults.length - 1));
	}, [activeContextIndex, contextResults.length]);

	React.useEffect(() => {
		setCursor(draft.length);
		setDismissedMention(null);
		setCustomRangeOpen(false);
	}, [draftKey]);

	React.useEffect(() => {
		if (open) {
			setPanelPresent(true);
			return;
		}
		const timeout = window.setTimeout(
			() => setPanelPresent(false),
			shouldReduceMotion ? 80 : 180,
		);
		return () => window.clearTimeout(timeout);
	}, [open, shouldReduceMotion]);

	React.useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (historyOpen) setHistoryOpen(false);
			else setOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [historyOpen, open, setHistoryOpen, setOpen]);

	React.useEffect(() => {
		if (!open || !workspaceId || conversations.isLoading || isNewChat) return;
		if (selectedConversationId) return;
		const first = conversations.data?.[0];
		if (first) selectConversation(workspaceId, first.id);
		else startNewChat(workspaceId);
	}, [
		conversations.data,
		conversations.isLoading,
		isNewChat,
		open,
		selectConversation,
		selectedConversationId,
		startNewChat,
		workspaceId,
	]);

	React.useEffect(() => {
		const status = run.data?.status;
		if (!activeRun || !status || !TERMINAL_RUN_STATUSES.has(status)) return;
		if (status === "FAILED")
			setSendError("Tradstry could not finish that answer.");
		void messages.refetch();
		setActiveRun(activeRun.conversationId, undefined);
	}, [activeRun, messages.refetch, run.data?.status, setActiveRun]);

	React.useEffect(() => {
		if (!open || !threadVersion || !threadEndRef.current) return;
		if (
			turnAnchor ||
			pendingTurnAnchorRef.current?.conversationId === selectedConversationId
		) {
			return;
		}
		threadEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [open, selectedConversationId, threadVersion, turnAnchor]);

	const selectedConversation = conversations.data?.find(
		(conversation) => conversation.id === selectedConversationId,
	);
	const selectingInitialConversation =
		!isNewChat &&
		!selectedConversationId &&
		(conversations.isLoading || Boolean(conversations.data?.length));
	const title = isNewChat
		? "New chat"
		: selectedConversation?.title ||
			(selectingInitialConversation ? "Loading chat…" : "Untitled chat");
	const threadKey = isNewChat
		? `new:${workspaceId ?? "none"}`
		: `${selectedConversationId ?? "loading"}:${messages.isLoading || selectingInitialConversation ? "loading" : "ready"}`;
	const isRunning = Boolean(
		activeRun && !run.data?.status.match(/COMPLETED|FAILED|CANCELLED/),
	);
	const isSending = createConversation.isPending || sendMessage.isPending;
	const composerDisabled =
		!workspaceId || !agentReady || isSending || isRunning;

	const submit = async () => {
		const content = draft.trim();
		if (!content || !workspaceId || composerDisabled) return;
		const messageContext = serializeContextSelections(selectedContexts);
		setSendError(null);
		try {
			let conversationId = selectedConversationId;
			if (!conversationId || isNewChat) {
				const conversation = await createConversation.mutateAsync(workspaceId);
				conversationId = conversation.id;
				setDraft(conversation.id, content);
				setContexts(conversation.id, selectedContexts);
				setDraft(draftKey, "");
				setContexts(draftKey, []);
				selectConversation(workspaceId, conversation.id);
			}
			pendingTurnAnchorRef.current = {
				conversationId,
				afterSequence:
					conversationId === selectedConversationId
						? (messages.data?.at(-1)?.sequence ?? 0)
						: 0,
			};
			const handle = await sendMessage.mutateAsync({
				conversationId,
				content,
				context: messageContext,
				idempotencyKey: crypto.randomUUID(),
			});
			setDraft(draftKey, "");
			setDraft(conversationId, "");
			setContexts(draftKey, []);
			setContexts(conversationId, []);
			setActiveRun(conversationId, {
				runId: handle.runId,
				conversationId,
			});
		} catch (error) {
			pendingTurnAnchorRef.current = null;
			setSendError(
				error instanceof Error ? error.message : "Could not send this message.",
			);
		}
	};

	const chooseContext = (selection: AgentContextSearchResult) => {
		if (selection.key === "date_range:custom") {
			setCustomRangeOpen(true);
			return;
		}
		if (!activeMention) return;
		setContexts(draftKey, addContextSelection(selectedContexts, selection));
		const next = replaceActiveMention(draft, activeMention);
		setDraft(draftKey, next.value);
		setCursor(next.cursor);
		setCustomRangeOpen(false);
		setDismissedMention(null);
		window.requestAnimationFrame(() => {
			textareaRef.current?.focus();
			textareaRef.current?.setSelectionRange(next.cursor, next.cursor);
		});
	};

	return (
		<aside
			data-slot="agent-panel"
			aria-hidden={!open}
			inert={!open}
			className={cn(
				"relative z-40 h-svh shrink-0 overflow-hidden bg-transparent",
				panelPresent &&
					"w-[min(26rem,42vw)] max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full",
				!panelPresent && "w-0 pointer-events-none max-md:w-0",
			)}
		>
			<div
				className={cn(
					"relative my-2 mr-2 flex h-[calc(100%-1rem)] min-w-[22rem] overflow-hidden rounded-xl border border-black/10 bg-background shadow-[0_18px_48px_rgba(0,0,0,0.08)] transition-[transform,opacity] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] max-md:m-0 max-md:h-full max-md:min-w-0 max-md:rounded-none max-md:border-0 motion-reduce:transform-none motion-reduce:transition-none dark:border-white/10 dark:shadow-[0_20px_56px_rgba(0,0,0,0.3)]",
					open ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0",
				)}
			>
				<HistoryRail
					open={historyOpen}
					conversations={conversations.data ?? []}
					loading={conversations.isLoading}
					selectedConversationId={selectedConversationId}
					workspaceId={workspaceId}
					onClose={() => setHistoryOpen(false)}
					onNewChat={() => workspaceId && startNewChat(workspaceId)}
					onSelect={(conversationId) => {
						if (!workspaceId) return;
						selectConversation(workspaceId, conversationId);
						setHistoryOpen(false);
					}}
					onDeleted={(conversationId, fallbackId) => {
						if (!workspaceId) return;
						removeConversation(workspaceId, conversationId, fallbackId);
					}}
				/>
				<button
					type="button"
					aria-label="Close chat history"
					aria-hidden={!historyOpen}
					inert={!historyOpen}
					onClick={() => setHistoryOpen(false)}
					className={cn(
						"absolute inset-0 z-10 cursor-default bg-black/[0.025] backdrop-blur-[1px] transition-opacity duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none dark:bg-black/10",
						historyOpen ? "opacity-100" : "pointer-events-none opacity-0",
					)}
				/>

				<div className="flex min-w-0 flex-1 flex-col bg-background">
					<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={
								historyOpen ? "Close chat history" : "Open chat history"
							}
							aria-expanded={historyOpen}
							onClick={() => setHistoryOpen(!historyOpen)}
							className="rounded-md text-muted-foreground"
						>
							<HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={1.8} />
						</Button>
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
								<TradstryMark className="size-3.5" />
							</span>
							<h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.015em]">
								<AnimatePresence initial={false} mode="popLayout">
									<motion.span
										key={title}
										className="block truncate"
										initial={{ opacity: 0, filter: "blur(2px)" }}
										animate={{ opacity: 1, filter: "blur(0px)" }}
										exit={{ opacity: 0, filter: "blur(1px)" }}
										transition={{ duration: shouldReduceMotion ? 0.08 : 0.14 }}
									>
										{title}
									</motion.span>
								</AnimatePresence>
							</h2>
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="About Ask Tradstry"
									className="rounded-md text-muted-foreground"
								>
									<HugeiconsIcon
										icon={InformationCircleIcon}
										strokeWidth={1.8}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="max-w-56 text-center">
								Answers use your active workspace and show their sources.
							</TooltipContent>
						</Tooltip>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Close Ask Tradstry"
							onClick={() => setOpen(false)}
							className="rounded-md text-muted-foreground"
						>
							<HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
						</Button>
					</header>

					<ScrollArea
						viewportRef={threadViewportRef}
						className="min-h-0 flex-1"
					>
						<div className="min-h-full px-4 py-5">
							<AnimatePresence initial={false} mode="wait">
								<motion.div
									key={threadKey}
									className="min-h-full"
									initial={{
										opacity: 0,
										filter: shouldReduceMotion ? "blur(0px)" : "blur(2px)",
										transform: shouldReduceMotion
											? "translateX(0px)"
											: "translateX(6px)",
									}}
									animate={{
										opacity: 1,
										filter: "blur(0px)",
										transform: "translateX(0px)",
									}}
									exit={{
										opacity: 0,
										filter: shouldReduceMotion ? "blur(0px)" : "blur(1px)",
										transform: shouldReduceMotion
											? "translateX(0px)"
											: "translateX(-4px)",
									}}
									transition={{
										duration: shouldReduceMotion ? 0.08 : 0.16,
										ease: QUICK_EASE,
									}}
								>
									<PanelBody
										workspaceName={workspace?.name}
										capabilitiesLoading={capabilities.isLoading}
										capabilitiesError={capabilities.error}
										enabled={agentReady}
										messagesLoading={
											messages.isLoading || selectingInitialConversation
										}
										messagesError={messages.error}
										messages={messages.data ?? []}
										activitySummaryByMessage={activitySummaryByMessage}
										latestUserMessageId={latestUserMessage?.id}
										latestUserMessageRef={latestUserMessageRef}
										turnTailHeight={turnAnchor?.tailHeight ?? 0}
										isNewChat={isNewChat}
										activeRun={activeRun}
										runStatus={run.data?.status ?? "RUNNING"}
										liveActivity={runActivity.entries}
										runError={runActivity.error}
										openExternal={platform.openExternal}
										shouldReduceMotion={Boolean(shouldReduceMotion)}
									/>
								</motion.div>
							</AnimatePresence>
							<div ref={threadEndRef} aria-hidden="true" className="h-px" />
						</div>
					</ScrollArea>

					<div className="relative shrink-0 px-3 pb-3">
						<AnimatePresence initial={false}>
							{contextPickerOpen && activeMention ? (
								<ContextPicker
									key={`${draftKey}:${activeMention.start}`}
									query={activeMention.query}
									results={contextResults}
									loading={contextSearch.isLoading || contextSearch.isFetching}
									error={contextSearch.error}
									activeIndex={activeContextIndex}
									selectedKeys={
										new Set(selectedContexts.map((item) => item.key))
									}
									customRangeOpen={customRangeOpen}
									onActiveIndexChange={setActiveContextIndex}
									onSelect={chooseContext}
									onOpenCustomRange={() => setCustomRangeOpen(true)}
									onCloseCustomRange={() => setCustomRangeOpen(false)}
								/>
							) : null}
						</AnimatePresence>
						{sendError ? (
							<div className="mb-2 flex items-start gap-2 rounded-lg bg-destructive/8 px-3 py-2 text-xs text-destructive">
								<HugeiconsIcon
									icon={AlertCircleIcon}
									strokeWidth={1.8}
									className="mt-0.5 size-3.5 shrink-0"
								/>
								<span>{sendError}</span>
							</div>
						) : null}
						<form
							onSubmit={(event) => {
								event.preventDefault();
								void submit();
							}}
							className="rounded-2xl border border-border/80 bg-background p-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] focus-within:border-foreground/20 focus-within:ring-2 focus-within:ring-foreground/5 dark:shadow-[0_10px_32px_rgba(0,0,0,0.2)]"
						>
							<ContextChips
								selections={selectedContexts}
								onRemove={(key) =>
									setContexts(
										draftKey,
										removeContextSelection(selectedContexts, key),
									)
								}
							/>
							<ScrollArea className="w-full [&>[data-radix-scroll-area-viewport]]:max-h-48 [&>[data-radix-scroll-area-viewport]>div]:!block">
								<textarea
									ref={textareaRef}
									value={draft}
									onChange={(event) => {
										setDraft(draftKey, event.target.value);
										setCursor(
											event.target.selectionStart ?? event.target.value.length,
										);
										setDismissedMention(null);
										setCustomRangeOpen(false);
									}}
									onSelect={(event) =>
										setCursor(
											event.currentTarget.selectionStart ?? draft.length,
										)
									}
									onKeyDown={(event) => {
										if (contextPickerOpen && activeMention) {
											if (event.key === "Escape") {
												event.preventDefault();
												event.stopPropagation();
												if (customRangeOpen) setCustomRangeOpen(false);
												else setDismissedMention(activeMentionKey);
												return;
											}
											if (
												event.key === "ArrowDown" ||
												event.key === "ArrowUp"
											) {
												event.preventDefault();
												if (!contextResults.length) return;
												const delta = event.key === "ArrowDown" ? 1 : -1;
												setActiveContextIndex(
													(current) =>
														(current + delta + contextResults.length) %
														contextResults.length,
												);
												return;
											}
											if (event.key === "Enter" && !event.shiftKey) {
												event.preventDefault();
												const selection = contextResults[activeContextIndex];
												if (selection) chooseContext(selection);
												return;
											}
										}
										if (event.key === "Enter" && !event.shiftKey) {
											event.preventDefault();
											void submit();
										}
									}}
									disabled={!workspaceId || !agentReady}
									rows={1}
									maxLength={32_000}
									placeholder={
										!workspaceId
											? "Select a workspace first"
											: agentReady
												? "Ask about your trading…"
												: "Ask Tradstry is unavailable"
									}
									aria-label="Message Ask Tradstry"
									className="min-h-14 w-full resize-none overflow-hidden bg-transparent px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
								/>
							</ScrollArea>
							<div className="flex items-center justify-between px-1 pb-0.5">
								<span className="min-w-0 truncate text-[0.65rem] text-muted-foreground">
									{workspace
										? `${workspace.name} · Type @ to add context`
										: "No workspace"}
								</span>
								<AnimatePresence initial={false} mode="popLayout">
									<motion.div
										key={isRunning && activeRun ? "stop" : "send"}
										initial={{
											opacity: 0,
											transform: shouldReduceMotion
												? "scale(1)"
												: "scale(0.96)",
										}}
										animate={{ opacity: 1, transform: "scale(1)" }}
										exit={{
											opacity: 0,
											transform: shouldReduceMotion
												? "scale(1)"
												: "scale(0.96)",
										}}
										transition={{
											duration: shouldReduceMotion ? 0.08 : 0.14,
											ease: QUICK_EASE,
										}}
									>
										{isRunning && activeRun ? (
											<Button
												type="button"
												variant="outline"
												size="icon-sm"
												aria-label="Stop response"
												disabled={cancelRun.isPending}
												onClick={() => cancelRun.mutate(activeRun.runId)}
												className="rounded-full"
											>
												<HugeiconsIcon icon={StopIcon} strokeWidth={2} />
											</Button>
										) : (
											<Button
												type="submit"
												size="icon-sm"
												aria-label="Send message"
												disabled={composerDisabled || !draft.trim()}
												className="rounded-full"
											>
												{isSending ? (
													<HugeiconsIcon
														icon={Loading03Icon}
														strokeWidth={2}
														className="animate-spin"
													/>
												) : (
													<HugeiconsIcon
														icon={ArrowUp02Icon}
														strokeWidth={2.2}
													/>
												)}
											</Button>
										)}
									</motion.div>
								</AnimatePresence>
							</div>
						</form>
					</div>
				</div>
			</div>
		</aside>
	);
}

function HistoryRail({
	open,
	conversations,
	loading,
	selectedConversationId,
	workspaceId,
	onClose,
	onNewChat,
	onSelect,
	onDeleted,
}: {
	open: boolean;
	conversations: AgentConversation[];
	loading: boolean;
	selectedConversationId: string | null;
	workspaceId: string | null;
	onClose: () => void;
	onNewChat: () => void;
	onSelect: (conversationId: string) => void;
	onDeleted: (conversationId: string, fallbackId: string | null) => void;
}) {
	const renameConversation = useRenameAgentConversation();
	const deleteConversation = useDeleteAgentConversation(workspaceId);
	const [editingId, setEditingId] = React.useState<string | null>(null);
	const [editTitle, setEditTitle] = React.useState("");
	const [deleteTarget, setDeleteTarget] =
		React.useState<AgentConversation | null>(null);
	const [historyError, setHistoryError] = React.useState<string | null>(null);

	const saveTitle = async (conversation: AgentConversation) => {
		const title = editTitle.trim();
		if (!title) return;
		setHistoryError(null);
		try {
			await renameConversation.mutateAsync({
				conversationId: conversation.id,
				title,
			});
			setEditingId(null);
		} catch (error) {
			setHistoryError(
				error instanceof Error ? error.message : "Could not rename this chat.",
			);
		}
	};

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		setHistoryError(null);
		try {
			await deleteConversation.mutateAsync(deleteTarget.id);
			const fallbackId = nextConversationAfterDelete(
				conversations,
				deleteTarget.id,
			);
			onDeleted(deleteTarget.id, fallbackId);
			setDeleteTarget(null);
		} catch (error) {
			setHistoryError(
				error instanceof Error ? error.message : "Could not delete this chat.",
			);
		}
	};

	return (
		<>
			<div
				aria-hidden={!open}
				inert={!open}
				className={cn(
					"absolute inset-y-0 left-0 z-20 flex w-60 flex-col overflow-hidden border-r border-border/60 bg-background shadow-[14px_0_36px_rgba(0,0,0,0.12)] transition-[transform,opacity] duration-[220ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-opacity dark:shadow-[16px_0_42px_rgba(0,0,0,0.35)]",
					open
						? "translate-x-0 opacity-100 max-md:w-[82%]"
						: "-translate-x-full opacity-0 pointer-events-none",
				)}
			>
				<div className="flex h-12 w-60 shrink-0 items-center gap-2 border-b border-border/60 px-3">
					<span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border/60">
						<HugeiconsIcon
							icon={Time01Icon}
							strokeWidth={1.8}
							className="size-4"
						/>
					</span>
					<span className="text-sm font-semibold tracking-[-0.015em]">
						History
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Close chat history"
						onClick={onClose}
						className="ml-auto rounded-md text-muted-foreground"
					>
						<HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
					</Button>
				</div>
				<div className="w-60 p-2">
					<Button
						type="button"
						variant="ghost"
						onClick={onNewChat}
						disabled={!workspaceId}
						className="h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-sm"
					>
						<HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
						New chat
					</Button>
				</div>
				<div className="flex items-center px-3 pb-2 pt-3">
					<span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
						Chats
					</span>
					<span className="ml-auto text-[0.65rem] tabular-nums text-muted-foreground/70">
						{conversations.length || null}
					</span>
				</div>
				{historyError ? (
					<p
						role="alert"
						className="mx-3 mb-2 text-[0.65rem] leading-4 text-destructive"
					>
						{historyError}
					</p>
				) : null}
				<div className="min-h-0 w-60 flex-1 overflow-y-auto px-2 pb-3">
					{loading ? (
						<div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
							<HugeiconsIcon
								icon={Loading03Icon}
								strokeWidth={1.8}
								className="size-3.5 animate-spin"
							/>
							Loading chats…
						</div>
					) : conversations.length ? (
						<div className="space-y-1">
							<AnimatePresence initial={false}>
								{conversations.map((conversation) => {
									const selected = selectedConversationId === conversation.id;
									const editing = editingId === conversation.id;
									return (
										<motion.div
											layout="position"
											key={conversation.id}
											exit={{ opacity: 0, transform: "translateX(-6px)" }}
											transition={{ duration: 0.14, ease: QUICK_EASE }}
											className={cn(
												"group/chat relative flex min-h-12 items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition-[background-color,border-color] duration-150",
												selected
													? "border-border/60 bg-muted/80"
													: "hover:bg-muted/45 focus-within:bg-muted/45",
											)}
										>
											<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/75 ring-1 ring-border/60">
												<HugeiconsIcon
													icon={AiChat01Icon}
													strokeWidth={1.8}
													className="size-[1.05rem]"
												/>
											</span>
											{editing ? (
												<Input
													autoFocus
													value={editTitle}
													maxLength={120}
													aria-label="Chat title"
													disabled={renameConversation.isPending}
													onChange={(event) => setEditTitle(event.target.value)}
													onKeyDown={(event) => {
														if (event.key === "Enter") {
															event.preventDefault();
															void saveTitle(conversation);
														}
														if (event.key === "Escape") setEditingId(null);
													}}
													className="h-8 flex-1 rounded-lg bg-background px-2 text-xs"
												/>
											) : (
												<button
													type="button"
													onClick={() => onSelect(conversation.id)}
													className="min-w-0 flex-1 text-left outline-none"
												>
													<span className="block truncate text-xs font-medium text-foreground/90">
														{conversation.title || "Untitled chat"}
													</span>
													<span className="mt-0.5 block text-[0.62rem] text-muted-foreground">
														{formatConversationUpdatedAt(
															conversation.updatedAt,
														)}
													</span>
												</button>
											)}
											{editing ? (
												<div className="flex shrink-0 items-center gap-0.5">
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														aria-label="Save chat title"
														disabled={
															renameConversation.isPending || !editTitle.trim()
														}
														onClick={() => void saveTitle(conversation)}
														className="rounded-md"
													>
														<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														aria-label="Cancel renaming"
														disabled={renameConversation.isPending}
														onClick={() => setEditingId(null)}
														className="rounded-md text-muted-foreground"
													>
														<HugeiconsIcon
															icon={Cancel01Icon}
															strokeWidth={1.8}
														/>
													</Button>
												</div>
											) : (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															type="button"
															variant="ghost"
															size="icon"
															aria-label={`More options for ${conversation.title || "Untitled chat"}`}
															className={cn(
																"shrink-0 rounded-lg text-muted-foreground opacity-0 transition-[opacity,background-color] duration-150 group-hover/chat:opacity-100 group-focus-within/chat:opacity-100 data-[state=open]:bg-background data-[state=open]:opacity-100 max-md:opacity-100 [&_svg]:size-4!",
															)}
														>
															<HugeiconsIcon
																icon={MoreHorizontalIcon}
																strokeWidth={1.8}
															/>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end" className="w-36">
														<DropdownMenuItem
															onSelect={() => {
																setHistoryError(null);
																setEditTitle(
																	conversation.title || "Untitled chat",
																);
																setEditingId(conversation.id);
															}}
														>
															<HugeiconsIcon
																icon={Edit02Icon}
																strokeWidth={1.8}
															/>
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															variant="destructive"
															onSelect={() => {
																setHistoryError(null);
																setDeleteTarget(conversation);
															}}
														>
															<HugeiconsIcon
																icon={Delete02Icon}
																strokeWidth={1.8}
															/>
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											)}
										</motion.div>
									);
								})}
							</AnimatePresence>
						</div>
					) : (
						<p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
							Your conversations will appear here.
						</p>
					)}
				</div>
			</div>

			<Dialog
				open={Boolean(deleteTarget)}
				onOpenChange={(nextOpen) => {
					if (!nextOpen && !deleteConversation.isPending) setDeleteTarget(null);
				}}
			>
				<DialogContent showCloseButton={false} className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Delete this chat?</DialogTitle>
						<DialogDescription>
							“{deleteTarget?.title || "Untitled chat"}” and all of its messages
							will be permanently deleted.
						</DialogDescription>
					</DialogHeader>
					{historyError ? (
						<p role="alert" className="text-xs text-destructive">
							{historyError}
						</p>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={deleteConversation.isPending}
							onClick={() => setDeleteTarget(null)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={deleteConversation.isPending}
							onClick={() => void confirmDelete()}
						>
							{deleteConversation.isPending ? "Deleting…" : "Delete chat"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function PanelBody({
	workspaceName,
	capabilitiesLoading,
	capabilitiesError,
	enabled,
	messagesLoading,
	messagesError,
	messages,
	activitySummaryByMessage,
	latestUserMessageId,
	latestUserMessageRef,
	turnTailHeight,
	isNewChat,
	activeRun,
	runStatus,
	liveActivity,
	runError,
	openExternal,
	shouldReduceMotion,
}: {
	workspaceName?: string;
	capabilitiesLoading: boolean;
	capabilitiesError: Error | null;
	enabled: boolean;
	messagesLoading: boolean;
	messagesError: Error | null;
	messages: AgentMessage[];
	activitySummaryByMessage: Map<string, AgentActivitySummary>;
	latestUserMessageId?: string;
	latestUserMessageRef: React.RefObject<HTMLDivElement | null>;
	turnTailHeight: number;
	isNewChat: boolean;
	activeRun?: { runId: string; conversationId: string };
	runStatus: AgentRunStatus;
	liveActivity: AgentActivityEntry[];
	runError: Error | null;
	openExternal: (url: string) => void | Promise<void>;
	shouldReduceMotion: boolean;
}) {
	if (capabilitiesLoading)
		return <CenteredLoading label="Loading Ask Tradstry…" />;
	if (capabilitiesError) {
		return (
			<CenteredState
				title="Couldn’t open Ask Tradstry"
				detail="Try again in a moment."
			/>
		);
	}
	if (!enabled) {
		return (
			<CenteredState
				title="Ask Tradstry is turned off"
				detail="Enable the agent service to start a conversation."
			/>
		);
	}
	if (!workspaceName) {
		return (
			<CenteredState
				title="Choose a workspace"
				detail="Ask Tradstry answers from one workspace at a time."
			/>
		);
	}
	if (messagesLoading && !isNewChat)
		return <CenteredLoading label="Loading chat…" />;
	if (messagesError) {
		return (
			<CenteredState
				title="Couldn’t load this chat"
				detail="Close and reopen the panel to retry."
			/>
		);
	}
	if (isNewChat || (!messages.length && !activeRun)) {
		return (
			<div className="flex min-h-full flex-col items-center justify-center px-5 pb-20 text-center">
				<span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
					<TradstryMark className="size-6" />
				</span>
				<h3 className="text-base font-semibold tracking-[-0.02em]">
					Ask Tradstry
				</h3>
				<p className="mt-2 max-w-64 text-xs leading-5 text-muted-foreground">
					Review trades, explain performance, or connect patterns across{" "}
					{workspaceName}.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<AnimatePresence initial={false}>
				{messages.map((message) => (
					<motion.div
						ref={
							message.id === latestUserMessageId
								? latestUserMessageRef
								: undefined
						}
						key={message.id}
						initial={{
							opacity: 0,
							transform: shouldReduceMotion
								? "translateY(0px)"
								: "translateY(5px)",
						}}
						animate={{ opacity: 1, transform: "translateY(0px)" }}
						exit={{ opacity: 0 }}
						transition={{
							duration: shouldReduceMotion ? 0.08 : 0.16,
							ease: QUICK_EASE,
						}}
					>
						<AgentMessageView
							message={message}
							activitySummary={activitySummaryByMessage.get(message.id)}
							openExternal={openExternal}
						/>
					</motion.div>
				))}
			</AnimatePresence>
			<AnimatePresence initial={false}>
				{activeRun ? (
					<motion.div
						key="run-progress"
						initial={{
							opacity: 0,
							transform: shouldReduceMotion
								? "translateY(0px)"
								: "translateY(4px)",
						}}
						animate={{ opacity: 1, transform: "translateY(0px)" }}
						exit={{
							opacity: 0,
							transform: shouldReduceMotion
								? "translateY(0px)"
								: "translateY(-2px)",
						}}
						transition={{
							duration: shouldReduceMotion ? 0.08 : 0.14,
							ease: QUICK_EASE,
						}}
					>
						<div className="flex items-start gap-2.5">
							<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
								<HugeiconsIcon
									icon={BotIcon}
									strokeWidth={1.8}
									className="size-3.5"
								/>
							</span>
							<div className="min-w-0 flex-1 pt-0.5">
								<AgentActivityTimeline
									liveEntries={liveActivity}
									runStatus={runStatus}
									running={runStatus === "QUEUED" || runStatus === "RUNNING"}
									error={runError}
								/>
							</div>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
			{turnTailHeight > 0 ? (
				<div aria-hidden="true" style={{ height: turnTailHeight }} />
			) : null}
		</div>
	);
}

function AgentMessageView({
	message,
	activitySummary,
	openExternal,
}: {
	message: AgentMessage;
	activitySummary?: AgentActivitySummary;
	openExternal: (url: string) => void | Promise<void>;
}) {
	const parsed = parseAgentMessage(message);
	const copyText = messageTextForClipboard(parsed);
	if (parsed.kind === "user") {
		return (
			<div className="group/message flex flex-col items-end gap-1.5">
				<div className="max-w-[86%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-sm leading-6 text-background">
					{parsed.text}
				</div>
				{parsed.contexts.length ? (
					<div className="flex max-w-[86%] flex-wrap justify-end gap-1.5">
						{parsed.contexts.map((context) => (
							<span
								key={context.key}
								className="flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/55 px-2 py-1 text-[0.65rem] text-foreground/80"
							>
								<ContextIcon
									kind={context.kind}
									className="size-3 shrink-0 text-muted-foreground"
								/>
								<span className="max-w-40 truncate">{context.title}</span>
							</span>
						))}
					</div>
				) : null}
				<MessageCopyAction text={copyText} align="end" />
			</div>
		);
	}
	if (parsed.kind === "action") {
		return (
			<div className="mx-auto w-fit rounded-full bg-muted px-3 py-1 text-[0.65rem] font-medium text-muted-foreground">
				Action {parsed.status}
			</div>
		);
	}
	if (parsed.kind === "unknown") {
		return <p className="text-xs text-muted-foreground">{parsed.text}</p>;
	}
	return (
		<div className="group/message flex items-start gap-2.5">
			<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
				<HugeiconsIcon icon={BotIcon} strokeWidth={1.8} className="size-3.5" />
			</span>
			<div className="min-w-0 max-w-[calc(100%-2.125rem)]">
				{activitySummary ? (
					<div className="mb-2 pt-0.5">
						<AgentActivityTimeline
							messageId={message.id}
							summary={activitySummary}
						/>
					</div>
				) : null}
				<Card className="gap-0 rounded-2xl rounded-bl-md border-border/60 bg-muted/35 py-0 shadow-none">
					<CardContent className="space-y-3 px-3.5 py-3">
						{parsed.blocks.length ? (
							parsed.blocks.map((block, index) => (
								<AnswerBlockView key={`${message.id}-${index}`} block={block} />
							))
						) : (
							<p className="text-sm text-muted-foreground">
								No answer content was returned.
							</p>
						)}
						{message.sources.length ? (
							<div className="flex flex-wrap gap-1.5 pt-1">
								{message.sources.map((source, index) => {
									const label = source.title || `Source ${index + 1}`;
									const sourceUrl = source.sourceUrl;
									return sourceUrl ? (
										<button
											type="button"
											key={`${source.sourceType}-${source.title}-${index}`}
											onClick={() => void openExternal(sourceUrl)}
											className="max-w-full truncate rounded-full border border-border/70 px-2 py-1 text-[0.65rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										>
											{label}
										</button>
									) : (
										<span
											key={`${source.sourceType}-${source.title}-${index}`}
											className="max-w-full truncate rounded-full border border-border/70 px-2 py-1 text-[0.65rem] text-muted-foreground"
										>
											{label}
										</span>
									);
								})}
							</div>
						) : null}
					</CardContent>
				</Card>
				<MessageCopyAction text={copyText} align="start" />
			</div>
		</div>
	);
}

async function writeTextToClipboard(text: string) {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}
	const input = document.createElement("textarea");
	input.value = text;
	input.setAttribute("readonly", "");
	input.style.position = "fixed";
	input.style.opacity = "0";
	document.body.appendChild(input);
	input.select();
	const copied = document.execCommand("copy");
	input.remove();
	if (!copied) throw new Error("clipboard unavailable");
}

function MessageCopyAction({
	text,
	align,
}: {
	text: string | null;
	align: "start" | "end";
}) {
	const [state, setState] = React.useState<"idle" | "copied" | "failed">(
		"idle",
	);

	React.useEffect(() => {
		if (state === "idle") return;
		const timeout = window.setTimeout(() => setState("idle"), 1800);
		return () => window.clearTimeout(timeout);
	}, [state]);

	if (!text) return null;
	const label =
		state === "copied"
			? "Copied"
			: state === "failed"
				? "Couldn’t copy"
				: "Copy message";

	return (
		<div
			className={cn(
				"flex h-6 pt-0.5",
				align === "end" ? "justify-end" : "justify-start",
			)}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={label}
						onClick={async () => {
							try {
								await writeTextToClipboard(text);
								setState("copied");
							} catch {
								setState("failed");
							}
						}}
						className={cn(
							"size-6 rounded-md text-muted-foreground opacity-0 transition-[opacity,color,background-color] duration-150 group-focus-within/message:opacity-100 group-hover/message:opacity-100 hover:text-foreground max-md:opacity-100",
							state !== "idle" && "opacity-100",
							state === "failed" && "text-destructive hover:text-destructive",
						)}
					>
						<HugeiconsIcon
							icon={state === "copied" ? Tick02Icon : Copy01Icon}
							strokeWidth={2}
							className="size-3.5"
						/>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">{label}</TooltipContent>
			</Tooltip>
		</div>
	);
}

function AnswerBlockView({ block }: { block: AgentAnswerBlock }) {
	if (block.kind === "paragraph") {
		return (
			<p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
				{block.text}
			</p>
		);
	}
	if (block.kind === "metric") {
		return (
			<div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
				<div className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
					{block.label}
				</div>
				<div className="mt-1 text-lg font-semibold tracking-[-0.025em]">
					{block.value}
				</div>
			</div>
		);
	}
	if (block.kind === "list") {
		return (
			<div>
				{block.title ? (
					<h4 className="mb-1.5 text-xs font-semibold">{block.title}</h4>
				) : null}
				<ul className="space-y-1.5 pl-4 text-sm leading-5 text-foreground/85">
					{block.items.map((item) => (
						<li
							key={item}
							className="list-disc pl-0.5 marker:text-muted-foreground"
						>
							{item}
						</li>
					))}
				</ul>
			</div>
		);
	}
	if (block.kind === "warning") {
		return (
			<div className="flex items-start gap-2 rounded-xl bg-amber-500/8 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-300">
				<HugeiconsIcon
					icon={AlertCircleIcon}
					strokeWidth={1.8}
					className="mt-0.5 size-3.5 shrink-0"
				/>
				<span>{block.text}</span>
			</div>
		);
	}
	return <AgentActionCard proposalId={block.proposalId} />;
}

function AgentActionCard({ proposalId }: { proposalId: string }) {
	const proposal = useAgentActionProposal(proposalId);
	const approve = useApproveAgentAction();
	const reject = useRejectAgentAction();
	const preview = parsePreview(proposal.data);
	const pending = proposal.data?.status === "pending";

	return (
		<div className="rounded-xl border border-border/80 bg-muted/20 p-3">
			{proposal.isLoading ? (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<HugeiconsIcon
						icon={Loading03Icon}
						strokeWidth={1.8}
						className="size-3.5 animate-spin"
					/>
					Loading proposed action…
				</div>
			) : proposal.isError || !proposal.data ? (
				<p className="text-xs text-destructive">
					This proposed action is unavailable.
				</p>
			) : (
				<>
					<div className="text-xs font-semibold">{preview.title}</div>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						{preview.summary}
					</p>
					<div className="mt-3 flex items-center gap-2">
						{pending ? (
							<>
								<Button
									type="button"
									size="sm"
									disabled={approve.isPending || reject.isPending}
									onClick={() =>
										approve.mutate({
											proposalId,
											idempotencyKey: crypto.randomUUID(),
										})
									}
								>
									Approve
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									disabled={approve.isPending || reject.isPending}
									onClick={() => reject.mutate(proposalId)}
								>
									Reject
								</Button>
							</>
						) : (
							<span className="rounded-full bg-muted px-2 py-1 text-[0.65rem] font-medium capitalize text-muted-foreground">
								{proposal.data.status}
							</span>
						)}
					</div>
				</>
			)}
		</div>
	);
}

function parsePreview(proposal?: AgentActionProposal): {
	title: string;
	summary: string;
} {
	if (!proposal)
		return { title: "Proposed action", summary: "Review before approving." };
	try {
		const value = JSON.parse(proposal.previewJson) as {
			title?: unknown;
			summary?: unknown;
		};
		return {
			title: typeof value.title === "string" ? value.title : "Proposed action",
			summary:
				typeof value.summary === "string"
					? value.summary
					: "Review before approving.",
		};
	} catch {
		return { title: "Proposed action", summary: "Review before approving." };
	}
}

function CenteredLoading({ label }: { label: string }) {
	return (
		<div className="flex min-h-full flex-col items-center justify-center pb-20 text-center text-xs text-muted-foreground">
			<HugeiconsIcon
				icon={Loading03Icon}
				strokeWidth={1.8}
				className="mb-3 size-5 animate-spin"
			/>
			{label}
		</div>
	);
}

function CenteredState({ title, detail }: { title: string; detail: string }) {
	return (
		<div className="flex min-h-full flex-col items-center justify-center px-6 pb-20 text-center">
			<span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
				<HugeiconsIcon
					icon={ChatSparkIcon}
					strokeWidth={1.6}
					className="size-5"
				/>
			</span>
			<h3 className="text-sm font-semibold">{title}</h3>
			<p className="mt-1.5 max-w-64 text-xs leading-5 text-muted-foreground">
				{detail}
			</p>
		</div>
	);
}
