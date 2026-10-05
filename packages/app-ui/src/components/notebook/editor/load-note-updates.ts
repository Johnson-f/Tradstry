import type { NotebookUpdate } from "@tradstry/app-ui/lib/service/notebook-crdt";

/** Wait for the server's seed; clients must never create a competing document. */
export async function loadNoteUpdates(
  fetchUpdates: () => Promise<NotebookUpdate[]>,
  signal: AbortSignal,
  onPending: () => void,
): Promise<NotebookUpdate[]> {
  for (let attempt = 0; attempt < 15; attempt++) {
    signal.throwIfAborted();
    const updates = await fetchUpdates();
    signal.throwIfAborted();
    if (updates.length > 0) return updates;
    if (attempt === 14) break;
    onPending();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 1000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  throw new Error("The note is still being prepared. Try again shortly.");
}
