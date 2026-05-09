import {
  BURN_FRACTION,
  POISON_FRACTION,
  STATUS_BURN,
  STATUS_POISON,
  STATUS_STUN,
  STUN_SKIP_CHANCE,
} from "./constants.js";
import { computeDamage, rollAccuracy } from "./resolveMove.js";
import { createRng, type Rng } from "./rng.js";
import type {
  Action,
  BattleEvent,
  BattleState,
  CrewSnapshot,
  MoveDef,
  Side,
} from "./types.js";

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

function addStatus(crew: CrewSnapshot, status: string): CrewSnapshot {
  if (crew.statuses.includes(status)) return crew;
  return { ...crew, statuses: [...crew.statuses, status] };
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

    if (attackerSlot.active.statuses.includes(STATUS_STUN)) {
      if (rng.next() < STUN_SKIP_CHANCE) {
        events.push({
          kind: "stun_skip",
          side: mover.side,
          moveKey: mover.move.key,
        });
        continue;
      }
    }

    if (mover.move.kind === "status") {
      if (!rollAccuracy(mover.move.accuracy, rng)) {
        events.push({
          kind: "miss",
          side: mover.side,
          moveKey: mover.move.key,
        });
        continue;
      }
      const status = mover.move.statusEffect;
      if (status) {
        const updated = addStatus(defenderSlot.active, status);
        slots = {
          ...slots,
          [defenderSide]: { ...defenderSlot, active: updated },
        };
        events.push({ kind: "status_apply", side: defenderSide, status });
      }
      continue;
    }

    if (mover.move.kind === "buff") continue;

    const result = computeDamage(
      attackerSlot.active,
      defenderSlot.active,
      mover.move,
      rng,
    );
    if (!result.hit) {
      events.push({
        kind: "miss",
        side: mover.side,
        moveKey: mover.move.key,
      });
      continue;
    }
    const newHp = Math.max(0, defenderSlot.active.hp - result.damage);
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
      damage: result.damage,
      targetHpAfter: newHp,
      crit: result.crit,
      effective: result.effective,
    });
    if (newHp === 0) {
      events.push({ kind: "faint", side: defenderSide });
    }
  }

  for (const side of ["A", "B"] as const) {
    const slot = slots[side];
    if (isFainted(slot.active)) continue;
    for (const status of slot.active.statuses) {
      let fraction = 0;
      if (status === STATUS_POISON) fraction = POISON_FRACTION;
      else if (status === STATUS_BURN) fraction = BURN_FRACTION;
      else continue;
      const damage = Math.max(1, Math.floor(slot.active.maxHp * fraction));
      const newHp = Math.max(0, slot.active.hp - damage);
      slots = {
        ...slots,
        [side]: { ...slot, active: { ...slot.active, hp: newHp } },
      };
      events.push({
        kind: "status_tick",
        side,
        status,
        damage,
        targetHpAfter: newHp,
      });
      if (newHp === 0) {
        events.push({ kind: "faint", side });
        break;
      }
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
