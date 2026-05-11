import { describe, expect, it, vi } from "vitest";

import {
  clearBattleMessage,
  fetchMe,
  fetchStats,
  fetchTeam,
  listInProgressBattleMessages,
  setBattleMessage,
  startBattle,
} from "./serverClient.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchMe", () => {
  it("GETs /api/discord/me with the discordUserId in the query string", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { user: { id: "u-1", stakeAddr: null, captains: [] } }));
    const result = await fetchMe({ serverUrl: "https://api.example", fetchImpl }, "9999");
    expect(result.ok).toBe(true);
    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toBe("https://api.example/api/discord/me?discordUserId=9999");
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("GET");
  });

  it("returns ok:false with parsed error reason on 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { error: "not_linked" }));
    const result = await fetchMe({ serverUrl: "https://api.example", fetchImpl }, "9999");
    expect(result).toEqual({ ok: false, status: 404, reason: "not_linked" });
  });

  it("returns network_error when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await fetchMe({ serverUrl: "https://api.example", fetchImpl }, "9999");
    expect(result).toEqual({ ok: false, status: 0, reason: "network_error" });
  });

  it("returns unknown_error when body has no error field", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const result = await fetchMe({ serverUrl: "https://api.example", fetchImpl }, "9999");
    expect(result).toEqual({ ok: false, status: 500, reason: "unknown_error" });
  });
});

describe("fetchTeam", () => {
  it("encodes both discordUserId and captainId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        captain: { id: "cap-1", name: "Bonny", factionId: "kraken", crews: [] },
      }),
    );
    await fetchTeam({ serverUrl: "https://api.example", fetchImpl }, "9999", "cap-1");
    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toContain("discordUserId=9999");
    expect(url).toContain("captainId=cap-1");
  });
});

describe("startBattle", () => {
  it("POSTs JSON body with discordUserId, captainId, opponent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        id: "b-1",
        state: { turn: 0 },
        captainName: "Bonny",
      }),
    );
    const result = await startBattle(
      { serverUrl: "https://api.example", fetchImpl },
      { discordUserId: "9999", captainId: "cap-1", opponent: "ai" },
    );
    expect(result.ok).toBe(true);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      discordUserId: "9999",
      captainId: "cap-1",
      opponent: "ai",
    });
  });
});

describe("setBattleMessage", () => {
  it("POSTs JSON body with discordUserId, channelId, messageId, guildId, sentAtMs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, id: "b-1" }));
    await setBattleMessage(
      { serverUrl: "https://api.example", fetchImpl },
      {
        battleId: "b-1",
        discordUserId: "9999",
        channelId: "100",
        messageId: "200",
        guildId: "300",
        sentAtMs: 1_700_000_000_000,
      },
    );
    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toBe("https://api.example/api/discord/battle/b-1/message");
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      discordUserId: "9999",
      channelId: "100",
      messageId: "200",
      guildId: "300",
      sentAtMs: 1_700_000_000_000,
    });
  });

  it("sends null guildId for DM channels", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, id: "b-1" }));
    await setBattleMessage(
      { serverUrl: "https://api.example", fetchImpl },
      {
        battleId: "b-1",
        discordUserId: "9999",
        channelId: "100",
        messageId: "200",
        guildId: null,
        sentAtMs: 1,
      },
    );
    const body = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string);
    expect(body.guildId).toBeNull();
  });
});

describe("clearBattleMessage", () => {
  it("DELETEs with discordUserId in the body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, id: "b-1" }));
    await clearBattleMessage(
      { serverUrl: "https://api.example", fetchImpl },
      { battleId: "b-1", discordUserId: "9999" },
    );
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ discordUserId: "9999" });
  });
});

describe("listInProgressBattleMessages", () => {
  it("GETs the in-progress endpoint and returns the parsed list", async () => {
    const battles = [
      {
        battleId: "b-1",
        channelId: "100",
        messageId: "200",
        guildId: "300",
        sentAtMs: 1,
        discordUserId: "9999",
      },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { battles }));
    const result = await listInProgressBattleMessages({
      serverUrl: "https://api.example",
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.battles).toEqual(battles);
    }
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.example/api/discord/battles/in-progress",
    );
  });
});

describe("fetchStats", () => {
  it("includes targetDiscordUserId only when given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: { totalBattles: 0, wins: 0, losses: 0, winRate: 0, avgTurns: 0 },
        discordUserId: "9999",
      }),
    );
    await fetchStats({ serverUrl: "https://api.example", fetchImpl }, "9999");
    expect(fetchImpl.mock.calls[0]?.[0] as string).toBe(
      "https://api.example/api/discord/stats?discordUserId=9999",
    );

    await fetchStats({ serverUrl: "https://api.example", fetchImpl }, "9999", "12345");
    const url = fetchImpl.mock.calls[1]?.[0] as string;
    expect(url).toContain("discordUserId=9999");
    expect(url).toContain("targetDiscordUserId=12345");
  });
});
