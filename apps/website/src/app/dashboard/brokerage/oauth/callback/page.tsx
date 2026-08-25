"use client";

import { BrokerageHistorySetup } from "@tradstry/app-ui/components/brokerage/history-import-policy";
import { Button } from "@tradstry/app-ui/components/ui/button";
import * as brokerageService from "@tradstry/app-ui/lib/service/brokerage";
import type { BrokerageConnectionAccount } from "@tradstry/app-ui/lib/types/brokerage";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { GraphQLProvider, useGraphQL } from "@/lib/client";

type State =
  | { kind: "loading" }
  | {
      kind: "setup";
      workspaceId: string;
      accounts: BrokerageConnectionAccount[];
    }
  | { kind: "success" }
  | { kind: "error"; message: string };

function OAuthCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const fetcher = useGraphQL();
  const ran = useRef(false);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const attemptId = params.get("attempt");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!attemptId) {
      setState({
        kind: "error",
        message:
          "This SnapTrade callback is missing its authorization reference.",
      });
      return;
    }
    void (async () => {
      try {
        const status = await brokerageService.fetchSnapTradeOAuthStatus(
          fetcher,
          attemptId,
        );
        if (!status || status.status !== "authorized") {
          setState({
            kind: "error",
            message:
              status?.status === "denied"
                ? "SnapTrade access was not approved."
                : "SnapTrade authorization did not finish. Return to Brokerage and try again.",
          });
          return;
        }
        if (status.intent === "reauthorize") {
          const workspace =
            await brokerageService.completeSnapTradeOAuthReauthorization(
              fetcher,
              attemptId,
            );
          await brokerageService.syncBrokerageData(fetcher, workspace.id);
          setState({ kind: "success" });
          window.setTimeout(
            () => router.replace("/dashboard/brokerage"),
            1200,
          );
          return;
        }
        const accounts = await brokerageService.fetchSnapTradeOAuthAccounts(
          fetcher,
          attemptId,
        );
        setState({ kind: "setup", workspaceId: status.workspaceId, accounts });
      } catch (error) {
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load SnapTrade accounts.",
        });
      }
    })();
  }, [attemptId, fetcher]);

  if (state.kind === "setup" && attemptId) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-6">
        <BrokerageHistorySetup
          accounts={state.accounts}
          workspaceName="this workspace"
          isSubmitting={saving}
          onSubmit={(value) => {
            void (async () => {
              setSaving(true);
              try {
                const workspaces =
                  await brokerageService.finalizeSnapTradeOAuthSetup(
                    fetcher,
                    attemptId,
                    { workspaceId: state.workspaceId, ...value },
                  );
                for (const workspace of workspaces) {
                  await brokerageService.syncBrokerageData(
                    fetcher,
                    workspace.id,
                  );
                }
                setState({ kind: "success" });
                window.setTimeout(
                  () => router.replace("/dashboard/brokerage"),
                  1200,
                );
              } catch (error) {
                setState({
                  kind: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Could not finish SnapTrade setup.",
                });
              } finally {
                setSaving(false);
              }
            })();
          }}
        />
      </main>
    );
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">
          {state.kind === "loading"
            ? "Confirming SnapTrade access"
            : state.kind === "success"
              ? "SnapTrade connected"
              : "SnapTrade connection incomplete"}
        </h1>
        {state.kind === "error" ? (
          <p className="mt-3 text-sm text-muted-foreground">{state.message}</p>
        ) : null}
        {state.kind === "loading" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Checking the authorization and loading your accounts.
          </p>
        ) : null}
        {state.kind === "error" ? (
          <Button
            className="mt-6"
            onClick={() => router.replace("/dashboard/brokerage")}
          >
            Back to Brokerage
          </Button>
        ) : null}
      </div>
    </main>
  );
}

export default function SnapTradeOAuthCallbackPage() {
  return (
    <GraphQLProvider>
      <Suspense
        fallback={
          <main className="grid min-h-svh place-items-center">
            Confirming SnapTrade access…
          </main>
        }
      >
        <OAuthCallback />
      </Suspense>
    </GraphQLProvider>
  );
}
