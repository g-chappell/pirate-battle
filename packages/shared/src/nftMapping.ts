import type { Affinity, CrewSnapshot, MoveDef } from "@pirate-battle/core";

export interface NftMetadata {
  policyId: string;
  assetName: string;
  traits: Readonly<Record<string, string>>;
}

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface StatDelta {
  hp?: number;
  atk?: number;
  def?: number;
  spd?: number;
}

export interface TraitRule {
  delta?: StatDelta;
  affinity?: Affinity;
  moves?: readonly MoveDef[];
}

export interface CollectionRules {
  baseStats: BaseStats;
  baseLevel: number;
  baseAffinity: Affinity;
  baseMoves: readonly MoveDef[];
  traits: Readonly<Record<string, Readonly<Record<string, TraitRule>>>>;
}

export const MIN_STAT = 1;

function clampStat(value: number): number {
  return value < MIN_STAT ? MIN_STAT : Math.floor(value);
}

function applyDelta(stats: BaseStats, delta: StatDelta): BaseStats {
  return {
    hp: stats.hp + (delta.hp ?? 0),
    atk: stats.atk + (delta.atk ?? 0),
    def: stats.def + (delta.def ?? 0),
    spd: stats.spd + (delta.spd ?? 0),
  };
}

export function deriveCrewStats(metadata: NftMetadata, rules: CollectionRules): CrewSnapshot {
  let stats: BaseStats = { ...rules.baseStats };
  let affinity: Affinity = rules.baseAffinity;
  let moves: readonly MoveDef[] = rules.baseMoves;

  const traitNames = Object.keys(rules.traits).sort();
  for (const traitName of traitNames) {
    const traitValue = metadata.traits[traitName];
    if (traitValue === undefined) continue;
    const valueRules = rules.traits[traitName];
    if (!valueRules) continue;
    const rule = valueRules[traitValue];
    if (!rule) continue;
    if (rule.delta) stats = applyDelta(stats, rule.delta);
    if (rule.affinity) affinity = rule.affinity;
    if (rule.moves) moves = rule.moves;
  }

  const hp = clampStat(stats.hp);
  return {
    templateKey: `${metadata.policyId}.${metadata.assetName}`,
    hp,
    maxHp: hp,
    atk: clampStat(stats.atk),
    def: clampStat(stats.def),
    spd: clampStat(stats.spd),
    level: rules.baseLevel,
    affinity,
    statuses: [],
    moves: moves.map((m) => ({ ...m })),
  };
}
