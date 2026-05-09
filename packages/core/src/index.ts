export type {
  Action,
  Affinity,
  BattleEvent,
  BattleState,
  CrewSnapshot,
  MoveDef,
  MoveKind,
  Side,
} from "./types.js";
export { createRng, type Rng } from "./rng.js";
export { resolveTurn } from "./engine.js";
export {
  computeDamage,
  rollAccuracy,
  rollCrit,
  type DamageResult,
} from "./resolveMove.js";
export {
  AFFINITY_NEUTRAL,
  AFFINITY_SUPER_EFFECTIVE,
  BURN_ATK_MULTIPLIER,
  BURN_FRACTION,
  CRIT_MULTIPLIER,
  CRIT_RATE,
  DAMAGE_BASE_OFFSET,
  DAMAGE_DIVISOR,
  DAMAGE_LEVEL_DIVISOR,
  DAMAGE_LEVEL_NUMERATOR,
  DAMAGE_LEVEL_OFFSET,
  DEFAULT_LEVEL,
  POISON_FRACTION,
  STATUS_BURN,
  STATUS_POISON,
  STATUS_STUN,
  STUN_SKIP_CHANCE,
  TYPE_CHART,
  affinityMultiplier,
} from "./constants.js";
