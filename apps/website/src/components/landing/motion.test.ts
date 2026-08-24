import { describe, expect, test } from "bun:test";
import * as landingMotion from "./motion";

describe("landing motion timing", () => {
  test("staggers explanatory sequences but removes delay for reduced motion", () => {
    const getEntranceDelays = (
      landingMotion as unknown as {
        getEntranceDelays?: (
          count: number,
          step: number,
          reducedMotion: boolean,
        ) => number[];
      }
    ).getEntranceDelays;

    expect(getEntranceDelays?.(4, 0.08, false)).toEqual([0, 0.08, 0.16, 0.24]);
    expect(getEntranceDelays?.(4, 0.08, true)).toEqual([0, 0, 0, 0]);
  });
});
