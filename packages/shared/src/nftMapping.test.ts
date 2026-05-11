import type { MoveDef } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import { deriveCrewStats, type CollectionRules, type NftMetadata } from "./nftMapping.js";

const TIDE_SURGE: MoveDef = {
  key: "tide_surge",
  name: "Tide Surge",
  affinity: "kraken",
  basePower: 65,
  accuracy: 100,
  kind: "damage",
};

const PHANTOM_STRIKE: MoveDef = {
  key: "phantom_strike",
  name: "Phantom Strike",
  affinity: "phantom",
  basePower: 60,
  accuracy: 95,
  kind: "damage",
};

const CANNONADE: MoveDef = {
  key: "cannonade",
  name: "Cannonade",
  affinity: "ironclad",
  basePower: 70,
  accuracy: 95,
  kind: "damage",
};

const BASELINE_RULES: CollectionRules = {
  baseStats: { hp: 70, atk: 50, def: 50, spd: 50 },
  baseLevel: 5,
  baseAffinity: "kraken",
  baseMoves: [TIDE_SURGE],
  traits: {
    rarity: {
      common: { delta: { hp: 0 } },
      rare: { delta: { hp: 10, atk: 5 } },
      legendary: {
        delta: { hp: 20, atk: 10, def: 5, spd: 5 },
        affinity: "phantom",
        moves: [PHANTOM_STRIKE],
      },
    },
    armor: {
      heavy: { delta: { def: 15, spd: -5 } },
    },
    crew: {
      ironclad: { affinity: "ironclad", moves: [CANNONADE] },
    },
  },
};

const POLICY_ID = "a".repeat(56);

function metadata(traits: Record<string, string>): NftMetadata {
  return { policyId: POLICY_ID, assetName: "asset", traits };
}

describe("deriveCrewStats", () => {
  it("returns base stats for an NFT with no matching traits", () => {
    const result = deriveCrewStats(metadata({}), BASELINE_RULES);

    expect(result).toEqual({
      templateKey: `${POLICY_ID}.asset`,
      hp: 70,
      maxHp: 70,
      atk: 50,
      def: 50,
      spd: 50,
      level: 5,
      affinity: "kraken",
      statuses: [],
      moves: [TIDE_SURGE],
    });
  });

  it("applies stat deltas when a matching trait value is present", () => {
    const result = deriveCrewStats(metadata({ rarity: "rare" }), BASELINE_RULES);

    expect(result.hp).toBe(80);
    expect(result.maxHp).toBe(80);
    expect(result.atk).toBe(55);
    expect(result.def).toBe(50);
    expect(result.spd).toBe(50);
    expect(result.affinity).toBe("kraken");
    expect(result.moves).toEqual([TIDE_SURGE]);
  });

  it("layers multiple matching trait rules additively", () => {
    const result = deriveCrewStats(metadata({ rarity: "rare", armor: "heavy" }), BASELINE_RULES);

    expect(result.hp).toBe(80);
    expect(result.atk).toBe(55);
    expect(result.def).toBe(65);
    expect(result.spd).toBe(45);
  });

  it("overrides affinity and moves when a trait rule supplies them", () => {
    const result = deriveCrewStats(metadata({ rarity: "legendary" }), BASELINE_RULES);

    expect(result.affinity).toBe("phantom");
    expect(result.moves).toEqual([PHANTOM_STRIKE]);
    expect(result.hp).toBe(90);
  });

  it("ignores trait values not registered in the rules", () => {
    const result = deriveCrewStats(metadata({ rarity: "mythic", colour: "blue" }), BASELINE_RULES);

    expect(result.hp).toBe(70);
    expect(result.affinity).toBe("kraken");
  });

  it("clamps stats to the minimum when deltas drive them below it", () => {
    const result = deriveCrewStats(metadata({ armor: "heavy" }), {
      ...BASELINE_RULES,
      baseStats: { hp: 1, atk: 1, def: 1, spd: 1 },
    });

    expect(result.spd).toBe(1);
    expect(result.def).toBe(16);
  });

  it("applies trait rules in deterministic (sorted-key) order", () => {
    const rules: CollectionRules = {
      ...BASELINE_RULES,
      traits: {
        ...BASELINE_RULES.traits,
        crew: {
          ironclad: { affinity: "ironclad", moves: [CANNONADE] },
        },
      },
    };
    const both = metadata({ crew: "ironclad", rarity: "legendary" });
    const result = deriveCrewStats(both, rules);

    expect(result.affinity).toBe("phantom");
    expect(result.moves).toEqual([PHANTOM_STRIKE]);
  });

  it("is deterministic — same inputs produce byte-equal outputs", () => {
    const input = metadata({ rarity: "legendary", armor: "heavy" });
    const a = JSON.stringify(deriveCrewStats(input, BASELINE_RULES));
    const b = JSON.stringify(deriveCrewStats(input, BASELINE_RULES));
    expect(a).toBe(b);
  });

  it("does not mutate the input rules or metadata", () => {
    const rules: CollectionRules = JSON.parse(JSON.stringify(BASELINE_RULES)) as CollectionRules;
    const before = JSON.stringify(rules);
    const meta = metadata({ rarity: "rare" });
    const metaBefore = JSON.stringify(meta);

    deriveCrewStats(meta, rules);

    expect(JSON.stringify(rules)).toBe(before);
    expect(JSON.stringify(meta)).toBe(metaBefore);
  });
});
