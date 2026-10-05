"use client";

import {
	useActiveWorkspace,
	useWorkspacesLoading,
} from "@tradstry/app-ui/components/workspaces/hooks";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import { TradeDetailSkeleton } from "./journal-trade-detail";
import { JournalWorkspace } from "./journal-workspace";

export function Journal() {
	const activeWorkspace = useActiveWorkspace();
	const loading = useWorkspacesLoading();
	const { pathname } = useTradstryPlatform();
	const route = pathname.split("?")[0] ?? pathname;

	if (!activeWorkspace && loading) {
		return (
			<TradeDetailSkeleton
				review={route === "/dashboard/journal/review"}
				hasBack={
					route.startsWith("/dashboard/journal/") &&
					route !== "/dashboard/journal/review"
				}
			/>
		);
	}

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
