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
export { aiPickAction } from "./aiPickAction.js";
export { computeDamage, rollAccuracy, rollCrit, type DamageResult } from "./resolveMove.js";
export {
  AFFINITY_NEUTRAL,
  AFFINITY_SUPER_EFFECTIVE,
  BASE_XP_PER_BATTLE,
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
  LEVEL_CAP,
  LOSER_XP_MULTIPLIER,
  POISON_FRACTION,
  STAT_GROWTH_CAP_RATIO,
  STAT_GROWTH_PER_LEVEL,
  STATUS_BURN,
  STATUS_POISON,
  STATUS_STUN,
  STUN_SKIP_CHANCE,
  TYPE_CHART,
  WINNER_XP_MULTIPLIER,
  XP_LEVEL_CURVE_FACTOR,
  affinityMultiplier,
} from "./constants.js";
export {
  applyXp,
  effectiveStat,
  effectiveStats,
  xpReward,
  xpToAdvance,
  type BaseStats,
  type CrewAttrs,
  type LevelUpResult,
  type XpRewardInput,
} from "./leveling.js";
export {
  canTrainStat,
  maxTrainedDelta,
  trainedDeltaOf,
  TRAINABLE_STATS,
  TRAINING_CAP_RATIO,
  type TrainableStat,
} from "./training.js";
