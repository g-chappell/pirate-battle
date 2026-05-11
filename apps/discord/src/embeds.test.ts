import type { BattleEvent, BattleState, CrewSnapshot, MoveDef } from "@pirate-battle/core";
import { createRng, resolveTurn } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import {
  affinityEmoji,
  buildBattleStartEmbed,
  buildCaptainListEmbed,
  buildStatsEmbed,
  buildTeamEmbed,
  formatEffectiveness,
  renderBattleEmbed,
  splitLogIntoTurns,
} from "./embeds.js";
import type { CaptainTeam, StatsResponse } from "./serverClient.js";

function makeTeam(overrides?: Partial<CaptainTeam>): CaptainTeam {
  return {
    id: "cap-1",
    name: "Bonny",
    factionId: "kraken",
    crews: [
      {
        id: "crew-1",
        templateKey: "tide_brawler",
        moveKeys: ["tide_surge", "tentacle_lash"],
        level: 7,
        xp: 0,
        attrs: null,
      },
      {
        id: "crew-2",
        templateKey: "deep_warden",
        moveKeys: ["maelstrom"],
        level: 6,
        xp: 0,
        attrs: null,
      },
    ],
    ...overrides,
  };
}

describe("buildTeamEmbed", () => {
  it("uses the captain name in the title", () => {
    const embed = buildTeamEmbed(makeTeam());
    expect(embed.title).toBe("Captain Bonny");
  });

  it("renders each crew as a field with display name + level", () => {
    const embed = buildTeamEmbed(makeTeam());
    expect(embed.fields).toHaveLength(2);
    expect(embed.fields?.[0]?.name).toContain("Tide Brawler");
    expect(embed.fields?.[0]?.name).toContain("Lv 7");
  });

  it("formats moves as display names, not template keys", () => {
    const embed = buildTeamEmbed(makeTeam());
    const movesField = embed.fields?.[0]?.value ?? "";
    expect(movesField).toContain("Tide Surge");
    expect(movesField).toContain("Tentacle Lash");
    expect(movesField).not.toContain("tide_surge");
  });

  it("shows a placeholder when a crew has no moves", () => {
    const team = makeTeam({
      crews: [
        {
          id: "c",
          templateKey: "tide_brawler",
          moveKeys: [],
          level: 1,
          xp: 0,
          attrs: null,
        },
      ],
    });
    const embed = buildTeamEmbed(team);
    expect(embed.fields?.[0]?.value).toContain("No moves assigned");
  });
});

describe("buildCaptainListEmbed", () => {
  it("includes guidance when the user has no captains", () => {
    const embed = buildCaptainListEmbed([]);
    expect(embed.title).toBe("No captains yet");
    expect(embed.description ?? "").toMatch(/web/i);
  });

  it("lists captains as fields", () => {
    const embed = buildCaptainListEmbed([
      { id: "c1", name: "Bonny", factionId: "kraken" },
      { id: "c2", name: "Mary", factionId: "wraith" },
    ]);
    expect(embed.fields?.map((f) => f.name)).toEqual(["Bonny", "Mary"]);
  });
});

describe("buildBattleStartEmbed", () => {
  function makeState(): BattleState {
    return {
      turn: 0,
      activeA: {
        templateKey: "tide_brawler",
        hp: 80,
        maxHp: 100,
        atk: 50,
        def: 50,
        spd: 50,
        level: 5,
        affinity: "kraken",
        statuses: [],
        moves: [],
      },
      activeB: {
        templateKey: "deep_warden",
        hp: 95,
        maxHp: 100,
        atk: 40,
        def: 70,
        spd: 30,
        level: 5,
        affinity: "kraken",
        statuses: [],
        moves: [],
      },
      benchA: [],
      benchB: [],
      log: [],
      rngSeed: 1,
      rngState: 1,
      pendingSwapA: false,
      pendingSwapB: false,
      winner: null,
    };
  }

  it("titles the embed with the captain name + AI opponent", () => {
    const embed = buildBattleStartEmbed({
      captainName: "Bonny",
      state: makeState(),
      battleId: "b-1",
    });
    expect(embed.title).toContain("Bonny");
    expect(embed.title).toContain("AI");
  });

  it("renders HP for both active crews", () => {
    const embed = buildBattleStartEmbed({
      captainName: "Bonny",
      state: makeState(),
      battleId: "b-1",
    });
    const fields = embed.fields ?? [];
    const yourActive = fields.find((f) => f.name === "Your active");
    const opponentActive = fields.find((f) => f.name === "Opponent active");
    expect(yourActive?.value).toContain("80/100");
    expect(opponentActive?.value).toContain("95/100");
  });

  it("includes the battle id in the description", () => {
    const embed = buildBattleStartEmbed({
      captainName: "Bonny",
      state: makeState(),
      battleId: "b-1",
    });
    expect(embed.description ?? "").toContain("b-1");
  });
});

