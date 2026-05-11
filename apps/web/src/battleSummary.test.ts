import type { BattleState, CrewSnapshot, MoveDef } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import {
  type FinishedBattleListItem,
  formatHistoryTimestamp,
  historyModeLabel,
  historyResult,
  historyResultLabel,
  summarizeBattleResult,
} from "./battleSummary";

const MOVE: MoveDef = {
  key: "tide-surge",
  name: "Tide Surge",
  affinity: "kraken",
  basePower: 60,
  accuracy: 95,
  kind: "damage",
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
    moves: [MOVE],
    ...over,
  };
}

function makeState(over: Partial<BattleState> = {}): BattleState {
  return {
    turn: 3,
    activeA: makeCrew(),
    activeB: makeCrew({ affinity: "phantom" }),
    benchA: [makeCrew(), makeCrew({ hp: 0 })],
    benchB: [makeCrew({ hp: 0 }), makeCrew({ hp: 0 })],
    log: [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
    ...over,
  };
}

describe("summarizeBattleResult", () => {
  it("flags the viewer as the winner when state.winner matches viewer", () => {
    const state = makeState({ winner: "A" });
    const summary = summarizeBattleResult(state, "A");
    expect(summary.ended).toBe(true);
    expect(summary.viewerWon).toBe(true);
    expect(summary.winner).toBe("A");
  });

  it("flags the viewer as the loser when state.winner is the opponent", () => {
    const state = makeState({ winner: "B" });
    const summary = summarizeBattleResult(state, "A");
    expect(summary.viewerWon).toBe(false);
  });

  it("reports null viewerWon when battle has not ended", () => {
    const summary = summarizeBattleResult(makeState(), "A");
    expect(summary.ended).toBe(false);
    expect(summary.viewerWon).toBeNull();
  });

  it("counts non-fainted crews on each side from viewer's perspective", () => {
    const summary = summarizeBattleResult(makeState({ winner: "A" }), "A");
    // viewer A: active (alive), bench[0] alive, bench[1] fainted → 2
    expect(summary.viewerSurvivors).toBe(2);
    // opponent B: active (alive), bench[0] fainted, bench[1] fainted → 1
    expect(summary.opponentSurvivors).toBe(1);
  });

  it("swaps viewer/opponent when viewer is B", () => {
    const summary = summarizeBattleResult(makeState({ winner: "B" }), "B");
    expect(summary.viewerSurvivors).toBe(1);
    expect(summary.opponentSurvivors).toBe(2);
  });

  it("includes the active crew at index 0 and clamps hp at zero", () => {
    const state = makeState({ activeA: makeCrew({ hp: -10, maxHp: 100 }) });
    const summary = summarizeBattleResult(state, "A");
    expect(summary.viewerCrews[0]?.active).toBe(true);
    expect(summary.viewerCrews[0]?.hp).toBe(0);
    expect(summary.viewerCrews[0]?.fainted).toBe(true);
  });

  it("forwards the turn count from the battle state", () => {
    const summary = summarizeBattleResult(makeState({ turn: 17, winner: "A" }), "A");
    expect(summary.turnCount).toBe(17);
  });
});

describe("history list derivations", () => {
  function makeItem(over: Partial<FinishedBattleListItem> = {}): FinishedBattleListItem {
    return {
      id: "b1",
      mode: "PVE",
      userSide: "A",
      winner: "A",
      turn: 4,
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_500_000,
      ...over,
    };
  }

  it("maps winner === userSide to won", () => {
    expect(historyResult(makeItem({ winner: "A", userSide: "A" }))).toBe("won");
    expect(historyResultLabel(makeItem({ winner: "A", userSide: "A" }))).toBe("Won");
  });

  it("maps winner !== userSide to lost", () => {
    expect(historyResult(makeItem({ winner: "B", userSide: "A" }))).toBe("lost");
    expect(historyResultLabel(makeItem({ winner: "B", userSide: "A" }))).toBe("Lost");
  });

  it("maps null winner to in_progress", () => {
    expect(historyResult(makeItem({ winner: null }))).toBe("in_progress");
    expect(historyResultLabel(makeItem({ winner: null }))).toBe("In progress");
  });

  it("labels modes with human-readable strings", () => {
    expect(historyModeLabel("PVE")).toBe("vs AI");
    expect(historyModeLabel("PVP")).toBe("vs Captain");
    expect(historyModeLabel("AI")).toBe("AI replay");
    expect(historyModeLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("renders timestamps as YYYY-MM-DD HH:MM in UTC", () => {
    expect(formatHistoryTimestamp(0)).toBe("1970-01-01 00:00");
    expect(formatHistoryTimestamp(null)).toBe("—");
  });
});
