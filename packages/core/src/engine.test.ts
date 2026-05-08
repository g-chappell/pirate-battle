import { describe, expect, it } from "vitest";
import { resolveTurn } from "./engine.js";
import { createRng } from "./rng.js";
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

function crew(overrides: Partial<CrewSnapshot> = {}): CrewSnapshot {
  return {
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 50,
    spd: 50,
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

describe("resolveTurn", () => {
  it("applies damage from move action", () => {
    const state = initialState();
    const next = resolveTurn(
      state,
      move("tackle"),
      move("tackle"),
      createRng(1),
    );
    expect(next.activeA.hp).toBe(70);
    expect(next.activeB.hp).toBe(70);
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
      createRng(1),
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
      createRng(1),
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
    const next = resolveTurn(state, swap(0), move("tackle"), createRng(1));
    expect(next.activeA.hp).toBe(70);
    expect(next.benchA[0]?.spd).toBe(80);
  });

  it("faints the target and prompts swap when bench has fighters", () => {
    const state = initialState({
      activeA: crew({ spd: 90, moves: [heavyHit] }),
      activeB: crew({ spd: 10, hp: 30, moves: [tackle] }),
    });
    const next = resolveTurn(
      state,
      move("heavy"),
      move("tackle"),
      createRng(1),
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
      activeB: crew({ spd: 10, hp: 30, moves: [tackle] }),
      benchB: [crew({ hp: 0 }), crew({ hp: 0 })],
    });
    const next = resolveTurn(
      state,
      move("heavy"),
      move("tackle"),
      createRng(1),
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
});
