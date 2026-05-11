import type { BattleEvent, BattleState, CrewSnapshot, MoveDef, Side } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import { computeCrewStats, computeUserStats, type FinishedBattleStats } from "./statsAggregator.js";

const move: MoveDef = {
  key: "tackle",
  name: "Tackle",
  affinity: "kraken",
  basePower: 30,
  accuracy: 100,
  kind: "damage",
};

function crew(templateKey: string, hp = 100): CrewSnapshot {
  return {
    templateKey,
    hp,
    maxHp: 100,
    atk: 50,
    def: 50,
    spd: 50,
    level: 5,
    affinity: "kraken",
    statuses: [],
    moves: [move],
  };
}

function state(opts: {
  winner: Side | null;
  turn?: number;
  teamA: CrewSnapshot[];
  teamB: CrewSnapshot[];
  log?: BattleEvent[];
}): BattleState {
  const [activeA, ...benchA] = opts.teamA;
  const [activeB, ...benchB] = opts.teamB;
  if (!activeA || !activeB) throw new Error("teams must be non-empty");
  return {
    turn: opts.turn ?? 5,
    activeA,
    activeB,
    benchA,
    benchB,
    log: opts.log ?? [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: opts.winner,
  };
}

function battle(opts: {
  winner: Side | null;
  userSide: Side;
  turn?: number;
  teamA: CrewSnapshot[];
  teamB: CrewSnapshot[];
  events?: BattleEvent[];
}): FinishedBattleStats {
  return {
    state: state({
      winner: opts.winner,
      turn: opts.turn,
      teamA: opts.teamA,
      teamB: opts.teamB,
      log: opts.events ?? [],
    }),
    userSide: opts.userSide,
    events: opts.events ?? [],
  };
}

describe("computeUserStats", () => {
  it("returns zeroes when no battles", () => {
    expect(computeUserStats([])).toEqual({
      totalBattles: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgTurns: 0,
    });
  });

  it("counts wins and losses by user side", () => {
    const battles: FinishedBattleStats[] = [
      battle({
        winner: "A",
        userSide: "A",
        turn: 4,
        teamA: [crew("t1")],
        teamB: [crew("e1")],
      }),
      battle({
        winner: "B",
        userSide: "A",
        turn: 8,
        teamA: [crew("t1")],
        teamB: [crew("e1")],
      }),
      battle({
        winner: "A",
        userSide: "B",
        turn: 6,
        teamA: [crew("t1")],
        teamB: [crew("e1")],
      }),
    ];
    const stats = computeUserStats(battles);
    expect(stats.totalBattles).toBe(3);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBeCloseTo(1 / 3, 6);
    expect(stats.avgTurns).toBeCloseTo(6, 6);
  });

  it("skips unfinished battles", () => {
    const battles: FinishedBattleStats[] = [
      battle({
        winner: null,
        userSide: "A",
        teamA: [crew("t1")],
        teamB: [crew("e1")],
      }),
      battle({
        winner: "A",
        userSide: "A",
        teamA: [crew("t1")],
        teamB: [crew("e1")],
      }),
    ];
    const stats = computeUserStats(battles);
    expect(stats.totalBattles).toBe(1);
    expect(stats.wins).toBe(1);
  });
});

describe("computeCrewStats", () => {
  it("returns all-zero stats for a templateKey not on any team", () => {
    const battles: FinishedBattleStats[] = [
      battle({
        winner: "A",
        userSide: "A",
        teamA: [crew("other")],
        teamB: [crew("e1")],
      }),
    ];
    const stats = computeCrewStats(battles, "ghost");
    expect(stats).toEqual({
      templateKey: "ghost",
      participated: 0,
      wins: 0,
      losses: 0,
      finishingBlows: 0,
      deaths: 0,
      teamKills: 0,
      teamDeaths: 0,
    });
  });

  it("counts participation, wins, losses, finishing blows", () => {
    const battles: FinishedBattleStats[] = [
      battle({
        winner: "A",
        userSide: "A",
        teamA: [crew("hero"), crew("ally")],
        teamB: [crew("foe", 0)],
      }),
      battle({
        winner: "A",
        userSide: "A",
        teamA: [crew("ally"), crew("hero")],
        teamB: [crew("foe", 0)],
      }),
      battle({
        winner: "B",
        userSide: "A",
        teamA: [crew("hero", 0), crew("ally", 0)],
        teamB: [crew("foe")],
      }),
    ];
    const stats = computeCrewStats(battles, "hero");
    expect(stats.participated).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.finishingBlows).toBe(1);
    expect(stats.deaths).toBe(1);
  });

  it("attributes finishing blow only on user-side win", () => {
    const battles: FinishedBattleStats[] = [
      battle({
        winner: "B",
        userSide: "A",
        teamA: [crew("hero", 0)],
        teamB: [crew("foe")],
      }),
    ];
    const stats = computeCrewStats(battles, "hero");
    expect(stats.finishingBlows).toBe(0);
    expect(stats.deaths).toBe(1);
  });

  it("aggregates teamKills and teamDeaths from faint events", () => {
    const events: BattleEvent[] = [
      { kind: "faint", side: "B" },
      { kind: "faint", side: "B" },
      { kind: "faint", side: "A" },
    ];
    const battles: FinishedBattleStats[] = [
      battle({
        winner: "A",
        userSide: "A",
        teamA: [crew("hero")],
        teamB: [crew("foe", 0), crew("foe2", 0)],
        events,
      }),
    ];
    const stats = computeCrewStats(battles, "hero");
    expect(stats.teamKills).toBe(2);
    expect(stats.teamDeaths).toBe(1);
  });

  it("respects user side when classifying kill vs death events", () => {
    const events: BattleEvent[] = [
      { kind: "faint", side: "A" },
      { kind: "faint", side: "B" },
    ];
    const battles: FinishedBattleStats[] = [
      battle({
        winner: "B",
        userSide: "B",
        teamA: [crew("foe", 0)],
        teamB: [crew("hero")],
        events,
      }),
    ];
    const stats = computeCrewStats(battles, "hero");
    expect(stats.teamKills).toBe(1);
    expect(stats.teamDeaths).toBe(1);
    expect(stats.finishingBlows).toBe(1);
  });

  it("skips unfinished battles entirely", () => {
    const battles: FinishedBattleStats[] = [
      battle({
        winner: null,
        userSide: "A",
        teamA: [crew("hero")],
        teamB: [crew("foe")],
        events: [{ kind: "faint", side: "B" }],
      }),
    ];
    const stats = computeCrewStats(battles, "hero");
    expect(stats.participated).toBe(0);
    expect(stats.teamKills).toBe(0);
  });
});
