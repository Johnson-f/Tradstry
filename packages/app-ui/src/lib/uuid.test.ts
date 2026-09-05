import { describe, expect, test } from "bun:test";
import { validate, version } from "uuid";
import { newUuidV7 } from "./uuid";

describe("newUuidV7", () => {
  test("creates canonical, unique, ordered UUIDv7 values", () => {
    const ids = Array.from({ length: 10_000 }, () => newUuidV7());

    expect(ids.every((id) => validate(id) && version(id) === 7)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length === 36 && id === id.toLowerCase())).toBe(true);
    expect(ids.slice(1).every((id, index) => ids[index]! < id)).toBe(true);
  });
});
