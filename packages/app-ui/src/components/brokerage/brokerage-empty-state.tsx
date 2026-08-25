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
import { capture, EVENTS } from "@tradstry/app-ui/lib/analytics/events";
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
		capture(EVENTS.brokerageConnectStarted, {});

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
			<Empty className="max-w-sm border-none">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<HugeiconsIcon icon={BankIcon} strokeWidth={2} />
					</EmptyMedia>
					<EmptyTitle>Connect your brokerage</EmptyTitle>
					<EmptyDescription>
						Link one brokerage account to this workspace to automatically sync
						your transaction history, positions, and balances.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button size="sm" onClick={handleConnect} disabled={connecting}>
						{connecting ? "Connecting..." : "Connect brokerage account"}
					</Button>
					{oauthAvailable.data ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => void handleOAuthConnect()}
							disabled={oauth.isStarting || oauth.phase === "waiting"}
						>
							{oauth.phase === "waiting" || oauth.phase === "reauthorizing"
								? "Waiting for SnapTrade…"
								: "Continue with SnapTrade"}
						</Button>
					) : null}
					{oauth.phase === "error" ? (
						<p role="alert" className="text-xs text-destructive">
							SnapTrade authorization did not finish. You can try again.
						</p>
					) : null}
					<p className="text-xs text-muted-foreground">
						{oauthAvailable.data
							? "Continue with SnapTrade reuses brokerage connections in your Personal account. Both connection methods are read-only."
							: "Supports read-only brokerage connections through SnapTrade."}
					</p>
				</EmptyContent>
			</Empty>
		</div>
	);
}
