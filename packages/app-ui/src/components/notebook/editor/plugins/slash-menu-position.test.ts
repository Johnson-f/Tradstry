import { expect, test } from "bun:test";
import { getSlashMenuPosition } from "./slash-menu-position";

test("opens above and shrinks when a full slash menu fits on neither side", () => {
  const position = getSlashMenuPosition(
    { left: 380, top: 420, bottom: 441 },
    { left: 249, top: 72, right: 1100, bottom: 571 },
    1600,
  );
  expect(position.side).toBe("top");
  expect(position.top).toBe(80);
  expect(position.height).toBe(332);
  expect(position.top + position.height).toBeLessThan(420);
});

test("opens below when the complete list fits", () => {
  const position = getSlashMenuPosition(
    { left: 200, top: 120, bottom: 148 },
    { left: 100, top: 80, right: 900, bottom: 720 },
    1600,
  );
  expect(position.side).toBe("bottom");
  expect(position.top).toBe(156);
  expect(position.height).toBe(432);
});

test("filtered results use their natural height instead of a large empty panel", () => {
  const position = getSlashMenuPosition(
    { left: 200, top: 400, bottom: 428 },
    { left: 100, top: 80, right: 900, bottom: 620 },
    120,
  );
  expect(position.side).toBe("bottom");
  expect(position.height).toBe(120);
});

test("clamps menu width and position at narrow and right-hand boundaries", () => {
  const bounds = { left: 20, top: 80, right: 280, bottom: 500 };
  const position = getSlashMenuPosition(
    { left: 260, top: 390, bottom: 418 },
    bounds,
    1600,
  );
  expect(position.width).toBe(244);
  expect(position.left).toBe(28);
  expect(position.left + position.width).toBeLessThanOrEqual(bounds.right - 8);
  expect(position.top + position.height).toBeLessThanOrEqual(bounds.bottom - 8);
});
