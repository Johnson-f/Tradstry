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
	useFinalizeSnapTradeOAuthSetup,
	useInitiateConnection,
	useInitiateSnapTradeOAuth,
	useSnapTradeOAuthAccounts,
	useSnapTradeOAuthAvailable,
	useSnapTradeOAuthStatus,
	useSyncBrokerageData,
} from "@tradstry/app-ui/hooks/brokerage";
import { capture, EVENTS } from "@tradstry/app-ui/lib/analytics/events";
import { platformUrl, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { useState } from "react";
import { toast } from "sonner";

export function BrokerageEmptyState() {
	const workspace = useActiveWorkspace();
	const initiate = useInitiateConnection();
	const [connecting, setConnecting] = useState(false);
	const [oauthAttemptId, setOauthAttemptId] = useState<string | null>(null);
	const platform = useTradstryPlatform();
	const initiateOAuth = useInitiateSnapTradeOAuth();
	const oauthAvailable = useSnapTradeOAuthAvailable();
	const oauthStatus = useSnapTradeOAuthStatus(oauthAttemptId);
	const oauthAccounts = useSnapTradeOAuthAccounts(
		oauthAttemptId,
		oauthStatus.data?.status === "authorized",
	);
	const finalizeOAuth = useFinalizeSnapTradeOAuthSetup();
	const sync = useSyncBrokerageData();

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
			const started = await initiateOAuth.mutateAsync({
				workspaceId: workspace.id,
				platform: platform.kind,
			});
			setOauthAttemptId(started.attemptId);
			await platform.openExternal(started.authorizationUrl);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not start SnapTrade authorization",
			);
		}
	}

	if (
		workspace &&
		oauthAttemptId &&
		oauthStatus.data?.status === "authorized" &&
		oauthAccounts.data
	) {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<BrokerageHistorySetup
					accounts={oauthAccounts.data}
					workspaceName={workspace.name}
					isSubmitting={finalizeOAuth.isPending || sync.isPending}
					onSubmit={(value) => {
						void (async () => {
							try {
								const configured = await finalizeOAuth.mutateAsync({
									attemptId: oauthAttemptId,
									input: { workspaceId: workspace.id, ...value },
								});
								for (const item of configured) await sync.mutateAsync(item.id);
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
							disabled={
								initiateOAuth.isPending ||
								oauthStatus.data?.status === "pending" ||
								oauthStatus.data?.status === "processing"
							}
						>
							{oauthStatus.data?.status === "pending" ||
							oauthStatus.data?.status === "processing"
								? "Waiting for SnapTrade…"
								: "Continue with SnapTrade"}
						</Button>
					) : null}
					{oauthStatus.data?.status === "denied" ||
					oauthStatus.data?.status === "failed" ||
					oauthStatus.data?.status === "expired" ? (
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