describe("buildStatsEmbed", () => {
  function makeStats(overrides: Partial<StatsResponse["user"]> = {}): StatsResponse {
    return {
      user: {
        totalBattles: 4,
        wins: 3,
        losses: 1,
        winRate: 0.75,
        avgTurns: 5.5,
        ...overrides,
      },
      discordUserId: "9999",
    };
  }

  it("titles 'Your record' when called with isSelf", () => {
    const embed = buildStatsEmbed(makeStats(), { isSelf: true });
    expect(embed.title).toBe("Your record");
  });

  it("mentions the target user when not self", () => {
    const embed = buildStatsEmbed(makeStats(), { isSelf: false });
    expect(embed.title).toContain("<@9999>");
  });

  it("renders wins/losses/win-rate fields", () => {
    const embed = buildStatsEmbed(makeStats(), { isSelf: true });
    const fieldNames = (embed.fields ?? []).map((f) => f.name);
    expect(fieldNames).toEqual(
      expect.arrayContaining(["Total battles", "Wins", "Losses", "Win rate", "Avg turns"]),
    );
  });

  it("returns guidance copy when the user has zero battles", () => {
    const embed = buildStatsEmbed(
      makeStats({ totalBattles: 0, wins: 0, losses: 0, winRate: 0, avgTurns: 0 }),
      { isSelf: true },
    );
    expect(embed.fields).toBeUndefined();
    expect(embed.description ?? "").toMatch(/No finished battles/i);
  });
});

describe("affinityEmoji", () => {
  it("maps each affinity to a distinct emoji", () => {
    const all = [
      affinityEmoji("kraken"),
      affinityEmoji("ironclad"),
      affinityEmoji("phantom"),
      affinityEmoji("bloodborne"),
    ];
    expect(new Set(all).size).toBe(4);
  });
});

describe("formatEffectiveness", () => {
  it("flags super-effective when multiplier > 1", () => {
    expect(formatEffectiveness(2)).toBe("super effective!");
  });
  it("returns null on a neutral multiplier", () => {
    expect(formatEffectiveness(1)).toBeNull();
  });
});

const tackle: MoveDef = {
  key: "tackle",
  name: "Tackle",
  affinity: "kraken",
  basePower: 30,
  accuracy: 100,
  kind: "damage",
};

function battleCrew(overrides: Partial<CrewSnapshot> = {}): CrewSnapshot {
  return {
    templateKey: "tide_brawler",
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 50,
    spd: 50,
    level: 5,
    affinity: "kraken",
    statuses: [],
    moves: [tackle],
    ...overrides,
  };
}

function initialBattleState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    turn: 0,
    activeA: battleCrew({ spd: 60 }),
    activeB: battleCrew({ spd: 40, affinity: "ironclad" }),
    benchA: [battleCrew(), battleCrew()],
    benchB: [battleCrew({ affinity: "ironclad" }), battleCrew({ affinity: "ironclad" })],
    log: [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
    ...overrides,
  };
}

describe("splitLogIntoTurns", () => {
  it("returns no chunks for an empty log", () => {
    expect(splitLogIntoTurns([])).toEqual([]);
  });

  it("splits at the boundary where a side acts twice", () => {
    const log: BattleEvent[] = [
      {
        kind: "move",
        side: "A",
        moveKey: "tackle",
        damage: 10,
        targetHpAfter: 90,
        crit: false,
        effective: 1,
      },
      {
        kind: "move",
        side: "B",
        moveKey: "tackle",
        damage: 8,
        targetHpAfter: 92,
        crit: false,
        effective: 1,
      },
      {
        kind: "move",
        side: "A",
        moveKey: "tackle",
        damage: 10,
        targetHpAfter: 80,
        crit: false,
        effective: 1,
      },
      {
        kind: "move",
        side: "B",
        moveKey: "tackle",
        damage: 8,
        targetHpAfter: 84,
        crit: false,
        effective: 1,
      },
    ];
    const turns = splitLogIntoTurns(log);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveLength(2);
    expect(turns[1]).toHaveLength(2);
  });

  it("ends a chunk on victory", () => {
    const log: BattleEvent[] = [
      {
        kind: "move",
        side: "A",
        moveKey: "tackle",
        damage: 10,
        targetHpAfter: 0,
        crit: false,
        effective: 1,
      },
      { kind: "faint", side: "B" },
      { kind: "victory", side: "A" },
    ];
    const turns = splitLogIntoTurns(log);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.at(-1)?.kind).toBe("victory");
  });

  it("ends a chunk after a swap_required so the next switch starts a new turn", () => {
    const log: BattleEvent[] = [
      {
        kind: "move",
        side: "A",
        moveKey: "tackle",
        damage: 10,
        targetHpAfter: 0,
        crit: false,
        effective: 1,
      },
      { kind: "faint", side: "B" },
      { kind: "swap_required", side: "B" },
      { kind: "switch", side: "B", toIndex: 0 },
      {
        kind: "move",
        side: "A",
        moveKey: "tackle",
        damage: 10,
        targetHpAfter: 90,
        crit: false,
        effective: 1,
      },
    ];
    const turns = splitLogIntoTurns(log);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.map((e) => e.kind)).toEqual(["move", "faint", "swap_required"]);
    expect(turns[1]?.map((e) => e.kind)).toEqual(["switch", "move"]);
  });

  it("attributes a status_apply event to the moving side, not the defender", () => {
    const log: BattleEvent[] = [
      { kind: "status_apply", side: "B", status: "poison" },
      {
        kind: "move",
        side: "B",
        moveKey: "tackle",
        damage: 8,
        targetHpAfter: 92,
        crit: false,
        effective: 1,
      },
      { kind: "status_apply", side: "B", status: "poison" },
    ];
    const turns = splitLogIntoTurns(log);
    expect(turns).toHaveLength(2);
  });

  it("matches state.turn for a real multi-turn engine run", () => {
    let state = initialBattleState();
    const rng = createRng(state.rngState);
    for (let i = 0; i < 4; i++) {
      state = resolveTurn(
        state,
        { type: "move", moveKey: "tackle" },
        { type: "move", moveKey: "tackle" },
        rng,
      );
    }
    expect(splitLogIntoTurns(state.log)).toHaveLength(state.turn);
  });
});

