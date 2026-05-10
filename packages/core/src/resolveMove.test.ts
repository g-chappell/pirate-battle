import { describe, expect, it } from "vitest";

import { CRIT_RATE, STATUS_BURN } from "./constants.js";
import { computeDamage, rollAccuracy, rollCrit } from "./resolveMove.js";
import type { Rng } from "./rng.js";
import type { CrewSnapshot, MoveDef } from "./types.js";

function constantRng(value: number): Rng {
  return {
    state: 0,
    next() {
      return value;
    },
  };
}

const baseAttacker: CrewSnapshot = {
  hp: 100,
  maxHp: 100,
  atk: 50,
  def: 50,
  spd: 50,
  level: 50,
  affinity: "kraken",
  statuses: [],
  moves: [],
};

const baseDefender: CrewSnapshot = {
  ...baseAttacker,
  affinity: "kraken",
};

const tackle: MoveDef = {
  key: "tackle",
  name: "Tackle",
  affinity: "kraken",
  basePower: 30,
  accuracy: 100,
  kind: "damage",
};

describe("computeDamage formula", () => {
  it("matches the canonical formula for a neutral, non-crit hit", () => {
    const result = computeDamage(baseAttacker, baseDefender, tackle, constantRng(0.5));
    expect(result).toEqual({
      hit: true,
      crit: false,
      effective: 1,
      damage: 15,
    });
  });

  it("doubles damage on a critical hit", () => {
    const result = computeDamage(baseAttacker, baseDefender, tackle, constantRng(0));
    expect(result.crit).toBe(true);
    expect(result.damage).toBe(30);
  });

  it("multiplies by 2 on super-effective matchups", () => {
    const ironcladDefender: CrewSnapshot = {
      ...baseDefender,
      affinity: "ironclad",
    };
    const result = computeDamage(baseAttacker, ironcladDefender, tackle, constantRng(0.5));
    expect(result.effective).toBe(2);
    expect(result.damage).toBe(30);
  });

  it("burned attackers deal halved damage", () => {
    const burned: CrewSnapshot = {
      ...baseAttacker,
      statuses: [STATUS_BURN],
    };
    const result = computeDamage(burned, baseDefender, tackle, constantRng(0.5));
    expect(result.damage).toBeLessThan(15);
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });

  it("misses when accuracy roll fails", () => {
    const inaccurate: MoveDef = { ...tackle, accuracy: 50 };
    const result = computeDamage(baseAttacker, baseDefender, inaccurate, constantRng(0.99));
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });

  it("returns zero for non-damage moves", () => {
    const buff: MoveDef = { ...tackle, kind: "buff", basePower: 0 };
    const result = computeDamage(baseAttacker, baseDefender, buff, constantRng(0.5));
    expect(result.damage).toBe(0);
  });
});

describe("rollAccuracy", () => {
  it("always hits at accuracy 100", () => {
    expect(rollAccuracy(100, constantRng(0.999))).toBe(true);
  });

  it("hits when roll is below accuracy threshold", () => {
    expect(rollAccuracy(80, constantRng(0.5))).toBe(true);
  });

  it("misses when roll is above accuracy threshold", () => {
    expect(rollAccuracy(50, constantRng(0.6))).toBe(false);
  });
});

describe("rollCrit", () => {
  it("crits on a low roll within the crit rate", () => {
    expect(rollCrit(constantRng(0))).toBe(true);
    expect(rollCrit(constantRng(CRIT_RATE - 0.0001))).toBe(true);
  });

  it("does not crit on a high roll", () => {
    expect(rollCrit(constantRng(CRIT_RATE + 0.001))).toBe(false);
  });
});
