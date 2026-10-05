import { expect, test } from "bun:test";
import { loadNoteUpdates } from "./load-note-updates";

test("opens a note when its server seed arrives after the first read", async () => {
  let reads = 0;
  let pending = 0;
  const updates = [{ seq: 1, update: "server-seed" }];
  const result = await loadNoteUpdates(
    async () => (++reads === 1 ? [] : updates),
    new AbortController().signal,
    () => pending++,
  );
  expect(result).toBe(updates);
  expect(reads).toBe(2);
  expect(pending).toBe(1);
});

test("stops polling when the note closes", async () => {
  const controller = new AbortController();
  let reads = 0;
  const result = loadNoteUpdates(
    async () => { reads++; return []; },
    controller.signal,
    () => controller.abort(),
  );
  await expect(result).rejects.toThrow();
  expect(reads).toBe(1);
});

test("stops waiting when a server seed never arrives", async () => {
  let reads = 0;
  const result = loadNoteUpdates(
    async () => { reads++; return []; },
    new AbortController().signal,
    () => {},
  );
  await expect(result).rejects.toThrow("still being prepared");
  expect(reads).toBe(15);
}, 20_000);

test("reports a failed read so the editor can offer a retry", async () => {
  await expect(loadNoteUpdates(
    async () => { throw new Error("offline"); },
    new AbortController().signal,
    () => {},
  )).rejects.toThrow("offline");
});
