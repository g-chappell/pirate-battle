import {
  BASE_XP_PER_BATTLE,
  DEFAULT_LEVEL,
  LEVEL_CAP,
  LOSER_XP_MULTIPLIER,
  STAT_GROWTH_CAP_RATIO,
  STAT_GROWTH_PER_LEVEL,
  WINNER_XP_MULTIPLIER,
  XP_LEVEL_CURVE_FACTOR,
} from "./constants.js";

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface CrewAttrs {
  hp?: number;
  atk?: number;
  def?: number;
  spd?: number;
}

export function xpToAdvance(currentLevel: number): number {
  if (currentLevel < 1 || !Number.isInteger(currentLevel)) {
    throw new Error(
      `xpToAdvance: level must be integer >= 1, got ${currentLevel}`,
    );
  }
  return currentLevel * currentLevel * XP_LEVEL_CURVE_FACTOR;
}

export interface XpRewardInput {
  won: boolean;
  opponentLevel: number;
}

export function xpReward(input: XpRewardInput): number {
  const multiplier = input.won ? WINNER_XP_MULTIPLIER : LOSER_XP_MULTIPLIER;
  const opp = Math.max(1, input.opponentLevel);
  const scale = opp / DEFAULT_LEVEL;
  return Math.floor(BASE_XP_PER_BATTLE * multiplier * scale);
}

export interface LevelUpResult {
  level: number;
  xp: number;
  levelsGained: number;
}

export function applyXp(
  level: number,
  xp: number,
  gain: number,
): LevelUpResult {
  if (gain < 0) throw new Error(`applyXp: gain must be >= 0, got ${gain}`);
  let newLevel = level;
  let newXp = xp + gain;
  let gained = 0;
  while (newLevel < LEVEL_CAP && newXp >= xpToAdvance(newLevel)) {
    newXp -= xpToAdvance(newLevel);
    newLevel += 1;
    gained += 1;
  }
  if (newLevel >= LEVEL_CAP) {
    newLevel = LEVEL_CAP;
    newXp = 0;
  }
  return { level: newLevel, xp: newXp, levelsGained: gained };
}

export function effectiveStat(
  baseStat: number,
  level: number,
  trained: number = 0,
): number {
  const levelScaled = Math.floor(
    baseStat * (1 + STAT_GROWTH_PER_LEVEL * (level - 1)),
  );
  const cap = Math.floor(baseStat * STAT_GROWTH_CAP_RATIO);
  const capped = Math.min(levelScaled, cap);
  return capped + trained;
}

export function effectiveStats(
  baseStats: BaseStats,
  level: number,
  attrs?: CrewAttrs | null,
): BaseStats {
  return {
    hp: effectiveStat(baseStats.hp, level, attrs?.hp ?? 0),
    atk: effectiveStat(baseStats.atk, level, attrs?.atk ?? 0),
    def: effectiveStat(baseStats.def, level, attrs?.def ?? 0),
    spd: effectiveStat(baseStats.spd, level, attrs?.spd ?? 0),
  };
}
