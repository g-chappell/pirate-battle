import type { BattleState, CrewSnapshot, MoveDef } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import {
  benchOptionsFor,
  buildForfeitAction,
  buildMoveAction,
  buildSwitchAction,
  canSwapTo,
  describeBattleEvent,
  isViewersTurn,
  moveOptionsFor,
  turnLogLines,
} from "./battleView";

const TIDE_SURGE: MoveDef = {
  key: "tide-surge",
  name: "Tide Surge",
  affinity: "kraken",
  basePower: 60,
  accuracy: 95,
  kind: "damage",
};

const INK_CLOUD: MoveDef = {
  key: "ink-cloud",
  name: "Ink Cloud",
  affinity: "kraken",
  basePower: 0,
  accuracy: 100,
  kind: "status",
  statusEffect: "burn",
};

function makeCrew(over: Partial<CrewSnapshot> = {}): CrewSnapshot {
  return {
    templateKey: "test_crew",
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 50,
    spd: 50,
    level: 5,
    affinity: "kraken",
    statuses: [],
    moves: [TIDE_SURGE, INK_CLOUD],
    ...over,
  };
}

function makeState(over: Partial<BattleState> = {}): BattleState {
  return {
    turn: 1,
    activeA: makeCrew(),
    activeB: makeCrew({ affinity: "ironclad" }),
    benchA: [makeCrew({ affinity: "phantom" }), makeCrew({ hp: 0 })],
    benchB: [makeCrew({ affinity: "bloodborne" })],
    log: [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
    ...over,
  };
}

describe("isViewersTurn", () => {
  it("is false once a winner is set", () => {
    expect(isViewersTurn(makeState({ winner: "A" }), "A")).toBe(false);
  });

  it("is true when the viewer must resolve a swap", () => {
    expect(isViewersTurn(makeState({ pendingSwapA: true }), "A")).toBe(true);
  });

  it("is false when the other side has a pending swap", () => {
    expect(isViewersTurn(makeState({ pendingSwapB: true }), "A")).toBe(false);
  });

  it("is true on a normal turn", () => {
    expect(isViewersTurn(makeState(), "A")).toBe(true);
  });
});

describe("moveOptionsFor", () => {
  it("returns no move options while a swap is pending for the viewer", () => {
    expect(moveOptionsFor(makeState({ pendingSwapA: true }), "A")).toEqual([]);
  });

  it("returns the active crew's moves on a normal turn", () => {
    const opts = moveOptionsFor(makeState(), "A");
    expect(opts.map((o) => o.key)).toEqual(["tide-surge", "ink-cloud"]);
  });
});

describe("benchOptionsFor", () => {
  it("flags fainted bench members as unswappable", () => {
    const opts = benchOptionsFor(makeState(), "A");
    expect(opts).toHaveLength(2);
    expect(opts[0]!.fainted).toBe(false);
    expect(opts[1]!.fainted).toBe(true);
    expect(canSwapTo(opts[0]!)).toBe(true);
    expect(canSwapTo(opts[1]!)).toBe(false);
  });
});

describe("action builders", () => {
  it("build move/switch/forfeit actions", () => {
    expect(buildMoveAction("tide-surge")).toEqual({
      type: "move",
      moveKey: "tide-surge",
    });
    expect(buildSwitchAction(1)).toEqual({ type: "switch", targetIndex: 1 });
    expect(buildForfeitAction()).toEqual({ type: "forfeit" });
  });
});

describe("describeBattleEvent / turnLogLines", () => {
  it("describes each event kind in human-readable form", () => {
    expect(
      describeBattleEvent({
        kind: "move",
        side: "A",
        moveKey: "tide-surge",
        damage: 24,
        targetHpAfter: 76,
        crit: true,
        effective: 2,
      }),
    ).toMatch(/Side A used tide-surge.*crit.*24 dmg.*×2/);

    expect(describeBattleEvent({ kind: "miss", side: "B", moveKey: "ink-cloud" })).toBe(
      "Side B's ink-cloud missed",
    );

    expect(describeBattleEvent({ kind: "victory", side: "A" })).toBe("Side A wins the battle");
  });

  it("lifts every log entry into a description string", () => {
    const lines = turnLogLines(
      makeState({
        log: [
          { kind: "switch", side: "A", toIndex: 0 },
          { kind: "faint", side: "B" },
        ],
      }),
    );
    expect(lines).toEqual(["Side A switched to bench slot 0", "Side B's active crew fainted"]);
  });
});
