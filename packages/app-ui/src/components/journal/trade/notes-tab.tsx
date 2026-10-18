"use client";

import { Notebook01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { NotebookEditor } from "@tradstry/app-ui/components/notebook/editor";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tradstry/app-ui/components/ui/empty";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import {
	useDeleteNotebookMedia,
	useNotebookNote,
	useUploadNotebookMedia,
} from "@tradstry/app-ui/hooks/notebook";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";

function ContextNotebook({ noteId }: { noteId: string }) {
	const note = useNotebookNote(noteId);
	const upload = useUploadNotebookMedia();
	const remove = useDeleteNotebookMedia();
	if (note.isLoading)
		return (
			<div role="status" className="min-h-64 p-4">
				<span className="sr-only">Loading notes…</span>
				<div aria-hidden="true" className="space-y-4 [&_[data-slot=skeleton]]:motion-reduce:animate-none">
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			</div>
		);
	if (note.isError || !note.data)
		return (
			<Button variant="ghost" onClick={() => void note.refetch()}>
				Retry loading notes
			</Button>
		);
	return (
		<div className="min-h-64 p-3">
			<NotebookEditor
				key={noteId}
				noteId={noteId}
				images={note.data.images}
				onNeedMediaRefresh={() => void note.refetch()}
				onUploadMedia={(file, hash, idempotencyKey, signal) =>
					upload.mutateAsync({ noteId, hash, idempotencyKey, file, signal })
				}
				onDeleteImage={async (hash) => {
					await remove.mutateAsync({ noteId, hash });
				}}
			/>
		</div>
	);
}

export function NotesTab({
	workspaceId,
	entryId,
	noteId,
	readOnly,
	refresh,
	onError,
}: {
	workspaceId: string;
	entryId: string;
	noteId: string | null;
	readOnly: boolean;
	refresh: () => Promise<unknown>;
	onError: (message: string) => void;
}) {
	const fetcher = useGraphQL();
	const owner = useTradstryPlatform().user.email;
	const cache = useQueryClient();
	const [creating, setCreating] = React.useState(false);
	const create = async () => {
		setCreating(true);
		const key = `tradstry:journal-note:${owner}:${workspaceId}:${entryId}`;
		try {
			const stored = localStorage.getItem(key);
			const request = stored
				? (JSON.parse(stored) as flow.Command)
				: flow.command(flow.ENSURE_NOTE, "ensureJournalContextNote", { workspaceId, entryId }, owner);
			localStorage.setItem(key, JSON.stringify(request));
			await flow.execute<string>(fetcher, request);
			localStorage.removeItem(key);
			await cache.invalidateQueries({ queryKey: ["notebook"] });
			await refresh();
		} catch (reason) {
			onError(reason instanceof Error ? reason.message : "Could not open your notes");
		} finally {
			setCreating(false);
		}
	};
	return (
		<section className="overflow-hidden rounded-xl border bg-card" aria-label="Notes and screenshots">
			<div className="border-b px-4 py-3">
				<h3 className="text-sm font-semibold">Notebook</h3>
				<p className="text-[11px] text-muted-foreground">Linked to this trade. Screenshots stay with it.</p>
			</div>
			{noteId ? (
				<ContextNotebook noteId={noteId} />
			) : (
				<Empty className="min-h-64 py-10">
					<EmptyHeader>
						<EmptyMedia variant="icon" className="size-10 rounded-xl">
							<HugeiconsIcon icon={Notebook01Icon} className="size-5" strokeWidth={1.8} aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No notes yet</EmptyTitle>
						<EmptyDescription>
							Add your reasoning, chart screenshots, or anything you want to remember about this trade.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button disabled={readOnly || creating} onClick={() => void create()}>
							{creating ? "Opening…" : "Add notes"}
						</Button>
					</EmptyContent>
				</Empty>
			)}
		</section>
	);
}
