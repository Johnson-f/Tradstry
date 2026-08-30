import { expect, test } from "bun:test";
import {
  cancelPendingMedia,
  confirmMedia,
  getMediaStatus,
  getMediaUrl,
  registerPendingMedia,
} from "./media-registry";

test("registry moves uploads from pending preview to confirmed server url", () => {
  const controller = new AbortController();
  registerPendingMedia("node-1", "blob:abc", controller);
  expect(getMediaUrl("node-1")).toBe("blob:abc");
  expect(getMediaStatus("node-1")).toBe("pending");
  confirmMedia("node-1", "https://media.test/h1");
  expect(getMediaUrl("node-1")).toBe("https://media.test/h1");
  expect(getMediaStatus("node-1")).toBe("confirmed");
  expect(controller.signal.aborted).toBe(false);
});

test("cancel aborts only pending uploads", () => {
  const controller = new AbortController();
  registerPendingMedia("node-2", "blob:def", controller);
  cancelPendingMedia("node-2");
  expect(controller.signal.aborted).toBe(true);
  expect(getMediaUrl("node-2")).toBeUndefined();
});
