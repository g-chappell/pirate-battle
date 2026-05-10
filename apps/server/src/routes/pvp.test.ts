import { CREWS } from "@pirate-battle/content";
import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { buildServer } from "../index.js";
import { InMemoryPvpChallengeStore, type PvpChallengeRecord } from "../pvpChallengeStore.js";
import { InMemoryPvpQueueStore } from "../pvpQueueStore.js";
import { InMemoryUserStore } from "../userStore.js";

import { TEAM_SIZE } from "./captain.js";
import { PVP_ACTION_TIMEOUT_MS } from "./pvp.js";
import { SESSION_COOKIE_NAME } from "./session.js";

interface TestClock {
  now: number;
  read: () => number;
  advance: (ms: number) => void;
}

function makeClock(start = 1_700_000_000_000): TestClock {
  const clock: TestClock = {
    now: start,
    read: () => clock.now,
    advance: (ms: number) => {
      clock.now += ms;
    },
  };
  return clock;
}

function makeApp(seed = 12345, clock: TestClock = makeClock()) {
  const userStore = new InMemoryUserStore();
  const battleStore = new InMemoryBattleStore();
  const challengeStore = new InMemoryPvpChallengeStore({
    nowFn: clock.read,
  });
  const queueStore = new InMemoryPvpQueueStore({ nowFn: clock.read });
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    battleStore,
    pvpChallengeStore: challengeStore,
    pvpQueueStore: queueStore,
    seedFactory: () => seed,
    nowFn: clock.read,
    logger: false,
  });
  return { app, userStore, battleStore, challengeStore, queueStore, clock };
}

function extractCookieHeader(setCookieHeader: string | string[] | undefined) {
  if (!setCookieHeader) return undefined;
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const target = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!target) return undefined;
  return target.split(";")[0];
}

const SIX_KEYS = CREWS.slice(0, TEAM_SIZE).map((c) => c.templateKey);

async function authedSession(app: ReturnType<typeof makeApp>["app"]) {
  const create = await app.inject({
    method: "POST",
    url: "/api/session/anonymous",
  });
  const cookie = extractCookieHeader(create.headers["set-cookie"]);
  if (!cookie) throw new Error("no session cookie set");
  return { cookie, userId: create.json().id as string };
}

async function createCaptain(
  app: ReturnType<typeof makeApp>["app"],
  cookie: string,
  name = "Bonny",
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/captain",
    headers: { cookie },
    payload: {
      name,
      factionId: "kraken",
      crewTemplateKeys: SIX_KEYS,
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`captain create failed: ${res.statusCode} ${res.body}`);
  }
  return res.json().id as string;
}

describe("POST /api/pvp/challenge", () => {
  it("issues a token tied to the captain when authenticated", async () => {
    const { app, challengeStore } = makeApp();
    await app.ready();
    const { cookie, userId } = await authedSession(app);
    const captainId = await createCaptain(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: "/api/pvp/challenge",
      headers: { cookie },
      payload: { captainId },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { token: string; expiresAt: number };
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(8);
    expect(typeof body.expiresAt).toBe("number");

    const stored = (await challengeStore.findByToken(body.token)) as PvpChallengeRecord;
    expect(stored.challengerUserId).toBe(userId);
    expect(stored.challengerCaptainId).toBe(captainId);
    await app.close();
  });

  it("returns 401 without a session", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/pvp/challenge",
      payload: { captainId: "cap_x" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 404 when the captain belongs to someone else", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie: cookie1 } = await authedSession(app);
    const captainId = await createCaptain(app, cookie1);
    const { cookie: cookie2 } = await authedSession(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/pvp/challenge",
      headers: { cookie: cookie2 },
      payload: { captainId },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "captain_not_found" });
    await app.close();
  });
});

