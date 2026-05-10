import type { Affinity } from "./types.js";

export const DAMAGE_LEVEL_NUMERATOR = 2;
export const DAMAGE_LEVEL_DIVISOR = 5;
export const DAMAGE_LEVEL_OFFSET = 2;
export const DAMAGE_DIVISOR = 50;
export const DAMAGE_BASE_OFFSET = 2;
export const DEFAULT_LEVEL = 50;

export const CRIT_RATE = 1 / 16;
export const CRIT_MULTIPLIER = 2;

export const AFFINITY_SUPER_EFFECTIVE = 2;
export const AFFINITY_NEUTRAL = 1;

export const POISON_FRACTION = 1 / 8;
export const BURN_FRACTION = 1 / 16;
export const BURN_ATK_MULTIPLIER = 0.5;
export const STUN_SKIP_CHANCE = 0.3;

export const STATUS_POISON = "poison";
export const STATUS_BURN = "burn";
export const STATUS_STUN = "stun";

export const XP_LEVEL_CURVE_FACTOR = 50;
export const LEVEL_CAP = 100;
export const BASE_XP_PER_BATTLE = 100;
export const WINNER_XP_MULTIPLIER = 1.5;
export const LOSER_XP_MULTIPLIER = 1.0;
export const STAT_GROWTH_PER_LEVEL = 0.05;
export const STAT_GROWTH_CAP_RATIO = 1.5;

export const TYPE_CHART: Record<Affinity, Record<Affinity, number>> = {
  kraken: {
    kraken: AFFINITY_NEUTRAL,
    ironclad: AFFINITY_SUPER_EFFECTIVE,
    phantom: AFFINITY_NEUTRAL,
    bloodborne: AFFINITY_SUPER_EFFECTIVE,
  },
  ironclad: {
    kraken: AFFINITY_NEUTRAL,
    ironclad: AFFINITY_NEUTRAL,
    phantom: AFFINITY_SUPER_EFFECTIVE,
    bloodborne: AFFINITY_NEUTRAL,
  },
  phantom: {
    kraken: AFFINITY_SUPER_EFFECTIVE,
    ironclad: AFFINITY_NEUTRAL,
    phantom: AFFINITY_NEUTRAL,
    bloodborne: AFFINITY_NEUTRAL,
  },
  bloodborne: {
    kraken: AFFINITY_NEUTRAL,
    ironclad: AFFINITY_NEUTRAL,
    phantom: AFFINITY_SUPER_EFFECTIVE,
    bloodborne: AFFINITY_NEUTRAL,
  },
};

export function affinityMultiplier(attacker: Affinity, defender: Affinity): number {
  return TYPE_CHART[attacker][defender];
}
