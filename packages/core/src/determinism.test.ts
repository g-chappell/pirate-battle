import { describe, expect, it } from "vitest";

import { STATUS_POISON } from "./constants.js";
import { resolveTurn } from "./engine.js";
import { createRng } from "./rng.js";
import type { Action, BattleState, CrewSnapshot, MoveDef } from "./types.js";

const RUNS = 100;
const SEED = 0xc0ffee;

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
  affinity: "kraken",
  basePower: 60,
  accuracy: 100,
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
    templateKey: "test_crew",
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 50,
    spd: 50,
    level: 50,
    affinity: "kraken",
    statuses: [],
    moves: [tackle, heavyHit, venomFangs],
    ...overrides,
  };
}

const moveAction = (key: string): Action => ({ type: "move", moveKey: key });
const swapAction = (i: number): Action => ({ type: "switch", targetIndex: i });

function makeState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    turn: 0,
    activeA: crew({ spd: 60 }),
    activeB: crew({ spd: 40 }),
    benchA: [crew(), crew()],
    benchB: [crew(), crew()],
    log: [],
    rngSeed: SEED,
    rngState: SEED,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
    ...overrides,
  };
}

function runBattle(
  build: () => BattleState,
  actions: Array<[Action, Action]>,
  seed: number,
): BattleState {
  let state = build();
  const rng = createRng(seed);
  for (const [a, b] of actions) {
    if (state.winner !== null) break;
    state = resolveTurn(state, a, b, rng);
  }
  return state;
}

function expectByteEqualAcrossRuns(
  build: () => BattleState,
  actions: Array<[Action, Action]>,
  seed: number,
): BattleState {
  const baseline = runBattle(build, actions, seed);
  const baselineJson = JSON.stringify(baseline);
  for (let i = 1; i < RUNS; i++) {
    const replay = JSON.stringify(runBattle(build, actions, seed));
    expect(replay).toBe(baselineJson);
  }
  return baseline;
}

describe("engine determinism — same seed + actions produces byte-equal logs across 100 runs", () => {
  it("simple damage exchange — five turns of mutual tackles", () => {
    const build = () => makeState();
    const actions: Array<[Action, Action]> = [
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
    ];
    const final = expectByteEqualAcrossRuns(build, actions, SEED);
    expect(final.turn).toBe(actions.length);
    expect(final.winner).toBeNull();
    expect(final.activeA.hp).toBeLessThan(100);
    expect(final.activeB.hp).toBeLessThan(100);
    expect(final.log.filter((e) => e.kind === "move").length).toBe(actions.length * 2);
  });

  it("status proc on right turn — poison applied turn 1, ticks every subsequent turn", () => {
    const build = () =>
      makeState({
        activeA: crew({ spd: 90 }),
        activeB: crew({ spd: 10 }),
      });
    const actions: Array<[Action, Action]> = [
      [moveAction("venom"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
    ];
    const final = expectByteEqualAcrossRuns(build, actions, SEED);
    expect(final.activeB.statuses).toContain(STATUS_POISON);
    const ticks = final.log.filter(
      (e) => e.kind === "status_tick" && e.side === "B" && e.status === STATUS_POISON,
    );
    expect(ticks.length).toBe(actions.length);
    const applies = final.log.filter(
      (e) => e.kind === "status_apply" && e.side === "B" && e.status === STATUS_POISON,
    );
    expect(applies.length).toBe(1);
  });

  it("faint + swap-in — KO triggers pendingSwap, then opponent swaps and battle continues", () => {
    const build = () =>
      makeState({
        activeA: crew({ spd: 90, atk: 80 }),
        activeB: crew({ spd: 10, hp: 8, def: 30 }),
        benchA: [crew(), crew()],
        benchB: [crew({ spd: 50, hp: 80 }), crew()],
      });
    const actions: Array<[Action, Action]> = [
      [moveAction("heavy"), moveAction("tackle")],
      [moveAction("tackle"), swapAction(0)],
      [moveAction("tackle"), moveAction("tackle")],
    ];
    const final = expectByteEqualAcrossRuns(build, actions, SEED);
    expect(final.log.some((e) => e.kind === "faint" && e.side === "B")).toBe(true);
    expect(final.log.some((e) => e.kind === "swap_required" && e.side === "B")).toBe(true);
    expect(final.log.some((e) => e.kind === "switch" && e.side === "B")).toBe(true);
    expect(final.winner).toBeNull();
    expect(final.pendingSwapB).toBe(false);
  });

  it("side-victory — last opposing crew faints, victory event closes the battle", () => {
    const build = () =>
      makeState({
        activeA: crew({ spd: 90, atk: 100 }),
        activeB: crew({ spd: 10, hp: 5, def: 10 }),
        benchA: [crew(), crew()],
        benchB: [crew({ hp: 0 }), crew({ hp: 0 })],
      });
    const actions: Array<[Action, Action]> = [[moveAction("heavy"), moveAction("tackle")]];
    const final = expectByteEqualAcrossRuns(build, actions, SEED);
    expect(final.winner).toBe("A");
    expect(final.log.some((e) => e.kind === "victory" && e.side === "A")).toBe(true);
    expect(final.log.some((e) => e.kind === "swap_required")).toBe(false);
  });
});
