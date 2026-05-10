import { CREWS_BY_KEY, MOVES_BY_KEY, TRAINING_CHIP_KEY } from "@pirate-battle/content";
import type { CrewTemplate, ItemTemplate } from "@pirate-battle/content";
import {
  canTrainStat,
  effectiveStats,
  maxTrainedDelta,
  trainedDeltaOf,
  xpToAdvance,
  type CrewAttrs,
  type TrainableStat,
} from "@pirate-battle/core";

export interface CaptainTeamCrewView {
  id: string;
  templateKey: string;
  level: number;
  xp: number;
  moveKeys: string[];
  attrs: CrewAttrs | null;
}

export interface InventoryEntryView {
  templateKey: string;
  qty: number;
}

export interface CaptainTeamView {
  captainId: string;
  name: string;
  factionId: string;
  crews: CaptainTeamCrewView[];
  inventory: InventoryEntryView[];
}

export interface CrewDetailRow {
  stat: TrainableStat;
  base: number;
  effective: number;
  trained: number;
  cap: number;
  canTrain: boolean;
}

export interface CrewDetail {
  crewId: string;
  template: CrewTemplate;
  level: number;
  xp: number;
  xpForNext: number;
  xpRatio: number;
  hp: { base: number; effective: number };
  rows: CrewDetailRow[];
  moves: Array<{ key: string; name: string }>;
  attrs: CrewAttrs;
}

export function getChipCount(inventory: readonly InventoryEntryView[]): number {
  return inventory.find((i) => i.templateKey === TRAINING_CHIP_KEY)?.qty ?? 0;
}

export function buildCrewDetail(crew: CaptainTeamCrewView): CrewDetail | null {
  const template = CREWS_BY_KEY[crew.templateKey];
  if (!template) return null;

  const attrs: CrewAttrs = crew.attrs ?? {};
  const eff = effectiveStats(template.baseStats, crew.level, attrs);
  const xpForNext = xpToAdvance(crew.level);
  const xpRatio = xpForNext > 0 ? Math.max(0, Math.min(1, crew.xp / xpForNext)) : 0;

  const rows: CrewDetailRow[] = (["atk", "def", "spd"] as const).map((stat) => {
    const base = template.baseStats[stat];
    return {
      stat,
      base,
      effective: eff[stat],
      trained: trainedDeltaOf(attrs, stat),
      cap: maxTrainedDelta(base),
      canTrain: canTrainStat(template.baseStats, attrs, stat),
    };
  });

  const moves = crew.moveKeys.map((key) => {
    const m = MOVES_BY_KEY[key];
    return { key, name: m?.name ?? key };
  });

  return {
    crewId: crew.id,
    template,
    level: crew.level,
    xp: crew.xp,
    xpForNext,
    xpRatio,
    hp: { base: template.baseStats.hp, effective: eff.hp },
    rows,
    moves,
    attrs,
  };
}

export function getItemLabel(templateKey: string, items: readonly ItemTemplate[]): string {
  return items.find((i) => i.templateKey === templateKey)?.name ?? templateKey;
}
