import { describe, expect, it, vi } from "vitest";

import type { ChannelOps } from "./channelOps.js";
import { handleInteraction } from "./interactions.js";
import type { InteractionLike } from "./interactions.js";
import type { LinkEnv } from "./link.js";

function makeInteraction(opts: {
  commandName: string;
  token?: string;
  opponent?: string;
  name?: string;
  crew?: string;
  userMention?: { id: string } | null;
  userId?: string;
  channelId?: string | null;
  guildId?: string | null;
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
      if (name === "name") return opts.name ?? null;
      if (name === "crew") return opts.crew ?? null;
      return null;
    },
    getUserOption: (name) => (name === "user" ? (opts.userMention ?? null) : null),
    reply,
    channelId: opts.channelId === undefined ? "9000" : opts.channelId,
    guildId: opts.guildId === undefined ? "7000" : opts.guildId,
  };
  return { interaction, reply, send };
}

function makeChannelOps(impls: Partial<ChannelOps> = {}): ChannelOps {
  return {
    sendEmbed: impls.sendEmbed ?? vi.fn().mockResolvedValue({ ok: false, reason: "not_stubbed" }),
    editEmbed: impls.editEmbed ?? vi.fn().mockResolvedValue({ ok: false, reason: "not_stubbed" }),
    setMessageContent:
      impls.setMessageContent ?? vi.fn().mockResolvedValue({ ok: false, reason: "not_stubbed" }),
    fetchMessage:
      impls.fetchMessage ?? vi.fn().mockResolvedValue({ ok: false, reason: "not_stubbed" }),
  };
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

describe("handleInteraction — /battle channel publish", () => {
  function battleResponseBody() {
    return {
      id: "b-1",
      captainName: "Bonny",
      state: {
        turn: 0,
        activeA: {
          templateKey: "hero",
          hp: 100,
          maxHp: 100,
          atk: 50,
          def: 50,
          spd: 50,
          level: 5,
          affinity: "kraken",
          statuses: [],
          moves: [
            {
              key: "tackle",
              name: "Tackle",
              affinity: "kraken",
              basePower: 30,
              accuracy: 100,
              kind: "damage",
            },
          ],
        },
        activeB: {
          templateKey: "foe",
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
    };
  }

  function meBody() {
    return {
      user: {
        id: "u-1",
        stakeAddr: null,
        captains: [{ id: "cap-1", name: "Bonny", factionId: "kraken" }],
      },
    };
  }

  it("publishes the embed to the channel and PATCHes the battle when channelOps is provided", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/discord/me")) {
        return Promise.resolve(jsonResponse(200, meBody()));
      }
      if (url.includes("/api/discord/battle/b-1/message") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(200, { ok: true, id: "b-1" }));
      }
      if (url.includes("/api/discord/battle") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, battleResponseBody()));
      }
      return Promise.resolve(jsonResponse(500, { error: "unexpected_route" }));
    });
    const sendEmbed = vi.fn().mockResolvedValue({
      ok: true,
      messageId: "msg-1",
      sentAtMs: 1_700_000_000_000,
    });
    const channelOps = makeChannelOps({ sendEmbed });
    const { interaction } = makeInteraction({
      commandName: "battle",
      opponent: "ai",
      userId: "9999",
    });
    await handleInteraction(interaction, { env, fetchImpl, channelOps });
    expect(sendEmbed).toHaveBeenCalledTimes(1);
    expect(sendEmbed.mock.calls[0]?.[0]).toMatchObject({ channelId: "9000" });
    // PATCH should send all the persistence fields
    const patchCall = fetchImpl.mock.calls.find((c) =>
      (c[0] as string).includes("/api/discord/battle/b-1/message"),
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]?.body as string);
    expect(body).toMatchObject({
      discordUserId: "9999",
      channelId: "9000",
      messageId: "msg-1",
      guildId: "7000",
      sentAtMs: 1_700_000_000_000,
    });
  });

  it("skips channel publish when channelOps is absent (back-compat for old tests)", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/discord/me")) {
        return Promise.resolve(jsonResponse(200, meBody()));
      }
      return Promise.resolve(jsonResponse(201, battleResponseBody()));
    });
    const { interaction } = makeInteraction({ commandName: "battle", opponent: "ai" });
    await handleInteraction(interaction, { env, fetchImpl });
    // No PATCH call (no /message route hit)
    const patchCalls = fetchImpl.mock.calls.filter((c) => (c[0] as string).includes("/message"));
    expect(patchCalls).toHaveLength(0);
  });

  it("logs a warning and does NOT PATCH when sendEmbed fails", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/discord/me")) {
        return Promise.resolve(jsonResponse(200, meBody()));
      }
      return Promise.resolve(jsonResponse(201, battleResponseBody()));
    });
    const sendEmbed = vi.fn().mockResolvedValue({ ok: false, reason: "missing_access" });
    const channelOps = makeChannelOps({ sendEmbed });
    const warn = vi.fn();
    const { interaction } = makeInteraction({ commandName: "battle", opponent: "ai" });
    await handleInteraction(interaction, { env, fetchImpl, channelOps, logger: { warn } });
    expect(sendEmbed).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    const patchCalls = fetchImpl.mock.calls.filter((c) => (c[0] as string).includes("/message"));
    expect(patchCalls).toHaveLength(0);
  });
});

