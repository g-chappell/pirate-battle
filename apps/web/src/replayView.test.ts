import { resolveTurn, createRng } from "@pirate-battle/core";
import type { Action, BattleState, CrewSnapshot, MoveDef } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import {
  buildReplayTimeline,
  clampCursor,
  cursorInfo,
  nextCursor,
  prevCursor,
  stateAtReplayCursor,
} from "./replayView";

const tackle: MoveDef = {
  key: "tackle",
  name: "Tackle",
  affinity: "kraken",
  basePower: 30,
  accuracy: 100,
  kind: "damage",
};

function crew(overrides: Partial<CrewSnapshot> = {}): CrewSnapshot {
  return {
    templateKey: "t",
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

function buildFinishedBattle(): BattleState {
  let state: BattleState = {
    turn: 0,
    activeA: crew({ templateKey: "a0", spd: 60 }),
    activeB: crew({ templateKey: "b0", spd: 40 }),
    benchA: [crew({ templateKey: "a1" })],
    benchB: [crew({ templateKey: "b1" })],
    log: [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
  };
  const rng = createRng(1);
  const action: Action = { type: "move", moveKey: "tackle" };
  for (let i = 0; i < 3; i++) {
    state = resolveTurn(state, action, action, rng);
  }
  return state;
}

describe("replayView", () => {
  it("buildReplayTimeline produces an initial state with empty log and reset HP", () => {
    const final = buildFinishedBattle();
    const timeline = buildReplayTimeline(final);
    expect(timeline.initial.log).toEqual([]);
    expect(timeline.initial.activeA.hp).toBe(timeline.initial.activeA.maxHp);
    expect(timeline.initial.activeB.hp).toBe(timeline.initial.activeB.maxHp);
    expect(timeline.events).toEqual(final.log);
  });

  it("clampCursor handles out-of-range and non-finite values", () => {
    expect(clampCursor(-5, 10)).toBe(0);
    expect(clampCursor(99, 10)).toBe(10);
    expect(clampCursor(4.7, 10)).toBe(4);
    expect(clampCursor(Number.NaN, 10)).toBe(0);
  });

  it("stateAtReplayCursor returns initial at cursor 0 and final at cursor=events.length", () => {
    const final = buildFinishedBattle();
    const timeline = buildReplayTimeline(final);
    const start = stateAtReplayCursor(timeline, 0);
    expect(start.log).toEqual([]);
    expect(start.activeA.hp).toBe(start.activeA.maxHp);

    const end = stateAtReplayCursor(timeline, timeline.events.length);
    expect(end.activeA.hp).toBe(final.activeA.hp);
    expect(end.activeB.hp).toBe(final.activeB.hp);
    expect(end.winner).toBe(final.winner);
  });

  it("cursorInfo flags atStart/atEnd and describes the current event", () => {
    const final = buildFinishedBattle();
    const timeline = buildReplayTimeline(final);

    const start = cursorInfo(timeline, 0);
    expect(start.atStart).toBe(true);
    expect(start.atEnd).toBe(false);
    expect(start.currentEvent).toBeNull();
    expect(start.currentEventDescription).toMatch(/Battle start/);

    const end = cursorInfo(timeline, timeline.events.length);
    expect(end.atStart).toBe(false);
    expect(end.atEnd).toBe(true);
    expect(end.currentEvent).toBe(timeline.events[timeline.events.length - 1]);

    const mid = cursorInfo(timeline, 1);
    expect(mid.atStart).toBe(false);
    expect(mid.atEnd).toBe(false);
    expect(mid.currentEvent).toBe(timeline.events[0]);
  });

  it("nextCursor and prevCursor stay clamped", () => {
    expect(nextCursor(0, 5)).toBe(1);
    expect(nextCursor(5, 5)).toBe(5);
    expect(prevCursor(0, 5)).toBe(0);
    expect(prevCursor(3, 5)).toBe(2);
  });

  it("scrubbing forward then back yields identical state at the same cursor", () => {
    const final = buildFinishedBattle();
    const timeline = buildReplayTimeline(final);
    const target = Math.floor(timeline.events.length / 2);
    const a = stateAtReplayCursor(timeline, target);
    let b = stateAtReplayCursor(timeline, 0);
    b = stateAtReplayCursor(timeline, timeline.events.length);
    b = stateAtReplayCursor(timeline, target);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
