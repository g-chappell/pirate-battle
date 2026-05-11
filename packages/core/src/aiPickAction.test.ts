import { describe, expect, it } from "vitest";

import { aiPickAction } from "./aiPickAction.js";
import type { BattleState, CrewSnapshot, MoveDef } from "./types.js";

const krakenWeakStrong: MoveDef = {
  key: "kraken_strong",
  name: "Kraken Strong",
  affinity: "kraken",
  basePower: 60,
  accuracy: 100,
  kind: "damage",
};

const ironcladNeutral: MoveDef = {
  key: "iron_neutral",
  name: "Iron Neutral",
  affinity: "ironclad",
  basePower: 80,
  accuracy: 100,
  kind: "damage",
};

const phantomWeakHit: MoveDef = {
  key: "phantom_weak",
  name: "Phantom Weak",
  affinity: "phantom",
  basePower: 70,
  accuracy: 100,
  kind: "damage",
};

const inaccuratePower: MoveDef = {
  key: "inaccurate",
  name: "Inaccurate Smash",
  affinity: "ironclad",
  basePower: 200,
  accuracy: 10,
  kind: "damage",
};

const buffOnly: MoveDef = {
  key: "buff",
  name: "Buff",
  affinity: "kraken",
  basePower: 0,
  accuracy: 100,
  kind: "buff",
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
    moves: [krakenWeakStrong],
    ...overrides,
  };
}

function state(overrides: Partial<BattleState> = {}): BattleState {
  return {
    turn: 0,
    activeA: crew(),
    activeB: crew({ affinity: "ironclad" }),
    benchA: [crew(), crew()],
    benchB: [crew({ affinity: "ironclad" }), crew({ affinity: "ironclad" })],
    log: [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
    ...overrides,
  };
}

describe("aiPickAction", () => {
  it("picks the move with highest expected damage given affinity", () => {
    // B is ironclad. A is kraken. kraken→ironclad is super effective (x2).
    // So a 60-power kraken move beats an 80-power neutral ironclad move.
    const s = state({
      activeA: crew({
        affinity: "kraken",
        moves: [ironcladNeutral, krakenWeakStrong],
      }),
      activeB: crew({ affinity: "ironclad" }),
    });
    const action = aiPickAction(s, "A");
    expect(action).toEqual({ type: "move", moveKey: "kraken_strong" });
  });

  it("weights expected damage by accuracy", () => {
    // 200 power * 10% accuracy = 20 expected. 60 * 2 (super eff) * 1.0 = 120.
    const s = state({
      activeA: crew({
        affinity: "kraken",
        moves: [inaccuratePower, krakenWeakStrong],
      }),
      activeB: crew({ affinity: "ironclad" }),
    });
    const action = aiPickAction(s, "A");
    expect(action).toEqual({ type: "move", moveKey: "kraken_strong" });
  });

  it("ignores buff/status moves with zero base power", () => {
    const s = state({
      activeA: crew({
        affinity: "kraken",
        moves: [buffOnly, phantomWeakHit],
      }),
      activeB: crew({ affinity: "kraken" }),
    });
    const action = aiPickAction(s, "A");
    expect(action).toEqual({ type: "move", moveKey: "phantom_weak" });
  });

  it("returns first move when all expected damages are zero", () => {
    const s = state({
      activeA: crew({ moves: [buffOnly] }),
    });
    const action = aiPickAction(s, "A");
    expect(action).toEqual({ type: "move", moveKey: "buff" });
  });

  it("switches to first healthy bench crew when pendingSwap", () => {
    const s = state({
      pendingSwapB: true,
      benchB: [
        crew({ hp: 0, affinity: "ironclad" }),
        crew({ hp: 50, affinity: "ironclad" }),
        crew({ hp: 100, affinity: "ironclad" }),
      ],
    });
    const action = aiPickAction(s, "B");
    expect(action).toEqual({ type: "switch", targetIndex: 1 });
  });

  it("forfeits when pendingSwap and the entire bench is fainted", () => {
    const s = state({
      pendingSwapB: true,
      benchB: [crew({ hp: 0 }), crew({ hp: 0 }), crew({ hp: 0 })],
    });
    const action = aiPickAction(s, "B");
    expect(action).toEqual({ type: "forfeit" });
  });

  it("switches when active is already fainted even without pendingSwap flag", () => {
    const s = state({
      activeB: crew({ hp: 0, affinity: "ironclad" }),
      benchB: [crew({ hp: 80, affinity: "ironclad" })],
    });
    const action = aiPickAction(s, "B");
    expect(action).toEqual({ type: "switch", targetIndex: 0 });
  });

  it("evaluates moves from the side it is asked to act for", () => {
    const s = state({
      activeA: crew({
        affinity: "kraken",
        moves: [phantomWeakHit, krakenWeakStrong],
      }),
      activeB: crew({
        affinity: "ironclad",
        moves: [phantomWeakHit, krakenWeakStrong],
      }),
    });
    // A is kraken vs ironclad B → kraken super effective.
    const aAction = aiPickAction(s, "A");
    expect(aAction).toEqual({ type: "move", moveKey: "kraken_strong" });
    // B is ironclad vs kraken A → phantom is neutral, kraken is neutral too.
    // phantomWeakHit basePower 70 > kraken 60 so phantom wins on raw power.
    const bAction = aiPickAction(s, "B");
    expect(bAction).toEqual({ type: "move", moveKey: "phantom_weak" });
  });
});
