import { sha256Hex } from "@tradstry/notebook-core/media";

export function hashMediaFile(file: File, signal?: AbortSignal): Promise<string> {
  if (typeof Worker === "undefined") {
    return file.arrayBuffer().then(sha256Hex);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./media-hash.worker.ts", import.meta.url), {
      type: "module",
    });
    const cleanup = () => worker.terminate();
    const abort = () => {
      cleanup();
      reject(new Error("Upload aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ hash?: string; error?: string }>,
    ) => {
      signal?.removeEventListener("abort", abort);
      cleanup();
      if (event.data.hash) resolve(event.data.hash);
      else reject(new Error(event.data.error || "Could not hash media"));
    };
    worker.onerror = (event) => {
      signal?.removeEventListener("abort", abort);
      cleanup();
      reject(new Error(event.message || "Could not hash media"));
    };
    worker.postMessage(file);
  });
}
