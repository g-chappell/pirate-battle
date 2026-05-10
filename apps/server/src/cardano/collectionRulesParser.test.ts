import { describe, expect, it } from "vitest";

import {
  CollectionRulesParseError,
  isValidPolicyId,
  parseCollectionRules,
} from "./collectionRulesParser.js";

const VALID_RULES_JSON = {
  baseStats: { hp: 70, atk: 50, def: 50, spd: 50 },
  baseLevel: 5,
  baseAffinity: "kraken",
  baseMoves: [
    {
      key: "tide_surge",
      name: "Tide Surge",
      affinity: "kraken",
      basePower: 65,
      accuracy: 100,
      kind: "damage",
    },
  ],
  traits: {
    rarity: {
      legendary: {
        delta: { hp: 20, atk: 10 },
        affinity: "phantom",
        moves: [
          {
            key: "phantom_strike",
            name: "Phantom Strike",
            affinity: "phantom",
            basePower: 60,
            accuracy: 95,
            kind: "damage",
          },
        ],
      },
    },
  },
};

describe("parseCollectionRules", () => {
  it("accepts a fully-valid rules document", () => {
    const result = parseCollectionRules(VALID_RULES_JSON);
    expect(result.baseStats.hp).toBe(70);
    expect(result.baseLevel).toBe(5);
    expect(result.baseAffinity).toBe("kraken");
    expect(result.baseMoves[0]?.key).toBe("tide_surge");
    expect(result.traits.rarity?.legendary?.delta?.hp).toBe(20);
    expect(result.traits.rarity?.legendary?.moves?.[0]?.key).toBe("phantom_strike");
  });

  it("allows empty traits", () => {
    const json = { ...VALID_RULES_JSON, traits: {} };
    const result = parseCollectionRules(json);
    expect(result.traits).toEqual({});
  });

  it("defaults traits to {} when omitted", () => {
    const { traits: _t, ...rest } = VALID_RULES_JSON;
    const result = parseCollectionRules(rest);
    expect(result.traits).toEqual({});
  });

  it("rejects non-object root", () => {
    expect(() => parseCollectionRules("nope")).toThrow(CollectionRulesParseError);
    expect(() => parseCollectionRules(null)).toThrow(/must be an object/);
    expect(() => parseCollectionRules([])).toThrow(/must be an object/);
  });

  it("rejects missing baseStats keys", () => {
    const broken = { ...VALID_RULES_JSON, baseStats: { hp: 70, atk: 50, def: 50 } };
    expect(() => parseCollectionRules(broken)).toThrow(/rules\.baseStats\.spd/);
  });

  it("rejects non-integer stat values", () => {
    const broken = {
      ...VALID_RULES_JSON,
      baseStats: { hp: 70.5, atk: 50, def: 50, spd: 50 },
    };
    expect(() => parseCollectionRules(broken)).toThrow(/rules\.baseStats\.hp/);
  });

  it("rejects baseStats < 1", () => {
    const broken = {
      ...VALID_RULES_JSON,
      baseStats: { hp: 0, atk: 50, def: 50, spd: 50 },
    };
    expect(() => parseCollectionRules(broken)).toThrow(/must be >= 1/);
  });

  it("rejects unknown affinity", () => {
    const broken = { ...VALID_RULES_JSON, baseAffinity: "ghost" };
    expect(() => parseCollectionRules(broken)).toThrow(/rules\.baseAffinity/);
  });

  it("rejects empty baseMoves", () => {
    const broken = { ...VALID_RULES_JSON, baseMoves: [] };
    expect(() => parseCollectionRules(broken)).toThrow(/at least one move/);
  });

  it("rejects move with out-of-range accuracy", () => {
    const broken = {
      ...VALID_RULES_JSON,
      baseMoves: [{ ...VALID_RULES_JSON.baseMoves[0], accuracy: 150 }],
    };
    expect(() => parseCollectionRules(broken)).toThrow(/accuracy/);
  });

  it("rejects move with unknown kind", () => {
    const broken = {
      ...VALID_RULES_JSON,
      baseMoves: [{ ...VALID_RULES_JSON.baseMoves[0], kind: "heal" }],
    };
    expect(() => parseCollectionRules(broken)).toThrow(/rules\.baseMoves\[0\]\.kind/);
  });

  it("rejects trait rule that doesn't override anything", () => {
    const broken = {
      ...VALID_RULES_JSON,
      traits: { rarity: { common: {} } },
    };
    expect(() => parseCollectionRules(broken)).toThrow(/at least one of delta\|affinity\|moves/);
  });

  it("includes the deep path in the error message", () => {
    const broken = {
      ...VALID_RULES_JSON,
      traits: {
        rarity: {
          legendary: { delta: { hp: "twenty" } },
        },
      },
    };
    expect(() => parseCollectionRules(broken)).toThrow(
      /rules\.traits\.rarity\.legendary\.delta\.hp: must be a finite integer/,
    );
  });
});

describe("isValidPolicyId", () => {
  it("accepts a 56-char hex string", () => {
    expect(isValidPolicyId("a".repeat(56))).toBe(true);
    expect(isValidPolicyId("0123456789abcdef".repeat(3) + "01234567")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidPolicyId("abc")).toBe(false);
    expect(isValidPolicyId("a".repeat(57))).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidPolicyId("g".repeat(56))).toBe(false);
  });

  it("accepts mixed case hex", () => {
    const mixed = "AbCdEf01".repeat(7);
    expect(mixed.length).toBe(56);
    expect(isValidPolicyId(mixed)).toBe(true);
  });
});
