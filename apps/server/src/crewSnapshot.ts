import { CREWS_BY_KEY, MOVES_BY_KEY } from "@pirate-battle/content";
import {
  DEFAULT_LEVEL,
  type BattleState,
  type CrewSnapshot,
} from "@pirate-battle/core";

import type { CaptainTeam } from "./userStore.js";

export function crewSnapshotFromTemplate(
  templateKey: string,
  moveKeys: readonly string[],
  level: number = DEFAULT_LEVEL,
): CrewSnapshot {
  const template = CREWS_BY_KEY[templateKey];
  if (!template) {
    throw new Error(`unknown crew template: ${templateKey}`);
  }
  const moves = moveKeys.map((key) => {
    const move = MOVES_BY_KEY[key];
    if (!move) throw new Error(`unknown move: ${key}`);
    return move;
  });
  return {
    hp: template.baseStats.hp,
    maxHp: template.baseStats.hp,
    atk: template.baseStats.atk,
    def: template.baseStats.def,
    spd: template.baseStats.spd,
    level,
    affinity: template.affinity,
    statuses: [],
    moves,
  };
}

export function teamToSnapshots(team: CaptainTeam): CrewSnapshot[] {
  if (team.crews.length === 0) {
    throw new Error(`team ${team.id} has no crews`);
  }
  return team.crews.map((c) =>
    crewSnapshotFromTemplate(c.templateKey, c.moveKeys),
  );
}

export function buildInitialBattleState(
  playerSnapshots: CrewSnapshot[],
  aiSnapshots: CrewSnapshot[],
  seed: number,
): BattleState {
  if (playerSnapshots.length === 0) {
    throw new Error("player team must have at least one crew");
  }
  if (aiSnapshots.length === 0) {
    throw new Error("AI team must have at least one crew");
  }
  const seedU32 = seed >>> 0;
  return {
    turn: 0,
    activeA: playerSnapshots[0]!,
    activeB: aiSnapshots[0]!,
    benchA: playerSnapshots.slice(1),
    benchB: aiSnapshots.slice(1),
    log: [],
    rngSeed: seedU32,
    rngState: seedU32,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
  };
}
