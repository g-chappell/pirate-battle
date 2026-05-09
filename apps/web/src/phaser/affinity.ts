import type { Affinity } from "@pirate-battle/core";

export const AFFINITY_COLORS: Readonly<Record<Affinity, number>> =
  Object.freeze({
    kraken: 0x0a7e7e,
    ironclad: 0x4a4a4a,
    phantom: 0x9b59b6,
    bloodborne: 0xb22222,
  });

export const AFFINITY_TEXTURE_KEYS: Readonly<Record<Affinity, string>> =
  Object.freeze({
    kraken: "crew-kraken",
    ironclad: "crew-ironclad",
    phantom: "crew-phantom",
    bloodborne: "crew-bloodborne",
  });

export const PLACEHOLDER_SPRITE_SIZE = 96;

export function colorForAffinity(affinity: Affinity): number {
  return AFFINITY_COLORS[affinity];
}

export function textureKeyForAffinity(affinity: Affinity): string {
  return AFFINITY_TEXTURE_KEYS[affinity];
}

export function computeHpBarWidth(
  hp: number,
  maxHp: number,
  totalWidth: number,
): number {
  if (maxHp <= 0 || totalWidth <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  return Math.round(ratio * totalWidth);
}
