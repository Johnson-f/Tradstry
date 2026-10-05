"use client";

import { BankIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrokerageHistorySetup } from "@tradstry/app-ui/components/brokerage/history-import-policy";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tradstry/app-ui/components/ui/empty";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import {
	useInitiateConnection,
	useSnapTradeOAuthAvailable,
	useSnapTradeOAuthFlow,
} from "@tradstry/app-ui/hooks/brokerage";
import { platformUrl, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { useState } from "react";
import { toast } from "sonner";

export function BrokerageEmptyState() {
	const workspace = useActiveWorkspace();
	const initiate = useInitiateConnection();
	const [connecting, setConnecting] = useState(false);
	const platform = useTradstryPlatform();
	const oauthAvailable = useSnapTradeOAuthAvailable();
	const oauth = useSnapTradeOAuthFlow();

	async function handleConnect() {
		if (!workspace) return;

		setConnecting(true);

		try {
			// Build callback URL with workspaceId so the callback page knows which workspace to update
			const callbackUrl = platformUrl(
				platform,
				`/dashboard/brokerage/callback?workspaceId=${workspace.id}`,
			);

			const portal = await initiate.mutateAsync({
				workspaceId: workspace.id,
				customRedirect: callbackUrl,
			});

			// Redirect the user to the SnapTrade connection portal
			await platform.openExternal(portal.redirectUrl);
		} catch (err) {
			toast.error(
				`Failed to connect: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
			setConnecting(false);
		}
	}

	async function handleOAuthConnect() {
		if (!workspace) return;
		try {
			await oauth.start(workspace.id);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not start SnapTrade authorization",
			);
		}
	}

	if (workspace && oauth.phase === "setup" && oauth.accounts.data) {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<BrokerageHistorySetup
					accounts={oauth.accounts.data}
					workspaceName={workspace.name}
					isSubmitting={oauth.isSubmitting}
					onSubmit={(value) => {
						void (async () => {
							try {
								await oauth.finishConnect(workspace.id, value);
								toast.success("SnapTrade accounts connected");
							} catch (error) {
								toast.error(
									error instanceof Error
										? error.message
										: "Could not finish SnapTrade setup",
								);
							}
						})();
					}}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty className="max-w-sm gap-5 border-none p-0">
				<EmptyHeader className="gap-2">
					<EmptyMedia variant="icon" className="size-11 rounded-xl">
						<HugeiconsIcon icon={BankIcon} strokeWidth={2} />
					</EmptyMedia>
					<EmptyTitle>Connect your brokerage</EmptyTitle>
					<EmptyDescription className="max-w-64">
						Sync your trades, positions, and balances.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent className="max-w-60 gap-2">
					<Button
						size="sm"
						className="h-9 w-full"
						onClick={handleConnect}
						disabled={connecting || !workspace}
					>
						{connecting ? "Connecting…" : "Connect brokerage"}
					</Button>
					{oauthAvailable.data ? (
						<Button
							size="sm"
							variant="ghost"
							className="h-8 w-full text-muted-foreground hover:text-foreground"
							onClick={() => void handleOAuthConnect()}
							disabled={
								!workspace || oauth.isStarting || oauth.phase === "waiting"
							}
						>
							{oauth.phase === "waiting" || oauth.phase === "reauthorizing"
								? "Waiting for SnapTrade…"
								: "Use existing SnapTrade account"}
						</Button>
					) : null}
					{oauth.phase === "error" ? (
						<p role="alert" className="text-xs text-destructive">
							SnapTrade authorization did not finish. You can try again.
						</p>
					) : null}
				</EmptyContent>
				<p className="text-[11px] text-muted-foreground">Read-only access</p>
			</Empty>
		</div>
	);
}
