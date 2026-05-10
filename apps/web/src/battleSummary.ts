import type { BattleState, CrewSnapshot, Side } from "@pirate-battle/core";

import type { ViewerSide } from "./battleView";

export interface CrewSurvivalRow {
  index: number;
  affinity: string;
  hp: number;
  maxHp: number;
  fainted: boolean;
  active: boolean;
}

export interface BattleResultSummary {
  ended: boolean;
  winner: Side | null;
  viewerWon: boolean | null;
  turnCount: number;
  viewerSurvivors: number;
  opponentSurvivors: number;
  viewerCrews: CrewSurvivalRow[];
  opponentCrews: CrewSurvivalRow[];
}

function rowsForSide(active: CrewSnapshot, bench: CrewSnapshot[]): CrewSurvivalRow[] {
  const rows: CrewSurvivalRow[] = [
    {
      index: 0,
      affinity: active.affinity,
      hp: Math.max(0, active.hp),
      maxHp: active.maxHp,
      fainted: active.hp <= 0,
      active: true,
    },
  ];
  bench.forEach((c, i) => {
    rows.push({
      index: i + 1,
      affinity: c.affinity,
      hp: Math.max(0, c.hp),
      maxHp: c.maxHp,
      fainted: c.hp <= 0,
      active: false,
    });
  });
  return rows;
}

export function summarizeBattleResult(state: BattleState, viewer: ViewerSide): BattleResultSummary {
  const sideARows = rowsForSide(state.activeA, state.benchA);
  const sideBRows = rowsForSide(state.activeB, state.benchB);
  const viewerRows = viewer === "A" ? sideARows : sideBRows;
  const opponentRows = viewer === "A" ? sideBRows : sideARows;
  const ended = state.winner !== null;
  const viewerWon = ended ? state.winner === viewer : null;
  return {
    ended,
    winner: state.winner,
    viewerWon,
    turnCount: state.turn,
    viewerSurvivors: viewerRows.filter((r) => !r.fainted).length,
    opponentSurvivors: opponentRows.filter((r) => !r.fainted).length,
    viewerCrews: viewerRows,
    opponentCrews: opponentRows,
  };
}

export type HistoryResult = "won" | "lost" | "in_progress";

export interface FinishedBattleListItem {
  id: string;
  mode: string;
  userSide: Side;
  winner: Side | null;
  turn: number;
  startedAt: number;
  endedAt: number | null;
}

export function historyResult(item: FinishedBattleListItem): HistoryResult {
  if (item.winner === null) return "in_progress";
  return item.winner === item.userSide ? "won" : "lost";
}

export function historyResultLabel(item: FinishedBattleListItem): string {
  switch (historyResult(item)) {
    case "won":
      return "Won";
    case "lost":
      return "Lost";
    case "in_progress":
      return "In progress";
  }
}

export function historyModeLabel(mode: string): string {
  switch (mode) {
    case "PVE":
      return "vs AI";
    case "PVP":
      return "vs Captain";
    case "AI":
      return "AI replay";
    default:
      return mode;
  }
}

export function formatHistoryTimestamp(ms: number | null): string {
  if (ms === null) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}
