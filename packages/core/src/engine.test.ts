import { describe, expect, it } from "vitest";
import { resolveTurn } from "./engine.js";
import { createRng, type Rng } from "./rng.js";
import { STATUS_BURN, STATUS_POISON, STATUS_STUN } from "./constants.js";
import type { Action, BattleState, CrewSnapshot, MoveDef } from "./types.js";

const tackle: MoveDef = {
  key: "tackle",
  name: "Tackle",
  affinity: "kraken",
  basePower: 30,
  accuracy: 100,
  kind: "damage",
};

const heavyHit: MoveDef = {
  key: "heavy",
  name: "Heavy Hit",
  affinity: "ironclad",
  basePower: 60,
  accuracy: 100,
  kind: "damage",
};

const quickJab: MoveDef = {
  key: "quick",
  name: "Quick Jab",
  affinity: "phantom",
  basePower: 10,
  accuracy: 100,
  kind: "damage",
  priority: 1,
};

const sureMiss: MoveDef = {
  key: "miss50",
  name: "Coin Flip",
  affinity: "kraken",
  basePower: 30,
  accuracy: 50,
  kind: "damage",
};

const venomFangs: MoveDef = {
  key: "venom",
  name: "Venom Fangs",
  affinity: "phantom",
  basePower: 0,
  accuracy: 100,
  kind: "status",
  statusEffect: STATUS_POISON,
};

function crew(overrides: Partial<CrewSnapshot> = {}): CrewSnapshot {
  return {
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 50,
    spd: 50,
    level: 50,
    affinity: "kraken",
    statuses: [],
    moves: [tackle],
    ...overrides,
  };
}

function initialState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    turn: 0,
    activeA: crew({ spd: 60 }),
    activeB: crew({ spd: 40 }),
    benchA: [crew(), crew()],
    benchB: [crew(), crew()],
    log: [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
    ...overrides,
  };
}

const move = (key: string): Action => ({ type: "move", moveKey: key });
const swap = (i: number): Action => ({ type: "switch", targetIndex: i });

function constantRng(value: number): Rng {
  return {
    state: 0,
    next() {
      return value;
    },
  };
}

function scriptedRng(values: number[]): Rng {
  let i = 0;
  return {
    state: 0,
    next() {
      const v = values[i] ?? 0.5;
      i++;
      return v;
    },
  };
}

