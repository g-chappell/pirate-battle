import type { Action, BattleEvent, BattleState, CrewSnapshot, Side } from "@pirate-battle/core";

export type ViewerSide = Side;

export interface MoveOption {
  key: string;
  name: string;
  basePower: number;
  accuracy: number;
  affinity: string;
  kind: string;
}

export interface BenchOption {
  index: number;
  affinity: string;
  hp: number;
  maxHp: number;
  fainted: boolean;
}

export function isViewersTurn(state: BattleState, viewer: ViewerSide): boolean {
  if (state.winner !== null) return false;
  const pending = viewer === "A" ? state.pendingSwapA : state.pendingSwapB;
  if (pending) return true;
  const otherPending = viewer === "A" ? state.pendingSwapB : state.pendingSwapA;
  return !otherPending;
}

export function activeCrewFor(state: BattleState, viewer: ViewerSide): CrewSnapshot {
  return viewer === "A" ? state.activeA : state.activeB;
}

export function benchFor(state: BattleState, viewer: ViewerSide): CrewSnapshot[] {
  return viewer === "A" ? state.benchA : state.benchB;
}

export function moveOptionsFor(state: BattleState, viewer: ViewerSide): MoveOption[] {
  const pending = viewer === "A" ? state.pendingSwapA : state.pendingSwapB;
  if (pending) return [];
  return activeCrewFor(state, viewer).moves.map((m) => ({
    key: m.key,
    name: m.name,
    basePower: m.basePower,
    accuracy: m.accuracy,
    affinity: m.affinity,
    kind: m.kind,
  }));
}

export function benchOptionsFor(state: BattleState, viewer: ViewerSide): BenchOption[] {
  return benchFor(state, viewer).map((c, i) => ({
    index: i,
    affinity: c.affinity,
    hp: c.hp,
    maxHp: c.maxHp,
    fainted: c.hp <= 0,
  }));
}

export function canSwapTo(option: BenchOption): boolean {
  return !option.fainted;
}

export function buildMoveAction(moveKey: string): Action {
  return { type: "move", moveKey };
}

export function buildSwitchAction(targetIndex: number): Action {
  return { type: "switch", targetIndex };
}

export function buildForfeitAction(): Action {
  return { type: "forfeit" };
}

export function describeBattleEvent(event: BattleEvent): string {
  switch (event.kind) {
    case "switch":
      return `Side ${event.side} switched to bench slot ${event.toIndex}`;
    case "move":
      return `Side ${event.side} used ${event.moveKey}${
        event.crit ? " (crit!)" : ""
      } — ${event.damage} dmg${event.effective !== 1 ? ` (×${event.effective})` : ""}`;
    case "miss":
      return `Side ${event.side}'s ${event.moveKey} missed`;
    case "stun_skip":
      return `Side ${event.side} is stunned and skipped ${event.moveKey}`;
    case "status_apply":
      return `Side ${event.side} was afflicted with ${event.status}`;
    case "status_tick":
      return `Side ${event.side} took ${event.damage} from ${event.status}`;
    case "faint":
      return `Side ${event.side}'s active crew fainted`;
    case "swap_required":
      return `Side ${event.side} must swap in a new crew`;
    case "forfeit":
      return `Side ${event.side} forfeited`;
    case "victory":
      return `Side ${event.side} wins the battle`;
  }
}

export function turnLogLines(state: BattleState): string[] {
  return state.log.map(describeBattleEvent);
}