describe("renderBattleEmbed", () => {
  function withTurnEvents(): BattleState {
    let state = initialBattleState();
    const rng = createRng(state.rngState);
    state = resolveTurn(
      state,
      { type: "move", moveKey: "tackle" },
      { type: "move", moveKey: "tackle" },
      rng,
    );
    return state;
  }

  it("titles the embed by turn number when no winner", () => {
    const embed = renderBattleEmbed(withTurnEvents());
    expect(embed.data.title).toBe("⚔️ Turn 1");
  });

  it("titles the embed for victory when winner=A", () => {
    const state = initialBattleState({ winner: "A", turn: 3 });
    expect(renderBattleEmbed(state).data.title).toBe("🏆 Victory!");
  });

  it("titles the embed for defeat when winner=B", () => {
    const state = initialBattleState({ winner: "B", turn: 3 });
    expect(renderBattleEmbed(state).data.title).toBe("💀 Defeat.");
  });

  it("includes a graphical HP bar for each active crew", () => {
    const state = initialBattleState({
      activeA: battleCrew({ hp: 60, maxHp: 100 }),
      activeB: battleCrew({ hp: 30, maxHp: 100, affinity: "ironclad" }),
    });
    const fields = renderBattleEmbed(state).data.fields ?? [];
    const yourActive = fields.find((f) => f.name === "Your active")?.value ?? "";
    const opponentActive = fields.find((f) => f.name === "Opponent active")?.value ?? "";
    expect(yourActive).toMatch(/[█]+[░]+\s+60\/100/);
    expect(opponentActive).toMatch(/[█]+[░]+\s+30\/100/);
  });

  it("prefixes each active crew with its affinity emoji", () => {
    const state = initialBattleState({
      activeA: battleCrew({ affinity: "kraken" }),
      activeB: battleCrew({ affinity: "ironclad" }),
    });
    const fields = renderBattleEmbed(state).data.fields ?? [];
    const yourActive = fields.find((f) => f.name === "Your active")?.value ?? "";
    const opponentActive = fields.find((f) => f.name === "Opponent active")?.value ?? "";
    expect(yourActive.startsWith(affinityEmoji("kraken"))).toBe(true);
    expect(opponentActive.startsWith(affinityEmoji("ironclad"))).toBe(true);
  });

  it("annotates the move log with 'super effective!' when a hit had effective>1", () => {
    let state = initialBattleState();
    const rng = createRng(state.rngState);
    state = resolveTurn(
      state,
      { type: "move", moveKey: "tackle" },
      { type: "move", moveKey: "tackle" },
      rng,
    );
    const moveLog =
      renderBattleEmbed(state).data.fields?.find((f) => f.name === "Move log")?.value ?? "";
    expect(moveLog).toContain("super effective!");
  });

  it("shows up to the last 3 turn chunks in the move log", () => {
    let state = initialBattleState();
    const rng = createRng(state.rngState);
    for (let i = 0; i < 5; i++) {
      state = resolveTurn(
        state,
        { type: "move", moveKey: "tackle" },
        { type: "move", moveKey: "tackle" },
        rng,
      );
    }
    const moveLog =
      renderBattleEmbed(state).data.fields?.find((f) => f.name === "Move log")?.value ?? "";
    const turnHeaderMatches = moveLog.match(/\*\*Turn \d+\*\*/g) ?? [];
    expect(turnHeaderMatches.length).toBe(3);
    expect(moveLog).toContain("**Turn 5**");
    expect(moveLog).toContain("**Turn 4**");
    expect(moveLog).toContain("**Turn 3**");
    expect(moveLog).not.toContain("**Turn 2**");
  });

  it("is deterministic — same state in produces byte-equal embed JSON", () => {
    const state = withTurnEvents();
    const a = JSON.stringify(renderBattleEmbed(state).toJSON());
    const b = JSON.stringify(renderBattleEmbed(state).toJSON());
    expect(a).toBe(b);
  });

  it("renders a placeholder move-log when the log is empty", () => {
    const state = initialBattleState();
    const moveLog =
      renderBattleEmbed(state).data.fields?.find((f) => f.name === "Move log")?.value ?? "";
    expect(moveLog).toMatch(/no events yet/i);
  });
});
