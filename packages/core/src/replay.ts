import type { BattleEvent, BattleState, CrewSnapshot, Side } from "./types.js";

function resetCrew(crew: CrewSnapshot): CrewSnapshot {
  return { ...crew, hp: crew.maxHp, statuses: [] };
}

export function deriveInitialState(finalState: BattleState): BattleState {
  let activeA = finalState.activeA;
  let activeB = finalState.activeB;
  const benchA = finalState.benchA.slice();
  const benchB = finalState.benchB.slice();

  for (let i = finalState.log.length - 1; i >= 0; i--) {
    const ev = finalState.log[i]!;
    if (ev.kind !== "switch") continue;
    if (ev.side === "A") {
      const tmp = benchA[ev.toIndex];
      if (!tmp) continue;
      benchA[ev.toIndex] = activeA;
      activeA = tmp;
    } else {
      const tmp = benchB[ev.toIndex];
      if (!tmp) continue;
      benchB[ev.toIndex] = activeB;
      activeB = tmp;
    }
  }

  return {
    turn: 0,
    activeA: resetCrew(activeA),
    activeB: resetCrew(activeB),
    benchA: benchA.map(resetCrew),
    benchB: benchB.map(resetCrew),
    log: [],
    rngSeed: finalState.rngSeed,
    rngState: finalState.rngSeed,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
  };
}

function setActive(state: BattleState, side: Side, crew: CrewSnapshot): BattleState {
  return side === "A" ? { ...state, activeA: crew } : { ...state, activeB: crew };
}

function activeOf(state: BattleState, side: Side): CrewSnapshot {
  return side === "A" ? state.activeA : state.activeB;
}

function benchOf(state: BattleState, side: Side): CrewSnapshot[] {
  return side === "A" ? state.benchA : state.benchB;
}

function setBench(state: BattleState, side: Side, bench: CrewSnapshot[]): BattleState {
  return side === "A" ? { ...state, benchA: bench } : { ...state, benchB: bench };
}

export function applyBattleEvent(state: BattleState, event: BattleEvent): BattleState {
  const opposite: Side = event.side === "A" ? "B" : "A";
  let next: BattleState = { ...state, log: [...state.log, event] };

  switch (event.kind) {
    case "switch": {
      const active = activeOf(next, event.side);
      const bench = benchOf(next, event.side).slice();
      const incoming = bench[event.toIndex];
      if (!incoming) return next;
      bench[event.toIndex] = active;
      next = setActive(next, event.side, incoming);
      next = setBench(next, event.side, bench);
      return event.side === "A"
        ? { ...next, pendingSwapA: false }
        : { ...next, pendingSwapB: false };
    }
    case "move": {
      const target = activeOf(next, opposite);
      return setActive(next, opposite, { ...target, hp: event.targetHpAfter });
    }
    case "miss":
    case "stun_skip":
      return next;
    case "status_apply": {
      const target = activeOf(next, event.side);
      if (target.statuses.includes(event.status)) return next;
      return setActive(next, event.side, {
        ...target,
        statuses: [...target.statuses, event.status],
      });
    }
    case "status_tick": {
      const target = activeOf(next, event.side);
      return setActive(next, event.side, { ...target, hp: event.targetHpAfter });
    }
    case "faint": {
      const target = activeOf(next, event.side);
      if (target.hp === 0) return next;
      return setActive(next, event.side, { ...target, hp: 0 });
    }
    case "swap_required": {
      return event.side === "A" ? { ...next, pendingSwapA: true } : { ...next, pendingSwapB: true };
    }
    case "forfeit":
      return next;
    case "victory":
      return { ...next, winner: event.side, pendingSwapA: false, pendingSwapB: false };
  }
}

export function stateAtCursor(
  initialState: BattleState,
  events: readonly BattleEvent[],
  cursor: number,
): BattleState {
  const clamped = Math.max(0, Math.min(cursor, events.length));
  let state = initialState;
  for (let i = 0; i < clamped; i++) {
    state = applyBattleEvent(state, events[i]!);
  }
  return state;
}
