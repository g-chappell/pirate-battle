import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { InMemoryDiscordLinkTokenStore } from "../discordLinkStore.js";
import { buildServer } from "../index.js";
import { InMemoryUserStore } from "../userStore.js";
import { SESSION_COOKIE_NAME } from "./session.js";

interface AppHarness {
  app: ReturnType<typeof buildServer>;
  userStore: InMemoryUserStore;
  tokenStore: InMemoryDiscordLinkTokenStore;
}

function makeApp(
  opts: {
    tokenStore?: InMemoryDiscordLinkTokenStore;
  } = {},
): AppHarness {
  const userStore = new InMemoryUserStore();
  const battleStore = new InMemoryBattleStore();
  const tokenStore = opts.tokenStore ?? new InMemoryDiscordLinkTokenStore();
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    battleStore,
    discordLinkTokenStore: tokenStore,
    logger: false,
  });
  return { app, userStore, tokenStore };
}

function extractCookieHeader(setCookie: string | string[] | undefined) {
  if (!setCookie) return undefined;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const target = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return target ? target.split(";")[0] : undefined;
}

async function makeWalletSession(
  harness: AppHarness,
  stakeAddr = "stake_test1wallet",
): Promise<{ cookie: string; userId: string }> {
  await harness.app.ready();
  const session = await harness.app.inject({
    method: "POST",
    url: "/api/session/anonymous",
  });
  const cookie = extractCookieHeader(session.headers["set-cookie"]);
  if (!cookie) throw new Error("no session cookie");
  const userId = session.json().id as string;
  const attached = await harness.userStore.attachStakeAddrToUser(
    userId,
    stakeAddr,
  );
  if (!attached) throw new Error("attach stake addr failed");
  return { cookie, userId };
}

async function makeAnonymousSession(
  harness: AppHarness,
): Promise<{ cookie: string; userId: string }> {
  await harness.app.ready();
  const session = await harness.app.inject({
    method: "POST",
    url: "/api/session/anonymous",
  });
  const cookie = extractCookieHeader(session.headers["set-cookie"]);
  if (!cookie) throw new Error("no session cookie");
  return { cookie, userId: session.json().id as string };
}

describe("POST /api/discord/link-token", () => {
  it("returns 401 when no session cookie is present", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-token",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
    await harness.app.close();
  });

  it("returns 401 when session has no wallet attached", async () => {
    const harness = makeApp();
    const { cookie } = await makeAnonymousSession(harness);
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-token",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "wallet_required" });
    await harness.app.close();
  });

  it("returns 201 + token + expiresAt for a wallet-backed session", async () => {
    const tokenStore = new InMemoryDiscordLinkTokenStore({
      ttlMs: 60_000,
      randomFn: () => "tok-issued",
      nowFn: () => 1_000_000,
    });
    const harness = makeApp({ tokenStore });
    const { cookie } = await makeWalletSession(harness);
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-token",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      token: "tok-issued",
      expiresAt: 1_060_000,
    });
    await harness.app.close();
  });
});

describe("POST /api/discord/link-claim — input validation", () => {
  it("rejects missing body with 400", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
    });
    expect(res.statusCode).toBe(400);
    await harness.app.close();
  });

  it("rejects missing token with 400", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { discordUserId: "1234567890" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_token" });
    await harness.app.close();
  });

  it("rejects non-numeric discordUserId with 400", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: "abc", discordUserId: "not-numeric" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_discord_user_id" });
    await harness.app.close();
  });

  it("rejects empty discordUserId with 400", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: "abc", discordUserId: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_discord_user_id" });
    await harness.app.close();
  });
});

describe("POST /api/discord/link-claim — token semantics", () => {
  it("rejects unknown token with 401", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: "never-issued", discordUserId: "1234567890" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "token_unknown" });
    await harness.app.close();
  });

  it("rejects already-used token with 401", async () => {
    const tokenStore = new InMemoryDiscordLinkTokenStore({
      ttlMs: 60_000,
      randomFn: () => "tok-once",
      nowFn: () => 0,
    });
    const harness = makeApp({ tokenStore });
    const { userId } = await makeWalletSession(harness);
    await tokenStore.issue(userId);
    const consumed = await tokenStore.consume("tok-once");
    expect(consumed.ok).toBe(true);

    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: "tok-once", discordUserId: "1234567890" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "token_used" });
    await harness.app.close();
  });

  it("rejects expired token with 401", async () => {
    let now = 0;
    const tokenStore = new InMemoryDiscordLinkTokenStore({
      ttlMs: 1_000,
      randomFn: () => "tok-expired",
      nowFn: () => now,
    });
    const harness = makeApp({ tokenStore });
    const { userId } = await makeWalletSession(harness);
    await tokenStore.issue(userId);
    now = 5_000;

    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: "tok-expired", discordUserId: "1234567890" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "token_expired" });
    await harness.app.close();
  });
});

describe("POST /api/discord/link-claim — happy path + conflicts", () => {
  it("links the User and returns ok on first claim", async () => {
    const tokenStore = new InMemoryDiscordLinkTokenStore({
      ttlMs: 60_000,
      randomFn: () => "tok-happy",
      nowFn: () => 0,
    });
    const harness = makeApp({ tokenStore });
    const { userId } = await makeWalletSession(harness);
    await tokenStore.issue(userId);

    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: "tok-happy", discordUserId: "1234567890" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      userId,
      discordUserId: "1234567890",
    });
    expect(harness.userStore.getDiscordUserId(userId)).toBe("1234567890");
    await harness.app.close();
  });

  it("rejects with 409 when the discordUserId is already linked to another user", async () => {
    const harness = makeApp();
    // pre-link an unrelated user to discord 9999
    const otherUser =
      await harness.userStore.createWithStakeAddr("stake_test1other");
    const preset = await harness.userStore.setDiscordUserId(
      otherUser.id,
      "9999",
    );
    expect(preset.ok).toBe(true);

    const { userId } = await makeWalletSession(harness, "stake_test1mine");
    const issued = await harness.tokenStore.issue(userId);

    const res = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: issued.token, discordUserId: "9999" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "conflict" });
    // the conflicting attempt must NOT have changed the requesting user's binding
    expect(harness.userStore.getDiscordUserId(userId)).toBeUndefined();
    await harness.app.close();
  });

  it("invalidates the token after successful claim — replay fails as used", async () => {
    const harness = makeApp();
    const { userId } = await makeWalletSession(harness);
    const issued = await harness.tokenStore.issue(userId);

    const ok = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: issued.token, discordUserId: "1111" },
    });
    expect(ok.statusCode).toBe(200);

    const replay = await harness.app.inject({
      method: "POST",
      url: "/api/discord/link-claim",
      payload: { token: issued.token, discordUserId: "1111" },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toEqual({ error: "token_used" });
    await harness.app.close();
  });
});
