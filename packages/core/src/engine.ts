import type {
  Action,
  BattleEvent,
  BattleState,
  CrewSnapshot,
  MoveDef,
  Side,
} from "./types.js";
import { createRng, type Rng } from "./rng.js";

interface SideSlot {
  side: Side;
  active: CrewSnapshot;
  bench: CrewSnapshot[];
  action: Action;
}

function getMove(crew: CrewSnapshot, moveKey: string): MoveDef {
  const move = crew.moves.find((m) => m.key === moveKey);
  if (!move) {
    throw new Error(`crew does not know move "${moveKey}"`);
  }
  return move;
}

function isFainted(crew: CrewSnapshot): boolean {
  return crew.hp <= 0;
}

function hasFightingBench(bench: CrewSnapshot[]): boolean {
  return bench.some((c) => !isFainted(c));
}

function applySwitch(
  active: CrewSnapshot,
  bench: CrewSnapshot[],
  targetIndex: number,
): { active: CrewSnapshot; bench: CrewSnapshot[] } {
  if (targetIndex < 0 || targetIndex >= bench.length) {
    throw new Error(`switch targetIndex ${targetIndex} out of range`);
  }
  const incoming = bench[targetIndex]!;
  if (isFainted(incoming)) {
    throw new Error(`cannot switch to fainted crew at index ${targetIndex}`);
  }
  const newBench = bench.slice();
  newBench[targetIndex] = active;
  return { active: incoming, bench: newBench };
}

function computeDamage(_attacker: CrewSnapshot, move: MoveDef): number {
  if (move.kind !== "damage") return 0;
  return move.basePower;
}

function moveOrder(
  a: { move: MoveDef; spd: number; side: Side },
  b: { move: MoveDef; spd: number; side: Side },
  rng: Rng,
): -1 | 1 {
  const pa = a.move.priority ?? 0;
  const pb = b.move.priority ?? 0;
  if (pa !== pb) return pa > pb ? -1 : 1;
  if (a.spd !== b.spd) return a.spd > b.spd ? -1 : 1;
  return rng.next() < 0.5 ? -1 : 1;
}

export function resolveTurn(
  state: BattleState,
  actionA: Action,
  actionB: Action,
  rng: Rng,
): BattleState {
  if (state.winner !== null) {
    throw new Error("battle already ended");
  }
  if (state.pendingSwapA && actionA.type !== "switch") {
    throw new Error("side A must switch — active is fainted");
  }
  if (state.pendingSwapB && actionB.type !== "switch") {
    throw new Error("side B must switch — active is fainted");
  }

  const events: BattleEvent[] = [];

  if (actionA.type === "forfeit") {
    events.push({ kind: "forfeit", side: "A" });
    events.push({ kind: "victory", side: "B" });
    return {
      ...state,
      log: [...state.log, ...events],
      rngState: rng.state,
      turn: state.turn + 1,
      winner: "B",
      pendingSwapA: false,
      pendingSwapB: false,
    };
  }
  if (actionB.type === "forfeit") {
    events.push({ kind: "forfeit", side: "B" });
    events.push({ kind: "victory", side: "A" });
    return {
      ...state,
      log: [...state.log, ...events],
      rngState: rng.state,
      turn: state.turn + 1,
      winner: "A",
      pendingSwapA: false,
      pendingSwapB: false,
    };
  }

  let slots: Record<Side, SideSlot> = {
    A: {
      side: "A",
      active: state.activeA,
      bench: state.benchA,
      action: actionA,
    },
    B: {
      side: "B",
      active: state.activeB,
      bench: state.benchB,
      action: actionB,
    },
  };

  for (const side of ["A", "B"] as const) {
    const slot = slots[side];
    if (slot.action.type === "switch") {
      const { active, bench } = applySwitch(
        slot.active,
        slot.bench,
        slot.action.targetIndex,
      );
      slots = {
        ...slots,
        [side]: { ...slot, active, bench },
      };
      events.push({
        kind: "switch",
        side,
        toIndex: slot.action.targetIndex,
      });
    }
  }

  const movers: Array<{ side: Side; move: MoveDef; spd: number }> = [];
  for (const side of ["A", "B"] as const) {
    const slot = slots[side];
    if (slot.action.type === "move") {
      movers.push({
        side,
        move: getMove(slot.active, slot.action.moveKey),
        spd: slot.active.spd,
      });
    }
  }
  movers.sort((a, b) => moveOrder(a, b, rng));

  for (const mover of movers) {
    const attackerSlot = slots[mover.side];
    const defenderSide: Side = mover.side === "A" ? "B" : "A";
    const defenderSlot = slots[defenderSide];

    if (isFainted(attackerSlot.active)) continue;

    const damage = computeDamage(attackerSlot.active, mover.move);
    const newHp = Math.max(0, defenderSlot.active.hp - damage);
    const newDefenderActive: CrewSnapshot = {
      ...defenderSlot.active,
      hp: newHp,
    };
    slots = {
      ...slots,
      [defenderSide]: { ...defenderSlot, active: newDefenderActive },
    };
    events.push({
      kind: "move",
      side: mover.side,
      moveKey: mover.move.key,
      damage,
      targetHpAfter: newHp,
    });
    if (newHp === 0) {
      events.push({ kind: "faint", side: defenderSide });
    }
  }

  let pendingSwapA = false;
  let pendingSwapB = false;
  let winner: Side | null = null;

  for (const side of ["A", "B"] as const) {
    const slot = slots[side];
    if (isFainted(slot.active)) {
      if (hasFightingBench(slot.bench)) {
        events.push({ kind: "swap_required", side });
        if (side === "A") pendingSwapA = true;
        else pendingSwapB = true;
      } else {
        winner = side === "A" ? "B" : "A";
      }
    }
  }

  if (winner !== null) {
    events.push({ kind: "victory", side: winner });
    pendingSwapA = false;
    pendingSwapB = false;
  }

  return {
    ...state,
    activeA: slots.A.active,
    activeB: slots.B.active,
    benchA: slots.A.bench,
    benchB: slots.B.bench,
    log: [...state.log, ...events],
    rngSeed: state.rngSeed,
    rngState: rng.state,
    turn: state.turn + 1,
    pendingSwapA,
    pendingSwapB,
    winner,
  };
}

export { createRng, type Rng };
