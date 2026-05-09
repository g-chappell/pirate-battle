import { describe, expect, it } from "vitest";
import type { Affinity } from "@pirate-battle/core";
import { CREWS, CREWS_BY_KEY } from "./crews.js";
import { MOVES_BY_KEY } from "./moves.js";

const AFFINITIES: Affinity[] = ["kraken", "ironclad", "phantom", "bloodborne"];

describe("CREWS catalogue", () => {
  it("contains exactly 8 starter crews", () => {
    expect(CREWS).toHaveLength(8);
  });

  it("has 2 crews per affinity", () => {
    for (const affinity of AFFINITIES) {
      const count = CREWS.filter((c) => c.affinity === affinity).length;
      expect(count, `affinity=${affinity}`).toBe(2);
    }
  });

  it("uses unique template keys", () => {
    const keys = CREWS.map((c) => c.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has 4 move keys per crew, all referencing real moves of matching affinity", () => {
    for (const c of CREWS) {
      expect(c.moveKeys, `crew=${c.templateKey}`).toHaveLength(4);
      const unique = new Set(c.moveKeys);
      expect(unique.size, `crew=${c.templateKey} unique moves`).toBe(4);
      for (const k of c.moveKeys) {
        const m = MOVES_BY_KEY[k];
        expect(m, `crew=${c.templateKey} move=${k}`).toBeDefined();
        expect(m!.affinity, `crew=${c.templateKey} move=${k} affinity`).toBe(
          c.affinity,
        );
      }
    }
  });

  it("base stats total ~250 (within ±5)", () => {
    for (const c of CREWS) {
      const total =
        c.baseStats.hp + c.baseStats.atk + c.baseStats.def + c.baseStats.spd;
      expect(total, `crew=${c.templateKey}`).toBeGreaterThanOrEqual(245);
      expect(total, `crew=${c.templateKey}`).toBeLessThanOrEqual(255);
    }
  });

  it("each base stat is a positive integer", () => {
    for (const c of CREWS) {
      for (const stat of ["hp", "atk", "def", "spd"] as const) {
        const value = c.baseStats[stat];
        expect(
          Number.isInteger(value),
          `crew=${c.templateKey} stat=${stat}`,
        ).toBe(true);
        expect(value, `crew=${c.templateKey} stat=${stat}`).toBeGreaterThan(0);
      }
    }
  });

  it("includes a balanced and a specialist per affinity (stat spread varies)", () => {
    for (const affinity of AFFINITIES) {
      const crews = CREWS.filter((c) => c.affinity === affinity);
      const spreads = crews.map((c) => {
        const stats = [
          c.baseStats.hp,
          c.baseStats.atk,
          c.baseStats.def,
          c.baseStats.spd,
        ];
        return Math.max(...stats) - Math.min(...stats);
      });
      const minSpread = Math.min(...spreads);
      const maxSpread = Math.max(...spreads);
      expect(
        maxSpread - minSpread,
        `affinity=${affinity} spread variety`,
      ).toBeGreaterThan(20);
    }
  });

  it("every crew has a non-empty lore blurb", () => {
    for (const c of CREWS) {
      expect(c.lore, `crew=${c.templateKey}`).toBeTruthy();
      expect(c.lore.length, `crew=${c.templateKey}`).toBeGreaterThan(20);
    }
  });

  it("CREWS_BY_KEY indexes every crew exactly once", () => {
    expect(Object.keys(CREWS_BY_KEY)).toHaveLength(CREWS.length);
    for (const c of CREWS) {
      expect(CREWS_BY_KEY[c.templateKey]).toBe(c);
    }
  });
});