describe("resolveTurn — turn loop, ordering, swap, faint", () => {
  it("applies damage from move action with the standard formula", () => {
    const state = initialState();
    const next = resolveTurn(
      state,
      move("tackle"),
      move("tackle"),
      constantRng(0.5),
    );
    expect(next.activeA.hp).toBe(85);
    expect(next.activeB.hp).toBe(85);
    expect(next.turn).toBe(1);
  });

  it("orders moves by speed (faster crew acts first)", () => {
    const state = initialState({
      activeA: crew({ spd: 90, hp: 50, moves: [tackle] }),
      activeB: crew({ spd: 10, hp: 50, moves: [heavyHit] }),
    });
    const next = resolveTurn(
      state,
      move("tackle"),
      move("heavy"),
      constantRng(0.5),
    );
    const moveEvents = next.log.filter((e) => e.kind === "move");
    expect(moveEvents[0]?.kind === "move" && moveEvents[0].side).toBe("A");
    expect(moveEvents[1]?.kind === "move" && moveEvents[1].side).toBe("B");
  });

  it("priority overrides speed", () => {
    const state = initialState({
      activeA: crew({ spd: 10, moves: [quickJab] }),
      activeB: crew({ spd: 90, moves: [tackle] }),
    });
    const next = resolveTurn(
      state,
      move("quick"),
      move("tackle"),
      constantRng(0.5),
    );
    const moveEvents = next.log.filter((e) => e.kind === "move");
    expect(moveEvents[0]?.kind === "move" && moveEvents[0].side).toBe("A");
  });

  it("resolves switches before moves and target hits the new active", () => {
    const fresh = crew({ hp: 100, moves: [tackle] });
    const state = initialState({
      activeA: crew({ spd: 80, moves: [tackle] }),
      activeB: crew({ spd: 10, hp: 30, moves: [tackle] }),
      benchA: [fresh, crew()],
    });
    const next = resolveTurn(state, swap(0), move("tackle"), constantRng(0.5));
    expect(next.activeA.hp).toBe(85);
    expect(next.benchA[0]?.spd).toBe(80);
  });

  it("faints the target and prompts swap when bench has fighters", () => {
    const state = initialState({
      activeA: crew({ spd: 90, moves: [heavyHit] }),
      activeB: crew({ spd: 10, hp: 5, moves: [tackle] }),
    });
    const next = resolveTurn(
      state,
      move("heavy"),
      move("tackle"),
      constantRng(0.5),
    );
    expect(next.activeB.hp).toBe(0);
    expect(next.pendingSwapB).toBe(true);
    expect(next.winner).toBeNull();
    expect(
      next.log.some((e) => e.kind === "swap_required" && e.side === "B"),
    ).toBe(true);
  });

  it("declares the opposite side winner when all crews are fainted", () => {
    const state = initialState({
      activeA: crew({ spd: 90, moves: [heavyHit] }),
      activeB: crew({ spd: 10, hp: 5, moves: [tackle] }),
      benchB: [crew({ hp: 0 }), crew({ hp: 0 })],
    });
    const next = resolveTurn(
      state,
      move("heavy"),
      move("tackle"),
      constantRng(0.5),
    );
    expect(next.winner).toBe("A");
    expect(next.log.some((e) => e.kind === "victory" && e.side === "A")).toBe(
      true,
    );
  });

  it("forfeit ends the battle and the other side wins", () => {
    const state = initialState();
    const next = resolveTurn(
      state,
      { type: "forfeit" },
      move("tackle"),
      createRng(1),
    );
    expect(next.winner).toBe("B");
    expect(next.log.some((e) => e.kind === "forfeit" && e.side === "A")).toBe(
      true,
    );
  });

  it("rejects a non-switch action when a swap is pending", () => {
    const state = initialState({ pendingSwapA: true });
    expect(() =>
      resolveTurn(state, move("tackle"), move("tackle"), createRng(1)),
    ).toThrow(/must switch/);
  });

  it("rejects switching to a fainted crew", () => {
    const state = initialState({
      benchA: [crew({ hp: 0 }), crew()],
    });
    expect(() =>
      resolveTurn(state, swap(0), move("tackle"), createRng(1)),
    ).toThrow(/fainted/);
  });

  it("threads the rng state through into the new state", () => {
    const state = initialState({
      activeA: crew({ spd: 50, moves: [tackle] }),
      activeB: crew({ spd: 50, moves: [tackle] }),
    });
    const rng = createRng(state.rngState);
    const next = resolveTurn(state, move("tackle"), move("tackle"), rng);
    expect(next.rngState).toBe(rng.state);
    expect(next.rngState).not.toBe(state.rngState);
  });

  it("is deterministic — same seed + actions produces identical logs", () => {
    const stateA = initialState();
    const stateB = initialState();
    const turn1A = resolveTurn(
      stateA,
      move("tackle"),
      move("tackle"),
      createRng(stateA.rngState),
    );
    const turn1B = resolveTurn(
      stateB,
      move("tackle"),
      move("tackle"),
      createRng(stateB.rngState),
    );
    expect(JSON.stringify(turn1A)).toBe(JSON.stringify(turn1B));

    const turn2A = resolveTurn(
      turn1A,
      move("tackle"),
      move("tackle"),
      createRng(turn1A.rngState),
    );
    const turn2B = resolveTurn(
      turn1B,
      move("tackle"),
      move("tackle"),
      createRng(turn1B.rngState),
    );
    expect(JSON.stringify(turn2A)).toBe(JSON.stringify(turn2B));
  });
});

describe("resolveTurn — accuracy + crit", () => {
  it("misses when the accuracy roll fails", () => {
    const state = initialState({
      activeA: crew({ spd: 90, moves: [sureMiss] }),
      activeB: crew({ spd: 10, moves: [tackle] }),
    });
    const next = resolveTurn(
      state,
      move("miss50"),
      move("tackle"),
      scriptedRng([0.99, 0.5, 0.5]),
    );
    expect(next.activeB.hp).toBe(100);
    expect(next.log.some((e) => e.kind === "miss" && e.side === "A")).toBe(
      true,
    );
  });

  it("doubles damage on a critical hit", () => {
    const state = initialState({
      activeA: crew({ spd: 90, moves: [tackle] }),
      activeB: crew({ spd: 10, moves: [tackle] }),
    });
    const critRng = scriptedRng([0, 0.5, 0.5]);
    const next = resolveTurn(state, move("tackle"), move("tackle"), critRng);
    const aMove = next.log.find((e) => e.kind === "move" && e.side === "A");
    expect(aMove?.kind === "move" && aMove.crit).toBe(true);
    expect(aMove?.kind === "move" && aMove.damage).toBe(30);
  });
});

