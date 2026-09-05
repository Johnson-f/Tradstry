import assert from "node:assert/strict";
import test from "node:test";
import { validate, version } from "uuid";
import { newUuidV7 } from "./uuid.ts";

test("newUuidV7 creates canonical, unique, ordered UUIDv7 values", () => {
  const ids = Array.from({ length: 10_000 }, () => newUuidV7());

  assert.ok(ids.every((id) => validate(id) && version(id) === 7));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.length === 36 && id === id.toLowerCase()));
  assert.ok(ids.slice(1).every((id, index) => ids[index]! < id));
});