describe("POST /api/pvp/challenge/:token/accept", () => {
  async function issueChallenge(app: ReturnType<typeof makeApp>["app"]) {
    const { cookie: hostCookie, userId: hostUserId } = await authedSession(app);
    const hostCaptain = await createCaptain(app, hostCookie, "Host");
    const issue = await app.inject({
      method: "POST",
      url: "/api/pvp/challenge",
      headers: { cookie: hostCookie },
      payload: { captainId: hostCaptain },
    });
    const { token } = issue.json() as { token: string };
    return { hostCookie, hostUserId, hostCaptain, token };
  }

  it("creates a PvP battle visible to both players", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const { token, hostUserId } = await issueChallenge(harness.app);

    const { cookie: guestCookie, userId: guestUserId } = await authedSession(harness.app);
    const guestCaptain = await createCaptain(harness.app, guestCookie, "Guest");

    const accept = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/challenge/${token}/accept`,
      headers: { cookie: guestCookie },
      payload: { captainId: guestCaptain },
    });
    expect(accept.statusCode).toBe(201);
    const body = accept.json() as { id: string; yourSide: "A" | "B" };
    expect(body.yourSide).toBe("B");

    const stored = await harness.battleStore.get(body.id);
    expect(stored?.ownerUserId).toBe(hostUserId);
    expect(stored?.participantBId).toBe(guestUserId);
    expect(stored?.mode).toBe("PVP");
    await harness.app.close();
  });

  it("rejects accepting your own challenge", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const { token, hostCookie, hostCaptain } = await issueChallenge(harness.app);

    const accept = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/challenge/${token}/accept`,
      headers: { cookie: hostCookie },
      payload: { captainId: hostCaptain },
    });
    expect(accept.statusCode).toBe(400);
    expect(accept.json()).toEqual({ error: "self_accept" });
    await harness.app.close();
  });

  it("rejects accepting the same challenge twice", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const { token } = await issueChallenge(harness.app);

    const { cookie: g1Cookie } = await authedSession(harness.app);
    const g1Captain = await createCaptain(harness.app, g1Cookie, "G1");
    const first = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/challenge/${token}/accept`,
      headers: { cookie: g1Cookie },
      payload: { captainId: g1Captain },
    });
    expect(first.statusCode).toBe(201);

    const { cookie: g2Cookie } = await authedSession(harness.app);
    const g2Captain = await createCaptain(harness.app, g2Cookie, "G2");
    const second = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/challenge/${token}/accept`,
      headers: { cookie: g2Cookie },
      payload: { captainId: g2Captain },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: "already_accepted" });
    await harness.app.close();
  });

  it("rejects an expired token", async () => {
    const clock = makeClock();
    const harness = makeApp(12345, clock);
    await harness.app.ready();
    const { token } = await issueChallenge(harness.app);

    clock.advance(25 * 60 * 60 * 1000);

    const { cookie: gCookie } = await authedSession(harness.app);
    const gCaptain = await createCaptain(harness.app, gCookie, "G");
    const accept = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/challenge/${token}/accept`,
      headers: { cookie: gCookie },
      payload: { captainId: gCaptain },
    });
    expect(accept.statusCode).toBe(410);
    expect(accept.json()).toEqual({ error: "expired" });
    await harness.app.close();
  });

  it("404 for an unknown token", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const { cookie } = await authedSession(harness.app);
    const captainId = await createCaptain(harness.app, cookie);
    const res = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/challenge/does-not-exist/accept`,
      headers: { cookie },
      payload: { captainId },
    });
    expect(res.statusCode).toBe(404);
    await harness.app.close();
  });
});

