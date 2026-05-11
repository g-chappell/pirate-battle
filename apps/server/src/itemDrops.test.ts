import {
  AFFINITY_RUNE_KEYS,
  MINOR_POTION_KEY,
  RARE_TOKEN_KEY,
  TRAINING_CHIP_KEY,
} from "@pirate-battle/content";
import type { Rng } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import {
  DROP_TABLES,
  difficultyForOpponentLevel,
  rollDrops,
  type Difficulty,
} from "./itemDrops.js";

function scriptedRng(values: number[]): Rng {
  let i = 0;
  return {
    state: 0,
    next() {
      const v = values[i++];
      if (v === undefined) throw new Error("scriptedRng exhausted");
      return v;
    },
  };
}

describe("difficultyForOpponentLevel", () => {
  it.each<[number, Difficulty]>([
    [0, "easy"],
    [1, "easy"],
    [7, "easy"],
    [8, "standard"],
    [19, "standard"],
    [20, "hard"],
    [99, "hard"],
  ])("level %d → %s", (level, expected) => {
    expect(difficultyForOpponentLevel(level)).toBe(expected);
  });

  it("treats non-finite or negative levels as easy", () => {
    expect(difficultyForOpponentLevel(Number.NaN)).toBe("easy");
    expect(difficultyForOpponentLevel(-3)).toBe("easy");
  });
});

describe("DROP_TABLES", () => {
  it("has the documented entry sets per difficulty", () => {
    expect(DROP_TABLES.easy.entries.map((e) => e.templateKey)).toEqual([
      TRAINING_CHIP_KEY,
      MINOR_POTION_KEY,
    ]);
    const standardKeys = DROP_TABLES.standard.entries.map((e) => e.templateKey);
    expect(standardKeys).toContain(TRAINING_CHIP_KEY);
    expect(standardKeys).toContain(MINOR_POTION_KEY);
    expect(standardKeys).toContain(RARE_TOKEN_KEY);
    for (const k of Object.values(AFFINITY_RUNE_KEYS)) {
      expect(standardKeys).toContain(k);
    }
  });

  it("scales chip drop chance up with difficulty", () => {
    const chip = (d: Difficulty) =>
      DROP_TABLES[d].entries.find((e) => e.templateKey === TRAINING_CHIP_KEY)!.chance;
    expect(chip("easy")).toBeLessThan(chip("standard"));
    expect(chip("standard")).toBeLessThan(chip("hard"));
  });
});

describe("rollDrops", () => {
  it("returns entries whose roll is strictly below chance", () => {
    const table = DROP_TABLES.standard;
    // One roll per entry; alternate just-below / just-above the chance.
    const values = table.entries.flatMap((e) => [Math.max(0, e.chance - 0.001)]);
    const drops = rollDrops(table, scriptedRng(values));
    expect(drops).toEqual(table.entries.map((e) => e.templateKey));
  });

  it("returns nothing when every roll lands at or above chance", () => {
    const table = DROP_TABLES.standard;
    const values = table.entries.map(() => 0.999);
    expect(rollDrops(table, scriptedRng(values))).toEqual([]);
  });

  it("is order-preserving relative to the table entries", () => {
    const table = DROP_TABLES.hard;
    // Drop only the runes (positions 2..5).
    const values = table.entries.map((e, i) =>
      i >= 2 && i <= 5 ? Math.max(0, e.chance - 0.001) : 0.999,
    );
    const drops = rollDrops(table, scriptedRng(values));
    expect(drops).toEqual(table.entries.slice(2, 6).map((e) => e.templateKey));
  });
});
