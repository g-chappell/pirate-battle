import { describe, expect, it, vi } from "vitest";

import { handleInteraction } from "./interactions.js";
import type { InteractionLike } from "./interactions.js";
import type { LinkEnv } from "./link.js";

function makeInteraction(opts: {
  commandName: string;
  token?: string;
  opponent?: string;
  userMention?: { id: string } | null;
  userId?: string;
  sendImpl?: (content: string) => Promise<unknown>;
}): {
  interaction: InteractionLike;
  reply: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
} {
  const reply = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn().mockImplementation(opts.sendImpl ?? (() => Promise.resolve()));
  const interaction: InteractionLike = {
    commandName: opts.commandName,
    user: { id: opts.userId ?? "111", send },
    getStringOption: (name) => {
      if (name === "token") return opts.token ?? null;
      if (name === "opponent") return opts.opponent ?? null;
      return null;
    },
    getUserOption: (name) => (name === "user" ? (opts.userMention ?? null) : null),
    reply,
  };
  return { interaction, reply, send };
}

const env: LinkEnv = {
  webUrl: "https://web.example",
  serverUrl: "https://api.example",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("handleInteraction — /link", () => {
  it("replies with instructions that include the web URL", async () => {
    const { interaction, reply } = makeInteraction({ commandName: "link" });
    await handleInteraction(interaction, { env });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain("https://web.example");
  });
});

describe("handleInteraction — /link-claim", () => {
  it("rejects when token option is missing", async () => {
    const { interaction, reply } = makeInteraction({ commandName: "link-claim" });
    await handleInteraction(interaction, { env });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toMatch(/token is required/);
  });

  it("on success: replies + DMs the user", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true, userId: "u-1", discordUserId: "9999" }));
    const { interaction, reply, send } = makeInteraction({
      commandName: "link-claim",
      token: "tok-x",
      userId: "9999",
    });
    await handleInteraction(interaction, { env, fetchImpl });
    expect(reply.mock.calls[0]?.[0]).toMatch(/Linked successfully/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toContain("u-1");
  });

  it("forwards the invoking discord user id to the server", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true, userId: "u-1", discordUserId: "55512" }));
    const { interaction } = makeInteraction({
      commandName: "link-claim",
      token: "tok-x",
      userId: "55512",
    });
    await handleInteraction(interaction, { env, fetchImpl });
    const init = fetchImpl.mock.calls[0]?.[1] as { body: string } | undefined;
    expect(init).toBeDefined();
    expect(JSON.parse(init?.body ?? "{}")).toEqual({
      token: "tok-x",
      discordUserId: "55512",
    });
  });

  it("on token error: replies with friendly message and does NOT DM", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { error: "token_used" }));
    const { interaction, reply, send } = makeInteraction({
      commandName: "link-claim",
      token: "tok-x",
    });
    await handleInteraction(interaction, { env, fetchImpl });
    expect(reply.mock.calls[0]?.[0]).toMatch(/already been used/);
    expect(send).not.toHaveBeenCalled();
  });

  it("on conflict: replies with conflict message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(409, { error: "conflict" }));
    const { interaction, reply, send } = makeInteraction({
      commandName: "link-claim",
      token: "tok-x",
    });
    await handleInteraction(interaction, { env, fetchImpl });
    expect(reply.mock.calls[0]?.[0]).toMatch(/already linked to another captain/);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not throw if DM fails — logs warning instead", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true, userId: "u-1", discordUserId: "9999" }));
    const sendImpl = vi.fn().mockRejectedValue(new Error("DMs disabled"));
    const warn = vi.fn();
    const { interaction, reply } = makeInteraction({
      commandName: "link-claim",
      token: "tok-x",
      sendImpl,
    });
    await expect(
      handleInteraction(interaction, { env, fetchImpl, logger: { warn } }),
    ).resolves.toBeUndefined();
    expect(reply).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("handleInteraction — unknown command", () => {
  it("does not call reply or send", async () => {
    const { interaction, reply, send } = makeInteraction({ commandName: "unknown" });
    await handleInteraction(interaction, { env });
    expect(reply).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("handleInteraction — /team", () => {
  it("translates a not_linked response into a friendly message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { error: "not_linked" }));
    const { interaction, reply } = makeInteraction({ commandName: "team", userId: "9999" });
    await handleInteraction(interaction, { env, fetchImpl });
    expect(reply).toHaveBeenCalledTimes(1);
    const payload = reply.mock.calls[0]?.[0];
    expect(typeof payload).toBe("string");
    expect(payload).toMatch(/\/link/);
  });

  it("hits /api/discord/me with the invoking user's id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { user: { id: "u-1", stakeAddr: null, captains: [] } }));
    const { interaction } = makeInteraction({ commandName: "team", userId: "9999" });
    await handleInteraction(interaction, { env, fetchImpl });
    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toContain("discordUserId=9999");
  });
});

describe("handleInteraction — /battle", () => {
  it("rejects when opponent isn't 'ai'", async () => {
    const fetchImpl = vi.fn();
    const { interaction, reply } = makeInteraction({
      commandName: "battle",
      opponent: "human",
    });
    await handleInteraction(interaction, { env, fetchImpl });
    expect(reply.mock.calls[0]?.[0]).toMatch(/PvP via Discord isn't supported/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lowercases / trims the opponent input before dispatch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { error: "not_linked" }));
    const { interaction } = makeInteraction({
      commandName: "battle",
      opponent: "  AI  ",
    });
    await handleInteraction(interaction, { env, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("handleInteraction — /stats", () => {
  it("passes targetDiscordUserId when user option is present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: { totalBattles: 1, wins: 1, losses: 0, winRate: 1, avgTurns: 3 },
        discordUserId: "55512",
      }),
    );
    const { interaction } = makeInteraction({
      commandName: "stats",
      userId: "9999",
      userMention: { id: "55512" },
    });
    await handleInteraction(interaction, { env, fetchImpl });
    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).toContain("discordUserId=9999");
    expect(url).toContain("targetDiscordUserId=55512");
  });

  it("does not include targetDiscordUserId for self-lookup", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        user: { totalBattles: 0, wins: 0, losses: 0, winRate: 0, avgTurns: 0 },
        discordUserId: "9999",
      }),
    );
    const { interaction } = makeInteraction({
      commandName: "stats",
      userId: "9999",
      userMention: null,
    });
    await handleInteraction(interaction, { env, fetchImpl });
    const url = fetchImpl.mock.calls[0]?.[0] as string;
    expect(url).not.toContain("targetDiscordUserId");
  });
});
