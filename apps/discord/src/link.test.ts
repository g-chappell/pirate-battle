import { describe, expect, it, vi } from "vitest";

import { buildLinkInstructions, callLinkClaim, formatClaimReply, readLinkEnv } from "./link.js";

describe("readLinkEnv", () => {
  it("returns both URLs when set", () => {
    expect(
      readLinkEnv({
        PIRATE_BATTLE_WEB_URL: "https://web.example",
        PIRATE_BATTLE_SERVER_URL: "https://api.example",
      }),
    ).toEqual({
      webUrl: "https://web.example",
      serverUrl: "https://api.example",
    });
  });

  it("throws when web URL is missing", () => {
    expect(() => readLinkEnv({ PIRATE_BATTLE_SERVER_URL: "https://api.example" })).toThrowError(
      /PIRATE_BATTLE_WEB_URL/,
    );
  });

  it("throws when server URL is missing", () => {
    expect(() => readLinkEnv({ PIRATE_BATTLE_WEB_URL: "https://web.example" })).toThrowError(
      /PIRATE_BATTLE_SERVER_URL/,
    );
  });
});

describe("buildLinkInstructions", () => {
  it("includes the web URL and references /link-claim", () => {
    const { channelReply } = buildLinkInstructions({
      webUrl: "https://web.example",
      serverUrl: "https://api.example",
    });
    expect(channelReply).toContain("https://web.example");
    expect(channelReply).toContain("/link-claim");
    expect(channelReply).toContain("Generate link token");
  });
});

describe("callLinkClaim", () => {
  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("posts to /api/discord/link-claim with token + discordUserId", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true, userId: "u-1", discordUserId: "9999" }));
    const outcome = await callLinkClaim({
      serverUrl: "https://api.example",
      token: "tok-abc",
      discordUserId: "9999",
      fetchImpl,
    });
    expect(outcome).toEqual({ kind: "ok", userId: "u-1", discordUserId: "9999" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example/api/discord/link-claim");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      token: "tok-abc",
      discordUserId: "9999",
    });
  });

  it("maps a 401 token_used response to an error outcome", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { error: "token_used" }));
    const outcome = await callLinkClaim({
      serverUrl: "https://api.example",
      token: "tok-x",
      discordUserId: "9999",
      fetchImpl,
    });
    expect(outcome).toEqual({ kind: "error", reason: "token_used", status: 401 });
  });

  it("maps a 409 conflict to an error outcome", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(409, { error: "conflict" }));
    const outcome = await callLinkClaim({
      serverUrl: "https://api.example",
      token: "tok-x",
      discordUserId: "9999",
      fetchImpl,
    });
    expect(outcome).toEqual({ kind: "error", reason: "conflict", status: 409 });
  });

  it("returns network_error when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const outcome = await callLinkClaim({
      serverUrl: "https://api.example",
      token: "tok-x",
      discordUserId: "9999",
      fetchImpl,
    });
    expect(outcome).toEqual({ kind: "error", reason: "network_error", status: 0 });
  });

  it("returns unknown_error when body has no error field", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not-json", { status: 502 }));
    const outcome = await callLinkClaim({
      serverUrl: "https://api.example",
      token: "tok-x",
      discordUserId: "9999",
      fetchImpl,
    });
    expect(outcome).toEqual({ kind: "error", reason: "unknown_error", status: 502 });
  });
});

describe("formatClaimReply", () => {
  it("returns success reply + DM on ok", () => {
    const reply = formatClaimReply({
      kind: "ok",
      userId: "u-1",
      discordUserId: "9999",
    });
    expect(reply.channelReply).toMatch(/Linked successfully/);
    expect(reply.dm).toBeDefined();
    expect(reply.dm).toContain("u-1");
  });

  it("returns a friendly message for known reasons without a DM", () => {
    const reply = formatClaimReply({
      kind: "error",
      reason: "token_expired",
      status: 401,
    });
    expect(reply.channelReply).toMatch(/expired/i);
    expect(reply.dm).toBeUndefined();
  });

  it("falls back to a generic message for unknown reasons", () => {
    const reply = formatClaimReply({
      kind: "error",
      reason: "weird_new_reason",
      status: 500,
    });
    expect(reply.channelReply).toMatch(/Something went wrong/);
  });
});