describe("resolveTurn — type chart", () => {
  it("super-effective hits deal double damage (kraken → ironclad)", () => {
    const state = initialState({
      activeA: crew({ spd: 90, affinity: "kraken", moves: [tackle] }),
      activeB: crew({ spd: 10, affinity: "ironclad", moves: [tackle] }),
    });
    const next = resolveTurn(
      state,
      move("tackle"),
      move("tackle"),
      constantRng(0.5),
    );
    const aMove = next.log.find((e) => e.kind === "move" && e.side === "A");
    expect(aMove?.kind === "move" && aMove.effective).toBe(2);
    expect(aMove?.kind === "move" && aMove.damage).toBe(30);
  });

  it("neutral matchups deal base damage (phantom → ironclad)", () => {
    const state = initialState({
      activeA: crew({ spd: 90, affinity: "phantom", moves: [quickJab] }),
      activeB: crew({ spd: 10, affinity: "ironclad", moves: [tackle] }),
    });
    const next = resolveTurn(
      state,
      move("quick"),
      move("tackle"),
      constantRng(0.5),
    );
    const aMove = next.log.find((e) => e.kind === "move" && e.side === "A");
    expect(aMove?.kind === "move" && aMove.effective).toBe(1);
  });
});

describe("resolveTurn — status effects", () => {
  it("applies poison via a status move and ticks at end of turn", () => {
    const state = initialState({
      activeA: crew({ spd: 90, moves: [venomFangs] }),
      activeB: crew({ spd: 10, moves: [tackle] }),
    });
    const next = resolveTurn(
      state,
      move("venom"),
      move("tackle"),
      constantRng(0.5),
    );
    expect(next.activeB.statuses).toContain(STATUS_POISON);
    expect(next.activeB.hp).toBe(100 - Math.floor(100 / 8));
    expect(
      next.log.some(
        (e) =>
          e.kind === "status_apply" &&
          e.side === "B" &&
          e.status === STATUS_POISON,
      ),
    ).toBe(true);
    expect(
      next.log.some(
        (e) =>
          e.kind === "status_tick" &&
          e.side === "B" &&
          e.status === STATUS_POISON,
      ),
    ).toBe(true);
  });

  it("burn ticks for 1/16 maxHp end of turn and halves the burned crew's atk", () => {
    const burned = crew({
      spd: 90,
      moves: [tackle],
      statuses: [STATUS_BURN],
    });
    const state = initialState({
      activeA: burned,
      activeB: crew({ spd: 10, moves: [tackle] }),
      benchB: [crew(), crew()],
    });
    const next = resolveTurn(state, move("tackle"), swap(0), constantRng(0.5));
    const aMove = next.log.find((e) => e.kind === "move" && e.side === "A");
    expect(aMove?.kind === "move" && aMove.damage).toBeLessThan(15);
    expect(next.activeA.hp).toBe(100 - Math.floor(100 / 16));
  });

  it("stun has a chance to skip the turn", () => {
    const stunned = crew({
      spd: 90,
      moves: [tackle],
      statuses: [STATUS_STUN],
    });
    const state = initialState({
      activeA: stunned,
      activeB: crew({ spd: 10, moves: [tackle] }),
    });
    const next = resolveTurn(
      state,
      move("tackle"),
      move("tackle"),
      scriptedRng([0.0, 0.5, 0.5, 0.5]),
    );
    expect(next.log.some((e) => e.kind === "stun_skip" && e.side === "A")).toBe(
      true,
    );
    expect(next.activeB.hp).toBe(100);
  });

  it("status tick can faint a crew and prompt a swap", () => {
    const lowHpPoisoned = crew({
      spd: 90,
      hp: 5,
      moves: [tackle],
      statuses: [STATUS_POISON],
    });
    const state = initialState({
      activeA: lowHpPoisoned,
      activeB: crew({ spd: 10, moves: [tackle] }),
      benchB: [crew(), crew()],
    });
    const next = resolveTurn(state, move("tackle"), swap(0), constantRng(0.5));
    expect(next.activeA.hp).toBe(0);
    expect(next.pendingSwapA).toBe(true);
    const tickIdx = next.log.findIndex(
      (e) => e.kind === "status_tick" && e.side === "A",
    );
    const faintIdx = next.log.findIndex(
      (e) => e.kind === "faint" && e.side === "A",
    );
    expect(tickIdx).toBeGreaterThanOrEqual(0);
    expect(faintIdx).toBeGreaterThan(tickIdx);
  });
});
