import { describe, expect, it } from "vitest";

import {
  AFFINITY_COLORS,
  AFFINITY_TEXTURE_KEYS,
  PLACEHOLDER_SPRITE_SIZE,
  colorForAffinity,
  computeHpBarWidth,
  textureKeyForAffinity,
} from "./affinity";

describe("colorForAffinity", () => {
  it("returns a distinct color for each affinity", () => {
    const colors = new Set([
      colorForAffinity("kraken"),
      colorForAffinity("ironclad"),
      colorForAffinity("phantom"),
      colorForAffinity("bloodborne"),
    ]);
    expect(colors.size).toBe(4);
  });

  it("returns a 24-bit RGB value", () => {
    for (const a of ["kraken", "ironclad", "phantom", "bloodborne"] as const) {
      const c = colorForAffinity(a);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe("textureKeyForAffinity", () => {
  it("returns a distinct texture key per affinity", () => {
    const keys = new Set([
      textureKeyForAffinity("kraken"),
      textureKeyForAffinity("ironclad"),
      textureKeyForAffinity("phantom"),
      textureKeyForAffinity("bloodborne"),
    ]);
    expect(keys.size).toBe(4);
  });

  it("matches the AFFINITY_TEXTURE_KEYS map", () => {
    expect(textureKeyForAffinity("kraken")).toBe(AFFINITY_TEXTURE_KEYS.kraken);
  });
});

describe("computeHpBarWidth", () => {
  it("returns full width at full HP", () => {
    expect(computeHpBarWidth(100, 100, 200)).toBe(200);
  });

  it("returns half width at half HP", () => {
    expect(computeHpBarWidth(50, 100, 200)).toBe(100);
  });

  it("returns zero when fainted", () => {
    expect(computeHpBarWidth(0, 100, 200)).toBe(0);
  });

  it("clamps negative HP to zero", () => {
    expect(computeHpBarWidth(-10, 100, 200)).toBe(0);
  });

  it("clamps overflow HP to full width", () => {
    expect(computeHpBarWidth(150, 100, 200)).toBe(200);
  });

  it("returns zero when maxHp is zero", () => {
    expect(computeHpBarWidth(0, 0, 200)).toBe(0);
  });
});

describe("constants", () => {
  it("exposes a positive sprite size", () => {
    expect(PLACEHOLDER_SPRITE_SIZE).toBeGreaterThan(0);
  });

  it("freezes the AFFINITY_COLORS map", () => {
    expect(Object.isFrozen(AFFINITY_COLORS)).toBe(true);
  });
});