describe("PvP turn submission", () => {
  async function setupBattle() {
    const clock = makeClock();
    const harness = makeApp(424242, clock);
    await harness.app.ready();

    const { cookie: hostCookie } = await authedSession(harness.app);
    const hostCaptain = await createCaptain(harness.app, hostCookie, "Host");
    const issue = await harness.app.inject({
      method: "POST",
      url: "/api/pvp/challenge",
      headers: { cookie: hostCookie },
      payload: { captainId: hostCaptain },
    });
    const { token } = issue.json() as { token: string };

    const { cookie: guestCookie } = await authedSession(harness.app);
    const guestCaptain = await createCaptain(harness.app, guestCookie, "Guest");
    const accept = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/challenge/${token}/accept`,
      headers: { cookie: guestCookie },
      payload: { captainId: guestCaptain },
    });
    const { id } = accept.json() as { id: string };
    return { harness, hostCookie, guestCookie, battleId: id };
  }

  it("waits for the second action before resolving", async () => {
    const { harness, hostCookie, guestCookie, battleId } = await setupBattle();
    const stored = await harness.battleStore.get(battleId);
    const moveKey = stored!.state.activeA.moves[0]!.key;

    const first = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/battle/${battleId}/action`,
      headers: { cookie: hostCookie },
      payload: { action: { type: "move", moveKey } },
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as {
      status: string;
      state: { turn: number };
      pendingYou: boolean;
      pendingOpponent: boolean;
    };
    expect(firstBody.status).toBe("waiting_opponent");
    expect(firstBody.pendingYou).toBe(true);
    expect(firstBody.pendingOpponent).toBe(false);
    expect(firstBody.state.turn).toBe(0);

    const guestMoveKey = stored!.state.activeB.moves[0]!.key;
    const second = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/battle/${battleId}/action`,
      headers: { cookie: guestCookie },
      payload: { action: { type: "move", moveKey: guestMoveKey } },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as {
      status: string;
      state: { turn: number; log: unknown[] };
      pendingYou: boolean;
      pendingOpponent: boolean;
    };
    expect(secondBody.status).toBe("resolved");
    expect(secondBody.state.turn).toBe(1);
    expect(secondBody.state.log.length).toBeGreaterThan(0);
    expect(secondBody.pendingYou).toBe(false);
    expect(secondBody.pendingOpponent).toBe(false);

    await harness.app.close();
  });

  it("rejects non-participants", async () => {
    const { harness, battleId } = await setupBattle();
    const { cookie: outsider } = await authedSession(harness.app);
    const res = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/battle/${battleId}/action`,
      headers: { cookie: outsider },
      payload: { action: { type: "forfeit" } },
    });
    expect(res.statusCode).toBe(403);
    await harness.app.close();
  });

  it("validates moves against the submitting side", async () => {
    const { harness, hostCookie, battleId } = await setupBattle();

    const hostBadMove = await harness.app.inject({
      method: "POST",
      url: `/api/pvp/battle/${battleId}/action`,
      headers: { cookie: hostCookie },
      payload: { action: { type: "move", moveKey: "definitely_not_a_move" } },
    });
    expect(hostBadMove.statusCode).toBe(400);
    expect(hostBadMove.json()).toEqual({ error: "unknown_move" });
    await harness.app.close();
  });

  it("forfeits the silent side after the timeout", async () => {
    const { harness, hostCookie, guestCookie, battleId } = await setupBattle();
    const stored = await harness.battleStore.get(battleId);
    const moveKey = stored!.state.activeA.moves[0]!.key;

    await harness.app.inject({
      method: "POST",
      url: `/api/pvp/battle/${battleId}/action`,
      headers: { cookie: hostCookie },
      payload: { action: { type: "move", moveKey } },
    });

    harness.clock.advance(PVP_ACTION_TIMEOUT_MS + 1);

    const status = await harness.app.inject({
      method: "GET",
      url: `/api/pvp/battle/${battleId}`,
      headers: { cookie: guestCookie },
    });
    expect(status.statusCode).toBe(200);
    const body = status.json() as {
      state: { winner: string | null };
    };
    expect(body.state.winner).toBe("A");
    await harness.app.close();
  });

  it("returns the same byte-for-byte log given the same actions and seed", async () => {
    async function runOnce(seed: number) {
      const clock = makeClock();
      const harness = makeApp(seed, clock);
      await harness.app.ready();
      const { cookie: hostCookie } = await authedSession(harness.app);
      const hostCaptain = await createCaptain(harness.app, hostCookie, "Host");
      const issue = await harness.app.inject({
        method: "POST",
        url: "/api/pvp/challenge",
        headers: { cookie: hostCookie },
        payload: { captainId: hostCaptain },
      });
      const { token } = issue.json() as { token: string };

      const { cookie: guestCookie } = await authedSession(harness.app);
      const guestCaptain = await createCaptain(harness.app, guestCookie, "Guest");
      const accept = await harness.app.inject({
        method: "POST",
        url: `/api/pvp/challenge/${token}/accept`,
        headers: { cookie: guestCookie },
        payload: { captainId: guestCaptain },
      });
      const { id } = accept.json() as { id: string };

      const stored = await harness.battleStore.get(id);
      const aMove = stored!.state.activeA.moves[0]!.key;
      const bMove = stored!.state.activeB.moves[0]!.key;

      await harness.app.inject({
        method: "POST",
        url: `/api/pvp/battle/${id}/action`,
        headers: { cookie: hostCookie },
        payload: { action: { type: "move", moveKey: aMove } },
      });
      const result = await harness.app.inject({
        method: "POST",
        url: `/api/pvp/battle/${id}/action`,
        headers: { cookie: guestCookie },
        payload: { action: { type: "move", moveKey: bMove } },
      });
      const body = result.json();
      await harness.app.close();
      return body;
    }
    const a = await runOnce(11111);
    const b = await runOnce(11111);
    expect(b.state.log).toEqual(a.state.log);
    expect(b.state.activeA.hp).toBe(a.state.activeA.hp);
    expect(b.state.activeB.hp).toBe(a.state.activeB.hp);
  });
});

