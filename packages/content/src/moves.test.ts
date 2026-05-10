import type { Affinity } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import { MOVES, MOVES_BY_KEY } from "./moves.js";

const AFFINITIES: Affinity[] = ["kraken", "ironclad", "phantom", "bloodborne"];

describe("MOVES catalogue", () => {
  it("contains exactly 16 moves", () => {
    expect(MOVES).toHaveLength(16);
  });

  it("has 4 moves per affinity", () => {
    for (const affinity of AFFINITIES) {
      const count = MOVES.filter((m) => m.affinity === affinity).length;
      expect(count, `affinity=${affinity}`).toBe(4);
    }
  });

  it("uses unique move keys", () => {
    const keys = MOVES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("mixes damage / status / buff within each affinity", () => {
    for (const affinity of AFFINITIES) {
      const kinds = new Set(MOVES.filter((m) => m.affinity === affinity).map((m) => m.kind));
      expect(kinds.size, `affinity=${affinity} kind variety`).toBeGreaterThan(1);
    }
  });

  it("status moves declare a statusEffect", () => {
    for (const m of MOVES.filter((m) => m.kind === "status")) {
      expect(m.statusEffect, `move=${m.key}`).toBeDefined();
    }
  });

  it("damage moves have positive basePower; non-damage moves have basePower 0", () => {
    for (const m of MOVES) {
      if (m.kind === "damage") {
        expect(m.basePower, `move=${m.key}`).toBeGreaterThan(0);
      } else {
        expect(m.basePower, `move=${m.key}`).toBe(0);
      }
    }
  });

  it("accuracy is within 1..100", () => {
    for (const m of MOVES) {
      expect(m.accuracy, `move=${m.key}`).toBeGreaterThanOrEqual(1);
      expect(m.accuracy, `move=${m.key}`).toBeLessThanOrEqual(100);
    }
  });

  it("MOVES_BY_KEY indexes every move exactly once", () => {
    expect(Object.keys(MOVES_BY_KEY)).toHaveLength(MOVES.length);
    for (const m of MOVES) {
      expect(MOVES_BY_KEY[m.key]).toBe(m);
    }
  });
});
