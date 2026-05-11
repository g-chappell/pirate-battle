import { describe, expect, it, vi } from "vitest";

import { handleBattleCommand, handleStatsCommand, handleTeamCommand } from "./gameCommands.js";

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
