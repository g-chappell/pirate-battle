import { describe, expect, it } from "vitest";

import { STATUS_POISON } from "./constants.js";
import { resolveTurn } from "./engine.js";
import { applyBattleEvent, deriveInitialState, stateAtCursor } from "./replay.js";
import { createRng } from "./rng.js";
import type { Action, BattleState, CrewSnapshot, MoveDef } from "./types.js";

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

function makeState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    turn: 0,
    activeA: crew({ templateKey: "a0", spd: 60 }),
    activeB: crew({ templateKey: "b0", spd: 40 }),
    benchA: [crew({ templateKey: "a1" }), crew({ templateKey: "a2" })],
    benchB: [crew({ templateKey: "b1" }), crew({ templateKey: "b2" })],
    log: [],
    rngSeed: SEED,
    rngState: SEED,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
    ...overrides,
  };
}

const moveAction = (key: string): Action => ({ type: "move", moveKey: key });
const swapAction = (i: number): Action => ({ type: "switch", targetIndex: i });

function runBattle(build: () => BattleState, actions: Array<[Action, Action]>): BattleState {
  let state = build();
  const rng = createRng(SEED);
  for (const [a, b] of actions) {
    if (state.winner !== null) break;
    state = resolveTurn(state, a, b, rng);
  }
  return state;
}

function snapshotForCompare(state: BattleState): Record<string, unknown> {
  return {
    activeA: state.activeA,
    activeB: state.activeB,
    benchA: state.benchA,
    benchB: state.benchB,
    pendingSwapA: state.pendingSwapA,
    pendingSwapB: state.pendingSwapB,
    winner: state.winner,
  };
}

describe("replay — engine-produced events reconstruct intermediate and final states", () => {
  it("simple damage exchange — final state matches engine output", () => {
    const final = runBattle(makeState, [
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
    ]);
    const initial = deriveInitialState(final);
    expect(initial.activeA.templateKey).toBe(final.activeA.templateKey);
    expect(initial.activeA.hp).toBe(initial.activeA.maxHp);
    expect(initial.activeB.hp).toBe(initial.activeB.maxHp);
    expect(initial.activeA.statuses).toEqual([]);
    expect(initial.log).toEqual([]);

    const replayed = stateAtCursor(initial, final.log, final.log.length);
    expect(snapshotForCompare(replayed)).toEqual(snapshotForCompare(final));
    expect(replayed.log).toEqual(final.log);
  });

  it("status apply + ticks replay correctly", () => {
    const final = runBattle(
      () =>
        makeState({
          activeA: crew({ templateKey: "a0", spd: 90 }),
          activeB: crew({ templateKey: "b0", spd: 10 }),
        }),
      [
        [moveAction("venom"), moveAction("tackle")],
        [moveAction("tackle"), moveAction("tackle")],
        [moveAction("tackle"), moveAction("tackle")],
      ],
    );
    const initial = deriveInitialState(final);
    const replayed = stateAtCursor(initial, final.log, final.log.length);
    expect(replayed.activeB.statuses).toContain(STATUS_POISON);
    expect(snapshotForCompare(replayed)).toEqual(snapshotForCompare(final));
  });

  it("switches — bench positions track through reverse-walk and forward-replay", () => {
    const final = runBattle(
      () =>
        makeState({
          activeA: crew({ templateKey: "a0", spd: 90, atk: 80 }),
          activeB: crew({ templateKey: "b0", spd: 10, hp: 8, def: 30 }),
          benchB: [crew({ templateKey: "b1", spd: 50, hp: 80 }), crew({ templateKey: "b2" })],
        }),
      [
        [moveAction("heavy"), moveAction("tackle")],
        [moveAction("tackle"), swapAction(0)],
        [moveAction("tackle"), moveAction("tackle")],
      ],
    );
    const initial = deriveInitialState(final);
    expect(initial.activeB.templateKey).toBe("b0");
    expect(initial.benchB.map((c) => c.templateKey).sort()).toEqual(["b1", "b2"]);

    const replayed = stateAtCursor(initial, final.log, final.log.length);
    expect(snapshotForCompare(replayed)).toEqual(snapshotForCompare(final));
  });

  it("forfeit replay", () => {
    const final = runBattle(makeState, [[{ type: "forfeit" }, moveAction("tackle")]]);
    const initial = deriveInitialState(final);
    const replayed = stateAtCursor(initial, final.log, final.log.length);
    expect(replayed.winner).toBe("B");
    expect(snapshotForCompare(replayed)).toEqual(snapshotForCompare(final));
  });

  it("scrubbing — each cursor position yields a stable, derivable state", () => {
    const final = runBattle(makeState, [
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
      [moveAction("tackle"), moveAction("tackle")],
    ]);
    const initial = deriveInitialState(final);
    for (let cursor = 0; cursor <= final.log.length; cursor++) {
      const a = stateAtCursor(initial, final.log, cursor);
      const b = stateAtCursor(initial, final.log, cursor);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("applyBattleEvent — move sets defender HP to targetHpAfter", () => {
    const s = makeState({ activeB: crew({ templateKey: "b0", hp: 80 }) });
    const next = applyBattleEvent(s, {
      kind: "move",
      side: "A",
      moveKey: "tackle",
      damage: 25,
      targetHpAfter: 55,
      crit: false,
      effective: 1,
    });
    expect(next.activeB.hp).toBe(55);
    expect(next.activeA).toBe(s.activeA);
  });

  it("applyBattleEvent — status_apply adds status once", () => {
    const s = makeState();
    const e: Parameters<typeof applyBattleEvent>[1] = {
      kind: "status_apply",
      side: "B",
      status: STATUS_POISON,
    };
    const once = applyBattleEvent(s, e);
    expect(once.activeB.statuses).toEqual([STATUS_POISON]);
    const twice = applyBattleEvent(once, e);
    expect(twice.activeB.statuses).toEqual([STATUS_POISON]);
  });

  it("applyBattleEvent — switch swaps active and bench slot", () => {
    const s = makeState();
    const next = applyBattleEvent(s, { kind: "switch", side: "A", toIndex: 1 });
    expect(next.activeA.templateKey).toBe("a2");
    expect(next.benchA[1]!.templateKey).toBe("a0");
    expect(next.benchA[0]!.templateKey).toBe("a1");
  });
});
