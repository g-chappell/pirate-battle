import type { BattleState } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import {
  buildBattleStartEmbed,
  buildCaptainListEmbed,
  buildStatsEmbed,
  buildTeamEmbed,
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
