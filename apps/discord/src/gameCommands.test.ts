import type { BattleState, CrewSnapshot, MoveDef } from "@pirate-battle/core";
import { describe, expect, it, vi } from "vitest";

import {
  handleBattleCommand,
  handleForfeitCommand,
  handleLeaderboardCommand,
  handleMoveCommand,
  handleStatsCommand,
  handleSwitchCommand,
  handleTeamCommand,
} from "./gameCommands.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ENV = { serverUrl: "https://api.example" };

describe("handleTeamCommand", () => {
  it("returns the friendly not_linked message when the server reports 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { error: "not_linked" }));
    const result = await handleTeamCommand({ ...ENV, fetchImpl }, "9999");
    expect(result.content).toMatch(/\/link/);
    expect(result.embeds).toBeUndefined();
  });

  it("returns a no-captain embed when the user has no captains", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { user: { id: "u-1", stakeAddr: "stake1", captains: [] } }),
      );
    const result = await handleTeamCommand({ ...ENV, fetchImpl }, "9999");
    expect(result.embeds?.[0]?.title).toBe("No captains yet");
  });

  it("fetches the first captain's team and returns a single team embed", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, {
        user: {
          id: "u-1",
          stakeAddr: "stake1",
          captains: [{ id: "cap-1", name: "Bonny", factionId: "kraken" }],
        },
      }),
    );
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, {
        captain: {
          id: "cap-1",
          name: "Bonny",
          factionId: "kraken",
          crews: [
            {
              id: "c1",
              templateKey: "tide_brawler",
              moveKeys: ["tide_surge"],
              level: 5,
              xp: 0,
              attrs: null,
            },
          ],
        },
      }),
    );
    const result = await handleTeamCommand({ ...ENV, fetchImpl }, "9999");
    expect(result.embeds).toHaveLength(1);
    expect(result.embeds?.[0]?.title).toBe("Captain Bonny");
  });

  it("appends a captain list when the user has more than one captain", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, {
        user: {
          id: "u-1",
          stakeAddr: "s",
          captains: [
            { id: "cap-1", name: "Bonny", factionId: "kraken" },
            { id: "cap-2", name: "Mary", factionId: "wraith" },
          ],
        },
      }),
    );
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, {
        captain: { id: "cap-1", name: "Bonny", factionId: "kraken", crews: [] },
      }),
    );
    const result = await handleTeamCommand({ ...ENV, fetchImpl }, "9999");
    expect(result.embeds).toHaveLength(2);
    expect(result.embeds?.[1]?.title).toBe("Choose a captain");
  });
});

describe("handleBattleCommand", () => {
  it("rejects non-ai opponents with a friendly message", async () => {
    const fetchImpl = vi.fn();
    const result = await handleBattleCommand({ ...ENV, fetchImpl }, "9999", "human");
    expect(result.content).toMatch(/PvP via Discord isn't supported/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the friendly not_linked message on 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { error: "not_linked" }));
    const result = await handleBattleCommand({ ...ENV, fetchImpl }, "9999", "ai");
    expect(result.content).toMatch(/\/link/);
  });

  it("returns a no-captain prompt when the user has no captain", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: { id: "u-1", stakeAddr: "s", captains: [] },
      }),
    );
    const result = await handleBattleCommand({ ...ENV, fetchImpl }, "9999", "ai");
    expect(result.content).toMatch(/build one on the web/i);
  });

  it("posts to /api/discord/battle and returns a battle embed", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, {
        user: {
          id: "u-1",
          stakeAddr: "s",
          captains: [{ id: "cap-1", name: "Bonny", factionId: "kraken" }],
        },
      }),
    );
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(201, {
        id: "b-1",
        captainName: "Bonny",
        state: {
          turn: 0,
          activeA: {
            templateKey: "tide_brawler",
            hp: 100,
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
            hp: 100,
            maxHp: 100,
            atk: 50,
            def: 50,
            spd: 50,
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
        },
      }),
    );
    const result = await handleBattleCommand({ ...ENV, fetchImpl }, "9999", "ai");
    expect(result.embeds?.[0]?.title).toContain("Bonny");
    expect(result.embeds?.[0]?.description ?? "").toContain("b-1");

    const battleCallUrl = fetchImpl.mock.calls[1]?.[0] as string;
    expect(battleCallUrl).toBe("https://api.example/api/discord/battle");
    const battleCallInit = fetchImpl.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(battleCallInit.body as string)).toEqual({
      discordUserId: "9999",
      captainId: "cap-1",
      opponent: "ai",
    });
  });
});

const TIDE_SURGE: MoveDef = {
  key: "tide_surge",
  name: "Tide Surge",
  affinity: "kraken",
  basePower: 40,
  accuracy: 100,
  kind: "damage",
};

function makeCrew(templateKey: string, moves: MoveDef[] = [TIDE_SURGE]): CrewSnapshot {
  return {
    templateKey,
    hp: 100,
    maxHp: 100,
    atk: 50,
    def: 50,
    spd: 50,
    level: 5,
    affinity: "kraken",
    statuses: [],
    moves,
  };
}

