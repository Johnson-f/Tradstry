type MediaEntry = {
  url: string;
  status: "pending" | "confirmed";
  controller: AbortController | null;
};

const media = new Map<string, MediaEntry>();

export function registerPendingMedia(
  nodeKey: string,
  url: string,
  controller: AbortController,
): void {
  releaseMedia(nodeKey);
  media.set(nodeKey, { url, status: "pending", controller });
}

export function confirmMedia(nodeKey: string, serverUrl: string): void {
  const current = media.get(nodeKey);
  if (current?.url.startsWith("blob:") && serverUrl) {
    URL.revokeObjectURL(current.url);
  }
  media.set(nodeKey, {
    url: serverUrl || current?.url || "",
    status: "confirmed",
    controller: null,
  });
}

export function getMediaUrl(nodeKey: string): string | undefined {
  return media.get(nodeKey)?.url || undefined;
}

export function getMediaStatus(
  nodeKey: string,
): "pending" | "confirmed" | undefined {
  return media.get(nodeKey)?.status;
}

export function cancelPendingMedia(nodeKey: string): void {
  const entry = media.get(nodeKey);
  if (entry?.status !== "pending") return;
  entry.controller?.abort();
  releaseMedia(nodeKey);
}

export function releaseMedia(nodeKey: string): void {
  const entry = media.get(nodeKey);
  if (!entry) return;
  entry.controller?.abort();
  if (entry.url.startsWith("blob:")) URL.revokeObjectURL(entry.url);
  media.delete(nodeKey);
}
