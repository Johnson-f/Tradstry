"use client";

import {
	useActiveWorkspace,
	useWorkspacesLoading,
} from "@tradstry/app-ui/components/workspaces/hooks";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { JournalWorkspace } from "./journal-workspace";

function JournalSkeleton() {
	return (
		<div role="status" className="flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-5">
			<span className="sr-only">Loading your journal…</span>
			<div aria-hidden="true" className="space-y-4 [&_[data-slot=skeleton]]:motion-reduce:animate-none">
				<Skeleton className="h-8 w-72" />
				<Skeleton className="h-9 w-64" />
				<Skeleton className="h-48 w-full rounded-xl" />
			</div>
		</div>
	);
}

export function Journal() {
	const activeWorkspace = useActiveWorkspace();
	const loading = useWorkspacesLoading();

	if (!activeWorkspace && loading) return <JournalSkeleton />;

	return activeWorkspace ? (
		<JournalWorkspace
			key={activeWorkspace.id}
			workspaceId={activeWorkspace.id}
		/>
	) : (
		<p className="p-6 text-sm text-muted-foreground">
			Choose a workspace to open your journal.
		</p>
	);
}
