"use client";

import { LockIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Input } from "@tradstry/app-ui/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import {
	useAddHindsightNote,
	useSaveActionNote,
} from "@tradstry/app-ui/hooks/journal-review";
import type {
	ActionNote,
	TradeAction,
} from "@tradstry/app-ui/lib/service/journal-flow";
import { money } from "../journal-format";

export const ACTION_LABELS: Record<TradeAction["kind"], string> = {
	entry: "Entry",
	add: "Add",
	trim: "Trim",
	exit: "Exit",
};
const PRICE_ERROR = "Enter a positive price, like 12.50.";
const TEXTAREA_CLASS =
	"min-h-20 w-full resize-none rounded-lg border border-input bg-muted/15 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const isPrice = (value: string) =>
	/^\d+(?:\.\d{1,28})?$/.test(value) && Number(value) > 0;

export function errorText(reason: unknown) {
	const message = reason instanceof Error ? reason.message : "Could not save";
	return message.startsWith("CONFLICT")
		? "This note changed somewhere else. Reload to see the latest."
		: message;
}

export function NoteEditor({
	workspaceId,
	entryId,
	action,
	note,
	followedByMore,
	onReload,
	onClose,
}: {
	workspaceId: string;
	entryId: string;
	action: TradeAction;
	note: ActionNote | undefined;
	followedByMore: boolean;
	onReload: () => void;
	onClose: () => void;
}) {
	const save = useSaveActionNote(workspaceId);
	const id = React.useId();
	const root = React.useRef<HTMLDivElement>(null);
	const [reason, setReason] = React.useState(note?.reason ?? "");
	const [stop, setStop] = React.useState(note?.stopPrice ?? "");
	const [target, setTarget] = React.useState(note?.targetPrice ?? "");
	const [error, setError] = React.useState<string | null>(null);
	const withPrices = action.kind === "entry";
	const invalid = [stop, target].some((value) => value && !isPrice(value));
	const empty = !reason.trim() && !stop && !target;
	const unchanged =
		!!note &&
		reason === note.reason &&
		stop === (note.stopPrice ?? "") &&
		target === (note.targetPrice ?? "");
	React.useEffect(() => {
		root.current?.scrollIntoView({ block: "nearest" });
	}, []);
	const submit = async () => {
		if (invalid) return setError(PRICE_ERROR);
		setError(null);
		try {
			await save.mutateAsync({
				input: {
					entryId,
					anchorExecutionId: action.anchorExecutionId,
					anchorRole: action.role,
					expectedVersion: note?.version ?? null,
					reason,
					stopPrice: stop || null,
					targetPrice: target || null,
				},
			});
			toast.success(`${ACTION_LABELS[action.kind]} note saved`);
			onClose();
		} catch (failure) {
			setError(errorText(failure));
		}
	};
	return (
		<div ref={root} className="mt-3 space-y-3 rounded-xl border bg-muted/20 p-3">
			<label className="block space-y-1.5 text-xs text-muted-foreground">
				{action.kind === "entry" ? "Why are you in?" : `Why this ${ACTION_LABELS[action.kind].toLowerCase()}?`}
				<textarea
					autoFocus
					value={reason}
					onChange={(event) => setReason(event.target.value)}
					placeholder={action.kind === "entry" ? "The setup, the trigger, what would prove you wrong" : "What changed"}
					maxLength={5000}
					rows={3}
					className={TEXTAREA_CLASS}
				/>
			</label>
			{withPrices && (
				<div className="grid gap-2 sm:grid-cols-2">
					<label htmlFor={`${id}-stop`} className="space-y-1 text-xs text-muted-foreground">
						Stop · used for R
						<Input
							id={`${id}-stop`}
							inputMode="decimal"
							placeholder="Price"
							value={stop}
							aria-invalid={!!stop && !isPrice(stop)}
							onChange={(event) => setStop(event.target.value)}
						/>
					</label>
					<label htmlFor={`${id}-target`} className="space-y-1 text-xs text-muted-foreground">
						Target
						<Input
							id={`${id}-target`}
							inputMode="decimal"
							placeholder="Optional"
							value={target}
							aria-invalid={!!target && !isPrice(target)}
							onChange={(event) => setTarget(event.target.value)}
						/>
					</label>
				</div>
			)}
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}{" "}
					{error.includes("Reload") && (
						<Button size="sm" variant="outline" onClick={onReload}>Reload</Button>
					)}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
					{followedByMore
						? "This trade already moved on, so the note will be marked as written after the fact."
						: "You can edit this until the next execution arrives."}
				</p>
				<Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
				<Button size="sm" disabled={save.isPending || empty || unchanged || invalid} onClick={() => void submit()}>
					{save.isPending ? "Saving…" : "Save note"}
				</Button>
			</div>
		</div>
	);
}

