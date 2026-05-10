import { describe, expect, it } from "vitest";

import { canTrainStat, maxTrainedDelta, TRAINABLE_STATS, trainedDeltaOf } from "./training.js";

const base = { hp: 70, atk: 60, def: 60, spd: 60 } as const;

describe("training cap", () => {
  it("rounds the cap down to an integer number of stat points", () => {
    expect(maxTrainedDelta(60)).toBe(12);
    expect(maxTrainedDelta(65)).toBe(13);
    expect(maxTrainedDelta(95)).toBe(19);
  });

  it("returns zero for non-positive base values", () => {
    expect(maxTrainedDelta(0)).toBe(0);
    expect(maxTrainedDelta(-5)).toBe(0);
  });

  it("trainedDeltaOf falls back to 0 when attrs missing or non-numeric", () => {
    expect(trainedDeltaOf(null, "atk")).toBe(0);
    expect(trainedDeltaOf(undefined, "def")).toBe(0);
    expect(trainedDeltaOf({}, "spd")).toBe(0);
    expect(trainedDeltaOf({ atk: 7 }, "atk")).toBe(7);
  });

  it("canTrainStat allows up to the cap, then forbids", () => {
    expect(canTrainStat(base, null, "atk")).toBe(true);
    expect(canTrainStat(base, { atk: 11 }, "atk")).toBe(true);
    expect(canTrainStat(base, { atk: 12 }, "atk")).toBe(false);
    expect(canTrainStat(base, { atk: 99 }, "atk")).toBe(false);
  });

  it("only exposes the three trainable stats", () => {
    expect(TRAINABLE_STATS).toEqual(["atk", "def", "spd"]);
  });
});
