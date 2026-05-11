import {
  AFFINITY_RUNE_KEYS,
  MINOR_POTION_KEY,
  RARE_TOKEN_KEY,
  TRAINING_CHIP_KEY,
} from "@pirate-battle/content";
import type { Rng } from "@pirate-battle/core";

export type Difficulty = "easy" | "standard" | "hard";

export interface DropEntry {
  templateKey: string;
  chance: number;
}

export interface DropTable {
  difficulty: Difficulty;
  entries: readonly DropEntry[];
}

const RUNE_ENTRIES: readonly DropEntry[] = Object.freeze(
  (["kraken", "ironclad", "phantom", "bloodborne"] as const).map((a) => ({
    templateKey: AFFINITY_RUNE_KEYS[a],
    chance: 0.1,
  })),
);

export const DROP_TABLES: Readonly<Record<Difficulty, DropTable>> = Object.freeze({
  easy: {
    difficulty: "easy",
    entries: [
      { templateKey: TRAINING_CHIP_KEY, chance: 0.5 },
      { templateKey: MINOR_POTION_KEY, chance: 0.25 },
    ],
  },
  standard: {
    difficulty: "standard",
    entries: [
      { templateKey: TRAINING_CHIP_KEY, chance: 0.6 },
      { templateKey: MINOR_POTION_KEY, chance: 0.35 },
      ...RUNE_ENTRIES,
      { templateKey: RARE_TOKEN_KEY, chance: 0.05 },
    ],
  },
  hard: {
    difficulty: "hard",
    entries: [
      { templateKey: TRAINING_CHIP_KEY, chance: 0.75 },
      { templateKey: MINOR_POTION_KEY, chance: 0.5 },
      ...RUNE_ENTRIES.map((e) => ({ templateKey: e.templateKey, chance: 0.2 })),
      { templateKey: RARE_TOKEN_KEY, chance: 0.15 },
    ],
  },
});

const DEFAULT_LEVEL_THRESHOLDS = Object.freeze({
  hard: 20,
  standard: 8,
});

export function difficultyForOpponentLevel(level: number): Difficulty {
  if (!Number.isFinite(level) || level <= 0) return "easy";
  if (level >= DEFAULT_LEVEL_THRESHOLDS.hard) return "hard";
  if (level >= DEFAULT_LEVEL_THRESHOLDS.standard) return "standard";
  return "easy";
}

export function rollDrops(table: DropTable, rng: Rng): string[] {
  const drops: string[] = [];
  for (const entry of table.entries) {
    if (rng.next() < entry.chance) drops.push(entry.templateKey);
  }
  return drops;
}