describe("PvP queue", () => {
  it("queues a single user as 'queued'", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const { cookie } = await authedSession(harness.app);
    const captainId = await createCaptain(harness.app, cookie);

    const join = await harness.app.inject({
      method: "POST",
      url: "/api/pvp/queue",
      headers: { cookie },
      payload: { captainId },
    });
    expect(join.statusCode).toBe(201);
    expect(join.json().status).toBe("queued");

    const status = await harness.app.inject({
      method: "GET",
      url: "/api/pvp/queue/status",
      headers: { cookie },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe("queued");
    await harness.app.close();
  });

  it("matches two users into a PvP battle and notifies both via status", async () => {
    const harness = makeApp();
    await harness.app.ready();

    const { cookie: aCookie, userId: aId } = await authedSession(harness.app);
    const aCaptain = await createCaptain(harness.app, aCookie, "Alpha");
    const firstJoin = await harness.app.inject({
      method: "POST",
      url: "/api/pvp/queue",
      headers: { cookie: aCookie },
      payload: { captainId: aCaptain },
    });
    expect(firstJoin.json().status).toBe("queued");

    const { cookie: bCookie, userId: bId } = await authedSession(harness.app);
    const bCaptain = await createCaptain(harness.app, bCookie, "Beta");
    const secondJoin = await harness.app.inject({
      method: "POST",
      url: "/api/pvp/queue",
      headers: { cookie: bCookie },
      payload: { captainId: bCaptain },
    });
    expect(secondJoin.statusCode).toBe(201);
    const matchedB = secondJoin.json() as {
      status: string;
      battleId: string;
      yourSide: "A" | "B";
    };
    expect(matchedB.status).toBe("matched");
    expect(matchedB.yourSide).toBe("B");

    const battle = await harness.battleStore.get(matchedB.battleId);
    expect(battle?.ownerUserId).toBe(aId);
    expect(battle?.participantBId).toBe(bId);

    const aStatus = await harness.app.inject({
      method: "GET",
      url: "/api/pvp/queue/status",
      headers: { cookie: aCookie },
    });
    expect(aStatus.statusCode).toBe(200);
    const aBody = aStatus.json() as { status: string; battleId: string };
    expect(aBody.status).toBe("matched");
    expect(aBody.battleId).toBe(matchedB.battleId);

    const aStatusAgain = await harness.app.inject({
      method: "GET",
      url: "/api/pvp/queue/status",
      headers: { cookie: aCookie },
    });
    expect(aStatusAgain.json().status).toBe("idle");
    await harness.app.close();
  });

  it("returns idle for users who never joined", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const { cookie } = await authedSession(harness.app);
    const status = await harness.app.inject({
      method: "GET",
      url: "/api/pvp/queue/status",
      headers: { cookie },
    });
    expect(status.json().status).toBe("idle");
    await harness.app.close();
  });

  it("rejects joining without a valid captain", async () => {
    const harness = makeApp();
    await harness.app.ready();
    const { cookie } = await authedSession(harness.app);
    const res = await harness.app.inject({
      method: "POST",
      url: "/api/pvp/queue",
      headers: { cookie },
      payload: { captainId: "cap_unknown" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "captain_not_found" });
    await harness.app.close();
  });
});
