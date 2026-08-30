type Bounds = { left: number; top: number; right: number; bottom: number };
type Anchor = { left: number; top: number; bottom: number };

export function getSlashMenuPosition(
  anchor: Anchor,
  bounds: Bounds,
  contentHeight: number,
) {
  const padding = 8;
  const gap = 8;
  const width = Math.max(
    0,
    Math.min(320, bounds.right - bounds.left - padding * 2),
  );
  const desiredHeight = Math.min(432, contentHeight);
  const above = Math.max(0, anchor.top - bounds.top - padding - gap);
  const below = Math.max(0, bounds.bottom - padding - anchor.bottom - gap);
  const side = below >= desiredHeight || below >= above ? "bottom" : "top";
  const height = Math.max(
    0,
    Math.min(desiredHeight, side === "bottom" ? below : above),
  );
  return {
    side,
    width,
    height,
    left: Math.max(
      bounds.left + padding,
      Math.min(anchor.left, bounds.right - padding - width),
    ),
    top: side === "bottom" ? anchor.bottom + gap : anchor.top - gap - height,
  } as const;
}