function makeBattleState(opts?: { bench?: CrewSnapshot[] }): BattleState {
  return {
    turn: 0,
    activeA: makeCrew("tide_brawler"),
    activeB: makeCrew("deep_warden"),
    benchA: opts?.bench ?? [makeCrew("cannon_master")],
    benchB: [],
    log: [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
  };
}

function meResponseWithCaptain() {
  return {
    user: {
      id: "u-1",
      stakeAddr: "stake1",
      captains: [{ id: "cap-1", name: "Bonny", factionId: "kraken" }],
    },
  };
}

describe("handleMoveCommand", () => {
  it("returns no_active_battle hint when the user has no in-progress battle", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    fetchImpl.mockResolvedValueOnce(jsonResponse(404, { error: "no_active_battle" }));
    const result = await handleMoveCommand({ ...ENV, fetchImpl }, "9999", "tide_surge");
    expect(result.content).toMatch(/don't have a battle in progress/i);
  });

  it("returns an unknown-move hint when the move isn't on the active crew", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { id: "b-1", state: makeBattleState() }));
    const result = await handleMoveCommand({ ...ENV, fetchImpl }, "9999", "fireball");
    expect(result.content).toMatch(/Couldn't find a move/);
    expect(result.content).toMatch(/Available moves:/);
  });

  it("submits a canonical move action on a key match and renders a turn embed", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { id: "b-1", state: makeBattleState() }));
    const newState: BattleState = { ...makeBattleState(), turn: 1 };
    newState.log.push({
      kind: "move",
      side: "A",
      moveKey: "tide_surge",
      damage: 12,
      targetHpAfter: 88,
      crit: false,
      effective: 1,
    });
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { id: "b-1", state: newState }));
    const result = await handleMoveCommand({ ...ENV, fetchImpl }, "9999", "tide_surge");
    expect(result.embeds?.[0]?.title).toContain("Turn 1");
    const submitInit = fetchImpl.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(submitInit.body as string)).toEqual({
      discordUserId: "9999",
      action: { type: "move", moveKey: "tide_surge" },
    });
  });

  it("translates a human-readable move name to its key", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { id: "b-1", state: makeBattleState() }));
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, { id: "b-1", state: { ...makeBattleState(), turn: 1 } }),
    );
    await handleMoveCommand({ ...ENV, fetchImpl }, "9999", "Tide Surge");
    const submitInit = fetchImpl.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(submitInit.body as string).action.moveKey).toBe("tide_surge");
  });
});

describe("handleSwitchCommand", () => {
  it("returns no_active_battle hint when there's no battle", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    fetchImpl.mockResolvedValueOnce(jsonResponse(404, { error: "no_active_battle" }));
    const result = await handleSwitchCommand({ ...ENV, fetchImpl }, "9999", "cannon_master");
    expect(result.content).toMatch(/don't have a battle in progress/i);
  });

  it("returns an unknown-crew hint when the bench doesn't contain the named crew", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { id: "b-1", state: makeBattleState() }));
    const result = await handleSwitchCommand({ ...ENV, fetchImpl }, "9999", "made_up_crew");
    expect(result.content).toMatch(/Couldn't find a benched crew/);
    expect(result.content).toMatch(/Bench:/);
  });

  it("submits a switch action with the matching bench index", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    const state = makeBattleState({
      bench: [makeCrew("cannon_master"), makeCrew("bulwark_guard")],
    });
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { id: "b-1", state }));
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { id: "b-1", state: { ...state, turn: 1 } }));
    const result = await handleSwitchCommand({ ...ENV, fetchImpl }, "9999", "bulwark_guard");
    expect(result.embeds?.[0]?.title).toContain("Turn 1");
    const submitInit = fetchImpl.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(submitInit.body as string)).toEqual({
      discordUserId: "9999",
      action: { type: "switch", targetIndex: 1 },
    });
  });
});

describe("handleForfeitCommand", () => {
  it("returns no_active_battle hint when there's no battle", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    fetchImpl.mockResolvedValueOnce(jsonResponse(404, { error: "no_active_battle" }));
    const result = await handleForfeitCommand({ ...ENV, fetchImpl }, "9999");
    expect(result.content).toMatch(/don't have a battle in progress/i);
  });

  it("submits a forfeit action and renders the defeat embed", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, meResponseWithCaptain()));
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { id: "b-1", state: makeBattleState() }));
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, {
        id: "b-1",
        state: { ...makeBattleState(), winner: "B" satisfies "B" },
      }),
    );
    const result = await handleForfeitCommand({ ...ENV, fetchImpl }, "9999");
    expect(result.embeds?.[0]?.title).toMatch(/Defeat/);
    const submitInit = fetchImpl.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(submitInit.body as string)).toEqual({
      discordUserId: "9999",
      action: { type: "forfeit" },
    });
  });
});

