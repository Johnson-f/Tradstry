"use client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tradstry/app-ui/components/ui/dialog";
import { Input } from "@tradstry/app-ui/components/ui/input";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import * as React from "react";
import { tradeDate } from "./journal-format";

export function JournalSetup({
  workspaceId,
  enabled = false,
  onDone,
}: {
  workspaceId: string;
  enabled?: boolean;
  onDone: () => void | Promise<void>;
}) {
  const fetcher = useGraphQL();
  const platform = useTradstryPlatform();
  const [open, setOpen] = React.useState(false);
  const [flat, setFlat] = React.useState(false);
  const [timezone, setTimezone] = React.useState("America/New_York");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const base = useQuery({
    queryKey: ["journal-flow", platform.user.email, workspaceId, "prepare"],
    queryFn: () => flow.prepare(fetcher, workspaceId, null),
    enabled: open,
  });
  React.useEffect(() => {
    setFlat(false);
    if (base.data) setTimezone(base.data.timezone);
  }, [base.data]);
  const flatBefore = flat ? (base.data?.firstExecution ?? null) : null;
  const preview = useQuery({
    queryKey: [
      "journal-flow",
      platform.user.email,
      workspaceId,
      "prepare",
      flatBefore,
    ],
    queryFn: () => flow.prepare(fetcher, workspaceId, flatBefore),
    enabled: open && !!base.data,
  });
  const report = preview.data ?? base.data;
  const enable = async () => {
    if (!report) return;
    setBusy(true);
    setError(null);
    const key = `tradstry:journal-enable:${platform.user.email}:${workspaceId}:${flatBefore ?? "unknown"}:${timezone}`;
    try {
      const stored = localStorage.getItem(key);
      const request = stored
        ? (JSON.parse(stored) as flow.Command)
        : flow.command(
            flow.ENABLE_FLOW,
            "enableJournalFlow",
            {
              workspaceId,
              expectedRevision: report.sourceRevision,
              flatBefore,
              timezone,
            },
            platform.user.email,
          );
      localStorage.setItem(key, JSON.stringify(request));
      await flow.execute(fetcher, request);
      localStorage.removeItem(key);
      await onDone();
      setOpen(false);
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Could not enable your journal";
      setError(message);
      if (message.includes("REPREVIEW_REQUIRED")) {
        localStorage.removeItem(key);
        await base.refetch();
        await preview.refetch();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium">
            {enabled
              ? "Some trades need their history checked"
              : "Let your journal record trades automatically"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {enabled
              ? "Check earlier holdings and broker records before calculating incomplete trades."
              : "Prepare your existing history, then add context and review when you’re ready."}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFlat(false);
            setOpen(true);
          }}
        >
          {enabled ? "Review history" : "Prepare journal"}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {enabled
                ? "Review your starting history"
                : "Prepare your journal"}
            </DialogTitle>
            <DialogDescription>
              Your broker records, existing entries, notes and screenshots will
              be kept.
            </DialogDescription>
          </DialogHeader>
          {base.isLoading ? (
            <p>Checking your history…</p>
          ) : base.isError ? (
            <Button variant="outline" onClick={() => void base.refetch()}>
              Retry checking history
            </Button>
          ) : report ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Broker records", report.brokerRecords],
                  ["Existing entries kept", report.existingEntries],
                  ["Trades ready to record", report.readyTrades],
                  ["Groups needing attention", report.attentionGroups],
                ].map(([label, count]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-medium">{count}</dd>
                  </div>
                ))}
              </dl>
              {report.firstExecution && (
                <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={flat}
                    disabled={busy}
                    onChange={(event) => setFlat(event.target.checked)}
                  />
                  <span>
                    I had no open positions in this account before{" "}
                    {tradeDate(report.firstExecution)}.
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Leave this unchecked if you’re unsure. Check your broker
                      statement or import earlier history. You can also confirm
                      individual trades without declaring the whole account
                      empty.
                    </span>
                  </span>
                </label>
              )}
              {!enabled && (
                <label
                  htmlFor="journal-review-timezone"
                  className="grid gap-1.5 text-xs"
                >
                  Review timezone
                  <Input
                    id="journal-review-timezone"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    placeholder="America/New_York"
                  />
                </label>
              )}
              {report.conflictingLinks > 0 && (
                <p role="alert" className="text-sm text-destructive">
                  {report.conflictingLinks} existing entries have broker links
                  that need reconciliation first. Your original records have not
                  changed.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Recording never marks a trade reviewed. A review needs your own
                takeaway.
              </p>
            </div>
          ) : null}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {enabled ? "Close" : "Cancel"}
            </Button>
            <Button
              disabled={
                busy ||
                !report ||
                preview.isFetching ||
                report.conflictingLinks > 0 ||
                (enabled && !flat)
              }
              onClick={() => void enable()}
            >
              {busy
                ? "Updating…"
                : enabled
                  ? "Confirm starting history"
                  : "Start automatic journal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
