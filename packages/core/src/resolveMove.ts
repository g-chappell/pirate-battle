import {
  AFFINITY_NEUTRAL,
  BURN_ATK_MULTIPLIER,
  CRIT_MULTIPLIER,
  CRIT_RATE,
  DAMAGE_BASE_OFFSET,
  DAMAGE_DIVISOR,
  DAMAGE_LEVEL_DIVISOR,
  DAMAGE_LEVEL_NUMERATOR,
  DAMAGE_LEVEL_OFFSET,
  STATUS_BURN,
  affinityMultiplier,
} from "./constants.js";
import type { Rng } from "./rng.js";
import type { CrewSnapshot, MoveDef } from "./types.js";

export interface DamageResult {
  damage: number;
  crit: boolean;
  effective: number;
  hit: boolean;
}

function effectiveAtk(attacker: CrewSnapshot): number {
  if (attacker.statuses.includes(STATUS_BURN)) {
    return Math.max(1, Math.floor(attacker.atk * BURN_ATK_MULTIPLIER));
  }
  return attacker.atk;
}

export function rollAccuracy(accuracy: number, rng: Rng): boolean {
  if (accuracy >= 100) return true;
  return rng.next() * 100 < accuracy;
}

export function rollCrit(rng: Rng): boolean {
  return rng.next() < CRIT_RATE;
}

export function computeDamage(
  attacker: CrewSnapshot,
  defender: CrewSnapshot,
  move: MoveDef,
  rng: Rng,
): DamageResult {
  if (move.kind !== "damage" || move.basePower <= 0) {
    return { damage: 0, crit: false, effective: AFFINITY_NEUTRAL, hit: true };
  }

  const hit = rollAccuracy(move.accuracy, rng);
  if (!hit) {
    return { damage: 0, crit: false, effective: AFFINITY_NEUTRAL, hit: false };
  }

  const crit = rollCrit(rng);
  const effective = affinityMultiplier(move.affinity, defender.affinity);
  const atk = effectiveAtk(attacker);
  const def = Math.max(1, defender.def);

  const levelTerm =
    (DAMAGE_LEVEL_NUMERATOR * attacker.level) / DAMAGE_LEVEL_DIVISOR +
    DAMAGE_LEVEL_OFFSET;
  const base =
    Math.floor((levelTerm * move.basePower * atk) / def / DAMAGE_DIVISOR) +
    DAMAGE_BASE_OFFSET;
  const withCrit = crit ? base * CRIT_MULTIPLIER : base;
  const damage = Math.max(1, Math.floor(withCrit * effective));

  return { damage, crit, effective, hit: true };
}