describe("handleLeaderboardCommand", () => {
  const SEASON = {
    id: "season_1",
    name: "Founding Tides",
    startsAt: 1_700_000_000_000,
    endsAt: 1_702_000_000_000,
  };

  function leaderboardBody(
    over: Partial<{
      entries: Array<{ userId: string; elo: number; wins: number; losses: number; rank: number }>;
      total: number;
    }> = {},
  ) {
    return {
      season: SEASON,
      entries: over.entries ?? [
        { userId: "user_alpha_long_id", elo: 1234, wins: 5, losses: 1, rank: 1 },
        { userId: "user_b", elo: 1100, wins: 2, losses: 3, rank: 2 },
      ],
      total: over.total ?? 2,
      limit: 10,
      offset: 0,
    };
  }

  it("fetches the current season then the leaderboard when no season id is supplied", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, SEASON));
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, leaderboardBody()));
    const result = await handleLeaderboardCommand({ ...ENV, fetchImpl }, null);
    expect(result.embeds?.[0]?.title).toContain("Founding Tides");
    const seasonUrl = fetchImpl.mock.calls[0]?.[0] as string;
    expect(seasonUrl).toBe("https://api.example/api/seasons/current");
    const leaderboardUrl = fetchImpl.mock.calls[1]?.[0] as string;
    expect(leaderboardUrl).toContain("/api/leaderboard/season_1");
    expect(leaderboardUrl).toContain("limit=10");
    expect(leaderboardUrl).toContain("offset=0");
  });

  it("uses the supplied season id directly when provided", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, leaderboardBody()));
    await handleLeaderboardCommand({ ...ENV, fetchImpl }, "explicit_season");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toContain("/api/leaderboard/explicit_season");
  });

  it("returns a friendly message when no active season is found", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(404, { error: "no_active_season" }));
    const result = await handleLeaderboardCommand({ ...ENV, fetchImpl }, null);
    expect(result.content).toMatch(/No season is active/);
    expect(result.embeds).toBeUndefined();
  });

  it("returns a friendly message when an explicit season id is unknown", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(404, { error: "season_not_found" }));
    const result = await handleLeaderboardCommand({ ...ENV, fetchImpl }, "bogus");
    expect(result.content).toMatch(/Couldn't find a season/);
  });

  it("includes rank, elo, and shortened user id in the embed body", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, leaderboardBody()));
    const result = await handleLeaderboardCommand({ ...ENV, fetchImpl }, "season_1");
    const description = result.embeds?.[0]?.description ?? "";
    expect(description).toMatch(/^\*\*1\.\*\*/);
    expect(description).toContain("1234 ELO");
    expect(description).toContain("user_alpha");
    expect(description).not.toContain("user_alpha_long_id");
  });

  it("shows an empty-state description when the season has no ranked captains", async () => {
    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, leaderboardBody({ entries: [], total: 0 })));
    const result = await handleLeaderboardCommand({ ...ENV, fetchImpl }, "season_1");
    expect(result.embeds?.[0]?.description).toMatch(/No captains ranked yet/);
  });

  it("caps the embed at 10 entries even if the server returns more", async () => {
    const fetchImpl = vi.fn();
    const entries = Array.from({ length: 25 }, (_, i) => ({
      userId: `user_${i}`,
      elo: 1500 - i,
      wins: i,
      losses: 0,
      rank: i + 1,
    }));
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, leaderboardBody({ entries, total: 25 })));
    const result = await handleLeaderboardCommand({ ...ENV, fetchImpl }, "season_1");
    const description = result.embeds?.[0]?.description ?? "";
    expect(description).toContain("**10.**");
    expect(description).not.toContain("**11.**");
    expect(result.embeds?.[0]?.footer?.text).toBe("Top 10 of 25");
  });
});

describe("handleStatsCommand", () => {
  it("returns the friendly not_linked message on 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { error: "not_linked" }));
    const result = await handleStatsCommand({ ...ENV, fetchImpl }, "9999", null);
    expect(result.content).toMatch(/\/link/);
  });

  it("renders a self embed when targetDiscordUserId is null", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: { totalBattles: 2, wins: 1, losses: 1, winRate: 0.5, avgTurns: 5 },
        discordUserId: "9999",
      }),
    );
    const result = await handleStatsCommand({ ...ENV, fetchImpl }, "9999", null);
    expect(result.embeds?.[0]?.title).toBe("Your record");
  });

  it("renders an other-user embed when target differs from caller", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: { totalBattles: 1, wins: 1, losses: 0, winRate: 1, avgTurns: 3 },
        discordUserId: "55512",
      }),
    );
    const result = await handleStatsCommand({ ...ENV, fetchImpl }, "9999", "55512");
    expect(result.embeds?.[0]?.title).toContain("<@55512>");

    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toContain("targetDiscordUserId=55512");
  });

  it("translates target_not_linked into the target-specific message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { error: "target_not_linked" }));
    const result = await handleStatsCommand({ ...ENV, fetchImpl }, "9999", "55512");
    expect(result.content).toMatch(/hasn't linked/);
  });
});
