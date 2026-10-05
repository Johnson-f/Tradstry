"use client";
import * as React from "react";
import { useGraphQL } from "@tradstry/app-ui/lib/client";
import { command, execute, type Command } from "@tradstry/app-ui/lib/service/journal-flow";

type SavedValue = { version: number };
type SaveState = "saved" | "saving" | "pending" | "conflict" | "failed";

export function useJournalSave<T extends object, R extends SavedValue>(options: {
  storageKey: string; owner: string; initial: T; version: number;
  query: string; field: string; variables: Record<string, unknown>;
  toInput: (value: T, version: number) => Record<string, unknown>;
  validate?: (value: T) => string | null;
}) {
  const fetcher = useGraphQL();
  const [restored] = React.useState<{ value: T; pending?: Command; pendingValue?: T; revision?: number }>(() => {
    try { const cached = localStorage.getItem(options.storageKey); return cached ? JSON.parse(cached) : { value: options.initial }; } catch { return { value: options.initial }; }
  });
  const [value, setValue] = React.useState<T>(restored.value);
  const [state, setState] = React.useState<SaveState>("saved");
  const [error, setError] = React.useState<string | null>(null);
  const current = React.useRef(value);
  const acknowledged = React.useRef(JSON.stringify(options.initial));
  const revision = React.useRef(restored.revision ?? options.version);
  const pending = React.useRef<Command | null>(restored.pending ?? null);
  const pendingValue = React.useRef<T | null>(restored.pendingValue ?? null);
  const working = React.useRef<Promise<number> | null>(null);
  const latest = React.useRef({ options, fetcher });
  latest.current = { options, fetcher };
  const initialSignature = JSON.stringify(options.initial);
  React.useEffect(() => {
    if (!working.current && !pending.current && JSON.stringify(current.current) === acknowledged.current) {
      revision.current = options.version; current.current = options.initial;
      acknowledged.current = initialSignature; setValue(options.initial);
    }
  }, [options.version, initialSignature]);

  const persist = React.useCallback(() => {
    localStorage.setItem(latest.current.options.storageKey, JSON.stringify({ value: current.current, pending: pending.current, pendingValue: pendingValue.current, revision: revision.current }));
  }, []);
  const flush = React.useCallback((): Promise<number> => {
    if (working.current) return working.current;
    const run = async () => {
      const { options: config, fetcher: send } = latest.current;
      while (pending.current || JSON.stringify(current.current) !== acknowledged.current) {
        const snapshot = current.current;
        const validation = !pending.current ? config.validate?.(snapshot) : null;
        if (validation) { setState("pending"); setError(validation); throw new Error(validation); }
        if (!pending.current) { pending.current = command(config.query, config.field, { ...config.variables, input: config.toInput(snapshot, revision.current) }, config.owner); pendingValue.current = snapshot; }
        persist(); setState("saving"); setError(null);
        try {
          const saved = await execute<R>(send, pending.current);
          revision.current = saved.version;
          acknowledged.current = JSON.stringify(pendingValue.current ?? config.initial);
          pending.current = null;
          pendingValue.current = null;
          persist();
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Unable to save";
          setError(message); setState(message.includes("CONFLICT") ? "conflict" : !navigator.onLine || /offline|network unavailable/i.test(message) ? "pending" : "failed");
          persist(); throw reason;
        }
      }
      localStorage.removeItem(config.storageKey); setState("saved"); return revision.current;
    };
    working.current = run().finally(() => { working.current = null; });
    return working.current;
  }, [persist]);
  const update = React.useCallback((next: T) => { current.current = next; setValue(next); setState("pending"); persist(); }, [persist]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => { void flush().catch(() => {}); }, 600);
    return () => window.clearTimeout(timer);
  }, [value, flush]);
  React.useEffect(() => {
    const retry = () => { void flush().catch(() => {}); };
    window.addEventListener("online", retry);
    return () => { window.removeEventListener("online", retry); void flush().catch(() => {}); };
  }, [flush]);
  const useLatestVersion = (version: number) => { pending.current = null; pendingValue.current = null; revision.current = version; setError(null); persist(); void flush().catch(() => {}); };
  return { value, update, flush, state, error, useLatestVersion, version: revision.current };
}
