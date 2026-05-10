import type { BaseStats, CrewAttrs } from "./leveling.js";

export type TrainableStat = "atk" | "def" | "spd";

export const TRAINABLE_STATS: readonly TrainableStat[] = ["atk", "def", "spd"];

export const TRAINING_CAP_RATIO = 0.2;

export function maxTrainedDelta(baseStat: number): number {
  if (baseStat <= 0) return 0;
  return Math.floor(baseStat * TRAINING_CAP_RATIO);
}

export function trainedDeltaOf(attrs: CrewAttrs | null | undefined, stat: TrainableStat): number {
  const v = attrs?.[stat];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function canTrainStat(
  baseStats: BaseStats,
  attrs: CrewAttrs | null | undefined,
  stat: TrainableStat,
): boolean {
  return trainedDeltaOf(attrs, stat) < maxTrainedDelta(baseStats[stat]);
}