describe("handleInteraction — /move channel edit/rotate", () => {
  function actionResponseBody() {
    return {
      id: "b-1",
      state: {
        turn: 1,
        activeA: {
          templateKey: "hero",
          hp: 80,
          maxHp: 100,
          atk: 50,
          def: 50,
          spd: 50,
          level: 5,
          affinity: "kraken",
          statuses: [],
          moves: [
            {
              key: "tackle",
              name: "Tackle",
              affinity: "kraken",
              basePower: 30,
              accuracy: 100,
              kind: "damage",
            },
          ],
        },
        activeB: {
          templateKey: "foe",
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
        benchA: [],
        benchB: [],
        log: [],
        rngSeed: 1,
        rngState: 1,
        pendingSwapA: false,
        pendingSwapB: false,
        winner: null,
      },
    };
  }

  function inProgressBody(sentAtMs: number) {
    return {
      battles: [
        {
          battleId: "b-1",
          channelId: "9000",
          messageId: "msg-1",
          guildId: "7000",
          sentAtMs,
          discordUserId: "9999",
        },
      ],
    };
  }

  function makeFetchImpl(args: {
    activeBattleId: string;
    actionBody: ReturnType<typeof actionResponseBody>;
    inProgress: ReturnType<typeof inProgressBody>;
  }) {
    return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/discord/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            user: {
              id: "u-1",
              stakeAddr: null,
              captains: [{ id: "cap-1", name: "Bonny", factionId: "kraken" }],
            },
          }),
        );
      }
      if (url.includes("/api/discord/battle/active")) {
        return Promise.resolve(
          jsonResponse(200, { id: args.activeBattleId, state: args.actionBody.state }),
        );
      }
      if (url.includes("/api/discord/battle/action")) {
        return Promise.resolve(jsonResponse(200, args.actionBody));
      }
      if (url.includes("/api/discord/battles/in-progress")) {
        return Promise.resolve(jsonResponse(200, args.inProgress));
      }
      if (url.includes("/api/discord/battle/b-1/message") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(200, { ok: true, id: "b-1" }));
      }
      return Promise.resolve(jsonResponse(500, { error: "unexpected_route" }));
    });
  }

  it("edits the existing message when it is within the rotation threshold", async () => {
    const nowMs = 1_700_000_000_000;
    const fetchImpl = makeFetchImpl({
      activeBattleId: "b-1",
      actionBody: actionResponseBody(),
      inProgress: inProgressBody(nowMs - 60_000),
    });
    const editEmbed = vi.fn().mockResolvedValue({ ok: true });
    const sendEmbed = vi.fn().mockResolvedValue({ ok: true, messageId: "msg-2", sentAtMs: nowMs });
    const setMessageContent = vi.fn();
    const channelOps = makeChannelOps({ editEmbed, sendEmbed, setMessageContent });
    const { interaction } = makeInteraction({
      commandName: "move",
      name: "Tackle",
      userId: "9999",
    });
    await handleInteraction(interaction, {
      env,
      fetchImpl,
      channelOps,
      now: () => nowMs,
    });
    expect(editEmbed).toHaveBeenCalledTimes(1);
    expect(sendEmbed).not.toHaveBeenCalled();
    expect(setMessageContent).not.toHaveBeenCalled();
  });

  it("rotates (send-new + mark-old) when the existing message is past the threshold", async () => {
    const nowMs = 1_700_000_000_000;
    const fetchImpl = makeFetchImpl({
      activeBattleId: "b-1",
      actionBody: actionResponseBody(),
      inProgress: inProgressBody(nowMs - 15 * 60 * 1000),
    });
    const editEmbed = vi.fn().mockResolvedValue({ ok: true });
    const sendEmbed = vi.fn().mockResolvedValue({ ok: true, messageId: "msg-2", sentAtMs: nowMs });
    const setMessageContent = vi.fn().mockResolvedValue({ ok: true });
    const channelOps = makeChannelOps({ editEmbed, sendEmbed, setMessageContent });
    const { interaction } = makeInteraction({
      commandName: "move",
      name: "Tackle",
      userId: "9999",
    });
    await handleInteraction(interaction, {
      env,
      fetchImpl,
      channelOps,
      now: () => nowMs,
    });
    expect(sendEmbed).toHaveBeenCalledTimes(1);
    expect(setMessageContent).toHaveBeenCalledTimes(1);
    // setMessageContent points at the OLD message id
    expect(setMessageContent.mock.calls[0]?.[0]).toMatchObject({
      channelId: "9000",
      messageId: "msg-1",
    });
    const oldContent = setMessageContent.mock.calls[0]?.[0]?.content as string;
    expect(oldContent).toContain("https://discord.com/channels/7000/9000/msg-2");
    // PATCH for new message id
    const patchCalls = fetchImpl.mock.calls.filter((c) =>
      (c[0] as string).includes("/api/discord/battle/b-1/message"),
    );
    expect(patchCalls).toHaveLength(1);
    const body = JSON.parse(patchCalls[0]![1]?.body as string);
    expect(body.messageId).toBe("msg-2");
    expect(body.sentAtMs).toBe(nowMs);
    expect(editEmbed).not.toHaveBeenCalled();
  });

  it("falls back to a fresh send when there's no existing message in the in-progress list", async () => {
    const nowMs = 1_700_000_000_000;
    const fetchImpl = makeFetchImpl({
      activeBattleId: "b-1",
      actionBody: actionResponseBody(),
      inProgress: { battles: [] },
    });
    const sendEmbed = vi.fn().mockResolvedValue({ ok: true, messageId: "msg-99", sentAtMs: nowMs });
    const editEmbed = vi.fn();
    const setMessageContent = vi.fn();
    const channelOps = makeChannelOps({ sendEmbed, editEmbed, setMessageContent });
    const { interaction } = makeInteraction({
      commandName: "move",
      name: "Tackle",
      userId: "9999",
    });
    await handleInteraction(interaction, {
      env,
      fetchImpl,
      channelOps,
      now: () => nowMs,
    });
    expect(sendEmbed).toHaveBeenCalledTimes(1);
    expect(editEmbed).not.toHaveBeenCalled();
    expect(setMessageContent).not.toHaveBeenCalled();
    const patchCalls = fetchImpl.mock.calls.filter((c) =>
      (c[0] as string).includes("/api/discord/battle/b-1/message"),
    );
    expect(patchCalls).toHaveLength(1);
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
