import { describe, expect, it } from "vitest";

import {
  BASE_XP_PER_BATTLE,
  DEFAULT_LEVEL,
  LEVEL_CAP,
  LOSER_XP_MULTIPLIER,
  STAT_GROWTH_CAP_RATIO,
  WINNER_XP_MULTIPLIER,
  XP_LEVEL_CURVE_FACTOR,
} from "./constants.js";
import { applyXp, effectiveStat, effectiveStats, xpReward, xpToAdvance } from "./leveling.js";

describe("xpToAdvance", () => {
  it("returns level² × XP_LEVEL_CURVE_FACTOR", () => {
    expect(xpToAdvance(1)).toBe(1 * 1 * XP_LEVEL_CURVE_FACTOR);
    expect(xpToAdvance(5)).toBe(5 * 5 * XP_LEVEL_CURVE_FACTOR);
    expect(xpToAdvance(10)).toBe(10 * 10 * XP_LEVEL_CURVE_FACTOR);
  });

  it("rejects sub-1 or non-integer levels", () => {
    expect(() => xpToAdvance(0)).toThrow();
    expect(() => xpToAdvance(-3)).toThrow();
    expect(() => xpToAdvance(2.5)).toThrow();
  });
});

describe("xpReward", () => {
  it("winner at parity gets WINNER_XP_MULTIPLIER × baseXp", () => {
    expect(xpReward({ won: true, opponentLevel: DEFAULT_LEVEL })).toBe(
      Math.floor(BASE_XP_PER_BATTLE * WINNER_XP_MULTIPLIER),
    );
  });

  it("loser at parity gets LOSER_XP_MULTIPLIER × baseXp", () => {
    expect(xpReward({ won: false, opponentLevel: DEFAULT_LEVEL })).toBe(
      Math.floor(BASE_XP_PER_BATTLE * LOSER_XP_MULTIPLIER),
    );
  });

  it("scales linearly with opponent level", () => {
    const half = xpReward({ won: true, opponentLevel: DEFAULT_LEVEL / 2 });
    const full = xpReward({ won: true, opponentLevel: DEFAULT_LEVEL });
    const dbl = xpReward({ won: true, opponentLevel: DEFAULT_LEVEL * 2 });
    expect(half).toBeLessThan(full);
    expect(dbl).toBeGreaterThan(full);
    expect(dbl).toBe(full * 2);
  });

  it("clamps opponent level to >= 1 to avoid zero/negative reward", () => {
    expect(xpReward({ won: true, opponentLevel: 0 })).toBeGreaterThan(0);
    expect(xpReward({ won: true, opponentLevel: -10 })).toBeGreaterThan(0);
  });
});

describe("applyXp", () => {
  it("no level up when gain < threshold", () => {
    const r = applyXp(1, 0, xpToAdvance(1) - 1);
    expect(r.level).toBe(1);
    expect(r.xp).toBe(xpToAdvance(1) - 1);
    expect(r.levelsGained).toBe(0);
  });

  it("single level up consumes the threshold", () => {
    const r = applyXp(1, 0, xpToAdvance(1));
    expect(r.level).toBe(2);
    expect(r.xp).toBe(0);
    expect(r.levelsGained).toBe(1);
  });

  it("carries remainder past the threshold", () => {
    const r = applyXp(1, 0, xpToAdvance(1) + 7);
    expect(r.level).toBe(2);
    expect(r.xp).toBe(7);
    expect(r.levelsGained).toBe(1);
  });

  it("cascades multiple level ups in a single call", () => {
    const totalForTwo = xpToAdvance(1) + xpToAdvance(2);
    const r = applyXp(1, 0, totalForTwo);
    expect(r.level).toBe(3);
    expect(r.xp).toBe(0);
    expect(r.levelsGained).toBe(2);
  });

  it("respects LEVEL_CAP and zeros xp on cap", () => {
    const r = applyXp(LEVEL_CAP - 1, 0, 999_999_999);
    expect(r.level).toBe(LEVEL_CAP);
    expect(r.xp).toBe(0);
    expect(r.levelsGained).toBe(1);
  });

  it("does not level up past cap", () => {
    const r = applyXp(LEVEL_CAP, 0, 999_999_999);
    expect(r.level).toBe(LEVEL_CAP);
    expect(r.xp).toBe(0);
    expect(r.levelsGained).toBe(0);
  });

  it("rejects negative gain", () => {
    expect(() => applyXp(1, 0, -1)).toThrow();
  });
});

describe("effectiveStat", () => {
  it("equals base at level 1 with no trained delta", () => {
    expect(effectiveStat(60, 1)).toBe(60);
  });

  it("scales linearly by STAT_GROWTH_PER_LEVEL of base per level", () => {
    expect(effectiveStat(100, 2)).toBe(105);
    expect(effectiveStat(100, 11)).toBe(150);
  });

  it("caps at floor(base × STAT_GROWTH_CAP_RATIO) excluding trained delta", () => {
    const cap = Math.floor(60 * STAT_GROWTH_CAP_RATIO);
    expect(effectiveStat(60, 50)).toBe(cap);
    expect(effectiveStat(60, 100)).toBe(cap);
  });

  it("adds trained delta on top of capped level-scaled value", () => {
    const cap = Math.floor(60 * STAT_GROWTH_CAP_RATIO);
    expect(effectiveStat(60, 100, 10)).toBe(cap + 10);
  });
});

describe("effectiveStats", () => {
  it("applies effectiveStat to each base stat with optional attrs", () => {
    const base = { hp: 70, atk: 60, def: 60, spd: 60 };
    const r1 = effectiveStats(base, 1);
    expect(r1).toEqual(base);

    const r2 = effectiveStats(base, 11);
    expect(r2).toEqual({
      hp: Math.floor(70 * 1.5),
      atk: Math.floor(60 * 1.5),
      def: Math.floor(60 * 1.5),
      spd: Math.floor(60 * 1.5),
    });

    const r3 = effectiveStats(base, 5, { atk: 3 });
    expect(r3.atk).toBe(effectiveStat(60, 5) + 3);
    expect(r3.def).toBe(effectiveStat(60, 5));
  });

  it("treats null attrs the same as undefined", () => {
    const base = { hp: 70, atk: 60, def: 60, spd: 60 };
    expect(effectiveStats(base, 5, null)).toEqual(effectiveStats(base, 5));
  });
});
