import { affinityMultiplier } from "./constants.js";
import type {
  Action,
  BattleState,
  CrewSnapshot,
  MoveDef,
  Side,
} from "./types.js";

function isFainted(crew: CrewSnapshot): boolean {
  return crew.hp <= 0;
}

function firstHealthyBenchIndex(bench: readonly CrewSnapshot[]): number {
  for (let i = 0; i < bench.length; i++) {
    if (!isFainted(bench[i]!)) return i;
  }
  return -1;
}

function expectedDamage(
  attacker: CrewSnapshot,
  defender: CrewSnapshot,
  move: MoveDef,
): number {
  if (move.kind !== "damage" || move.basePower <= 0) return 0;
  const eff = affinityMultiplier(move.affinity, defender.affinity);
  return move.basePower * eff * (move.accuracy / 100);
}

export function aiPickAction(state: BattleState, side: Side): Action {
  const active = side === "A" ? state.activeA : state.activeB;
  const bench = side === "A" ? state.benchA : state.benchB;
  const opponent = side === "A" ? state.activeB : state.activeA;
  const pendingSwap = side === "A" ? state.pendingSwapA : state.pendingSwapB;

  if (pendingSwap || isFainted(active)) {
    const idx = firstHealthyBenchIndex(bench);
    if (idx < 0) return { type: "forfeit" };
    return { type: "switch", targetIndex: idx };
  }

  let best: { move: MoveDef; score: number } | null = null;
  for (const move of active.moves) {
    const score = expectedDamage(active, opponent, move);
    if (best === null || score > best.score) {
      best = { move, score };
    }
  }

  if (best === null) {
    return { type: "forfeit" };
  }
  return { type: "move", moveKey: best.move.key };
}