export function HindsightEditor({
	workspaceId,
	parentId,
	onClose,
}: {
	workspaceId: string;
	parentId: string;
	onClose: () => void;
}) {
	const add = useAddHindsightNote(workspaceId);
	const root = React.useRef<HTMLDivElement>(null);
	const [reason, setReason] = React.useState("");
	const [error, setError] = React.useState<string | null>(null);
	React.useEffect(() => {
		root.current?.scrollIntoView({ block: "nearest" });
	}, []);
	return (
		<div ref={root} className="mt-3 space-y-2 rounded-xl border bg-muted/20 p-3">
			<textarea
				autoFocus
				aria-label="Hindsight note"
				value={reason}
				onChange={(event) => setReason(event.target.value)}
				placeholder="What do you see now that you didn’t then?"
				maxLength={5000}
				rows={3}
				className={TEXTAREA_CLASS}
			/>
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
			<div className="flex flex-wrap items-center gap-2">
				<p className="min-w-0 flex-1 text-[11px] text-muted-foreground">Hindsight notes can’t be edited later.</p>
				<Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
				<Button
					size="sm"
					disabled={add.isPending || !reason.trim()}
					onClick={async () => {
						setError(null);
						try {
							await add.mutateAsync({ parentId, reason });
							toast.success("Hindsight note added");
							onClose();
						} catch (failure) {
							setError(errorText(failure));
						}
					}}
				>
					{add.isPending ? "Saving…" : "Add"}
				</Button>
			</div>
		</div>
	);
}

export function NoteText({
	note,
	action,
	currency,
}: {
	note: ActionNote;
	action?: TradeAction;
	currency: string | null;
}) {
	return (
		<div className="space-y-1.5 text-sm">
			{((note.locked && action) || note.writtenLate) && (
				<div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
					{note.locked && action && (
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="inline-flex items-center gap-1 rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
								>
									<HugeiconsIcon icon={LockIcon} className="size-3" strokeWidth={2} aria-hidden="true" />
									Locked
								</button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-64 space-y-1 p-3 text-xs">
								<p className="font-medium">Written before what came next.</p>
								<p className="text-muted-foreground">
									{action.kind === "exit"
										? "It locked when you reviewed the trade."
										: "It locked when the next execution arrived."}{" "}
									What you thought then stays as written. Add a hindsight note for what you think now.
								</p>
							</PopoverContent>
						</Popover>
					)}
					{note.writtenLate && (
						<span className="rounded-md border px-1.5 py-0.5">Written after the fact</span>
					)}
				</div>
			)}
			{note.reason && <p className="whitespace-pre-wrap">{note.reason}</p>}
			{(note.stopPrice || note.targetPrice) && (
				<p className="text-xs text-muted-foreground tabular-nums">
					{note.stopPrice && `Stop ${money(note.stopPrice, currency)}`}
					{note.stopPrice && note.targetPrice && " · "}
					{note.targetPrice && `Target ${money(note.targetPrice, currency)}`}
				</p>
			)}
		</div>
	);
}

export function AddNoteButton({ onClick, label }: { onClick: () => void; label: string }) {
	return (
		<Button size="sm" variant="ghost" className="-ml-2 text-muted-foreground" onClick={onClick}>
			<HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} aria-hidden="true" />
			{label}
		</Button>
	);
}
