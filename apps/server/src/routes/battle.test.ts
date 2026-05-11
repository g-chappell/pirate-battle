import { CREWS } from "@pirate-battle/content";
import {
  BASE_XP_PER_BATTLE,
  DEFAULT_LEVEL,
  LOSER_XP_MULTIPLIER,
  WINNER_XP_MULTIPLIER,
  type BattleState,
} from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { buildServer } from "../index.js";
import { DROP_TABLES } from "../itemDrops.js";
import { InMemoryUserStore, type CaptainTeam } from "../userStore.js";

import { computeXpAwards, grantDropsForBattleWin } from "./battle.js";
import { TEAM_SIZE } from "./captain.js";
import { SESSION_COOKIE_NAME } from "./session.js";

function makeApp(seed = 12345, now?: () => number) {
  const userStore = new InMemoryUserStore();
  const battleStore = new InMemoryBattleStore(now ? { now } : {});
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    battleStore,
    seedFactory: () => seed,
    logger: false,
  });
  return { app, userStore, battleStore };
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

async function createCaptain(app: ReturnType<typeof makeApp>["app"], cookie: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/captain",
    headers: { cookie },
    payload: {
      name: "Bonny",
      factionId: "kraken",
      crewTemplateKeys: SIX_KEYS,
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`captain create failed: ${res.statusCode} ${res.body}`);
  }
  return res.json().id as string;
}

describe("POST /api/battle/start", () => {
  it("creates a battle with the captain's team vs the AI team", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const captainId = await createCaptain(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie },
      payload: { captainId },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toEqual(expect.any(String));
    expect(body.state.turn).toBe(0);
    expect(body.state.winner).toBeNull();
    expect(body.state.activeA.maxHp).toBeGreaterThan(0);
    expect(body.state.activeB.maxHp).toBeGreaterThan(0);
    expect(body.state.benchA).toHaveLength(TEAM_SIZE - 1);
    expect(body.state.benchB).toHaveLength(TEAM_SIZE - 1);
    expect(body.state.log).toEqual([]);
    expect(body.state.rngSeed).toBe(12345);

    await app.close();
  });

  it("returns 401 without a session", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      payload: { captainId: "anything" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
    await app.close();
  });

  it("returns 400 when captainId is missing or not a string", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_captain_id" });
    await app.close();
  });

  it("returns 404 when the captain belongs to another user", async () => {
    const { app } = makeApp();
    await app.ready();

    // user 1 creates a captain
    const { cookie: cookie1 } = await authedSession(app);
    const captainId = await createCaptain(app, cookie1);

    // user 2 tries to start a battle with user 1's captain
    const { cookie: cookie2 } = await authedSession(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie: cookie2 },
      payload: { captainId },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "captain_not_found" });
    await app.close();
  });
});

describe("GET /api/battle/:id", () => {
  it("returns the current state to the owner", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const captainId = await createCaptain(app, cookie);
    const start = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie },
      payload: { captainId },
    });
    const battleId = start.json().id as string;

    const get = await app.inject({
      method: "GET",
      url: `/api/battle/${battleId}`,
      headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().id).toBe(battleId);
    expect(get.json().state.turn).toBe(0);
    await app.close();
  });

  it("returns 404 for an unknown battle id", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/battle/does_not_exist",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "battle_not_found" });
    await app.close();
  });

  it("returns 403 when fetched by another user", async () => {
    const { app } = makeApp();
    await app.ready();

    const { cookie: cookie1 } = await authedSession(app);
    const captainId = await createCaptain(app, cookie1);
    const start = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie: cookie1 },
      payload: { captainId },
    });
    const battleId = start.json().id as string;

    const { cookie: cookie2 } = await authedSession(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/battle/${battleId}`,
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
    await app.close();
  });
});

describe("POST /api/battle/:id/action", () => {
  async function startBattle(app: ReturnType<typeof makeApp>["app"], cookie: string) {
    const captainId = await createCaptain(app, cookie);
    const start = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie },
      payload: { captainId },
    });
    return start.json() as {
      id: string;
      state: BattleState;
    };
  }

  it("advances the battle by one turn with player + AI moves", async () => {
    const { app, battleStore } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const battle = await startBattle(app, cookie);

    const playerMoveKey = battle.state.activeA.moves[0]!.key;

    const res = await app.inject({
      method: "POST",
      url: `/api/battle/${battle.id}/action`,
      headers: { cookie },
      payload: { action: { type: "move", moveKey: playerMoveKey } },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(battle.id);
    expect(body.state.turn).toBe(1);
    expect(body.state.log.length).toBeGreaterThan(0);

    // Both sides should have logged at least one move-ish event this turn.
    const turnEvents = body.state.log.filter((e: { kind: string }) =>
      ["move", "miss", "stun_skip", "status_apply"].includes(e.kind),
    );
    expect(turnEvents.length).toBeGreaterThanOrEqual(1);

    // BattleStore persisted the new events.
    const events = battleStore.getEvents(battle.id);
    expect(events.length).toBe(body.state.log.length);

    await app.close();
  });

  it("returns 400 when the move is not on the active crew", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const battle = await startBattle(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/battle/${battle.id}/action`,
      headers: { cookie },
      payload: { action: { type: "move", moveKey: "definitely_not_a_move" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unknown_move" });
    await app.close();
  });

  it("returns 400 when the action is malformed", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const battle = await startBattle(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/battle/${battle.id}/action`,
      headers: { cookie },
      payload: { action: { type: "nope" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_action_type" });
    await app.close();
  });

  it("returns 400 when switching to a fainted crew", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const battle = await startBattle(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/battle/${battle.id}/action`,
      headers: { cookie },
      payload: { action: { type: "switch", targetIndex: 99 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "switch_out_of_range" });
    await app.close();
  });

  it("returns 401 without a session cookie", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const battle = await startBattle(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/battle/${battle.id}/action`,
      payload: { action: { type: "forfeit" } },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 403 when another user tries to act on someone else's battle", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie: cookie1 } = await authedSession(app);
    const battle = await startBattle(app, cookie1);

    const { cookie: cookie2 } = await authedSession(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/battle/${battle.id}/action`,
      headers: { cookie: cookie2 },
      payload: { action: { type: "forfeit" } },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 409 once the battle has ended", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const battle = await startBattle(app, cookie);

    const forfeit = await app.inject({
      method: "POST",
      url: `/api/battle/${battle.id}/action`,
      headers: { cookie },
      payload: { action: { type: "forfeit" } },
    });
    expect(forfeit.statusCode).toBe(200);
    expect(forfeit.json().state.winner).toBe("B");

    const second = await app.inject({
      method: "POST",
      url: `/api/battle/${battle.id}/action`,
      headers: { cookie },
      payload: { action: { type: "forfeit" } },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: "battle_ended" });
    await app.close();
  });

  it("does not grant any item drops on a forfeit loss", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookie, userId } = await authedSession(app);
    const captainId = await createCaptain(app, cookie);

    const start = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie },
      payload: { captainId },
    });
    const battleId = (start.json() as { id: string }).id;

    const forfeit = await app.inject({
      method: "POST",
      url: `/api/battle/${battleId}/action`,
      headers: { cookie },
      payload: { action: { type: "forfeit" } },
    });
    expect(forfeit.statusCode).toBe(200);
    expect(forfeit.json().state.winner).toBe("B");

    expect(await userStore.getInventory(userId)).toEqual([]);
    await app.close();
  });

  it("grants loser XP to every player crew on forfeit", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookie, userId } = await authedSession(app);
    const captainId = await createCaptain(app, cookie);

    const start = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie },
      payload: { captainId },
    });
    expect(start.statusCode).toBe(201);

    const before = await userStore.getCaptainTeam(userId, captainId);
    expect(before).not.toBeNull();
    for (const crew of before!.crews) {
      expect(crew.xp).toBe(0);
    }

    const forfeit = await app.inject({
      method: "POST",
      url: `/api/battle/${start.json().id}/action`,
      headers: { cookie },
      payload: { action: { type: "forfeit" } },
    });
    expect(forfeit.statusCode).toBe(200);
    expect(forfeit.json().state.winner).toBe("B");

    const after = await userStore.getCaptainTeam(userId, captainId);
    const expectedXp = Math.floor(BASE_XP_PER_BATTLE * LOSER_XP_MULTIPLIER);
    for (const crew of after!.crews) {
      expect(crew.xp).toBe(expectedXp);
    }
    await app.close();
  });

  it("is deterministic across runs with the same seed", async () => {
    async function run() {
      const { app } = makeApp(424242);
      await app.ready();
      const { cookie } = await authedSession(app);
      const battle = await startBattle(app, cookie);
      const moveKey = battle.state.activeA.moves[0]!.key;

      const res = await app.inject({
        method: "POST",
        url: `/api/battle/${battle.id}/action`,
        headers: { cookie },
        payload: { action: { type: "move", moveKey } },
      });
      await app.close();
      return res.json();
    }
    const a = await run();
    const b = await run();
    expect(b.state.log).toEqual(a.state.log);
    expect(b.state.activeB.hp).toBe(a.state.activeB.hp);
  });
});

describe("GET /api/battle/history", () => {
  async function startAndForfeit(
    app: ReturnType<typeof makeApp>["app"],
    cookie: string,
  ): Promise<string> {
    const captainId = await createCaptain(app, cookie);
    const start = await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie },
      payload: { captainId },
    });
    const battleId = start.json().id as string;
    const forfeit = await app.inject({
      method: "POST",
      url: `/api/battle/${battleId}/action`,
      headers: { cookie },
      payload: { action: { type: "forfeit" } },
    });
    if (forfeit.statusCode !== 200) {
      throw new Error(`forfeit failed: ${forfeit.statusCode} ${forfeit.body}`);
    }
    return battleId;
  }

  it("returns 401 without a session", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/battle/history" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
    await app.close();
  });

  it("returns an empty list when the user has no finished battles", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/battle/history",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ battles: [] });
    await app.close();
  });

  it("excludes in-progress battles and returns finished ones with mode + result", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const finishedId = await startAndForfeit(app, cookie);

    // also start a fresh battle that does not get finished
    const capId2 = await createCaptain(app, cookie);
    await app.inject({
      method: "POST",
      url: "/api/battle/start",
      headers: { cookie },
      payload: { captainId: capId2 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/battle/history",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { battles: unknown[] };
    expect(body.battles).toHaveLength(1);
    const row = body.battles[0] as {
      id: string;
      mode: string;
      userSide: "A" | "B";
      winner: "A" | "B";
      turn: number;
      startedAt: number;
      endedAt: number;
    };
    expect(row.id).toBe(finishedId);
    expect(row.mode).toBe("PVE");
    expect(row.userSide).toBe("A");
    expect(row.winner).toBe("B");
    expect(row.turn).toBeGreaterThanOrEqual(0);
    expect(row.endedAt).toBeGreaterThan(0);
    await app.close();
  });

  it("returns most-recent finished battles first up to the limit", async () => {
    let tick = 0;
    const { app } = makeApp(12345, () => ++tick);
    await app.ready();
    const { cookie } = await authedSession(app);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await startAndForfeit(app, cookie));
    }
    const res = await app.inject({
      method: "GET",
      url: "/api/battle/history?limit=2",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { battles: Array<{ id: string }> };
    expect(body.battles).toHaveLength(2);
    // Most-recent (last forfeited) first
    expect(body.battles[0]!.id).toBe(ids[2]);
    expect(body.battles[1]!.id).toBe(ids[1]);
    await app.close();
  });

  it("does not leak another user's battles", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie: cookie1 } = await authedSession(app);
    await startAndForfeit(app, cookie1);

    const { cookie: cookie2 } = await authedSession(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/battle/history",
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ battles: [] });
    await app.close();
  });

  it("rejects a non-numeric limit with 400", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/battle/history?limit=abc",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_limit" });
    await app.close();
  });
});

describe("grantDropsForBattleWin", () => {
  async function seedUser(): Promise<{ userStore: InMemoryUserStore; userId: string }> {
    const userStore = new InMemoryUserStore();
    const user = await userStore.createAnonymous();
    return { userStore, userId: user.id };
  }

  it("returns an empty list when every roll lands above its chance", async () => {
    const { userStore, userId } = await seedUser();
    // seed=0xffffffff yields rng.next() values >= 0.5 on early calls — enough that
    // no chance entry triggers on the easy table. We assert via observed effect.
    const drops = await grantDropsForBattleWin({
      userStore,
      userId,
      opponentLevel: 1,
      rngSeed: 0xffffffff,
    });
    expect(Array.isArray(drops)).toBe(true);
    const inventory = await userStore.getInventory(userId);
    expect(inventory.map((i) => i.qty).reduce((a, b) => a + b, 0)).toBe(drops.length);
  });

  it("only ever returns templateKeys present in the difficulty table", async () => {
    const { userStore, userId } = await seedUser();
    const allowedHard = new Set(DROP_TABLES.hard.entries.map((e) => e.templateKey));
    for (const seed of [1, 7, 42, 12345, 0xdeadbeef]) {
      const drops = await grantDropsForBattleWin({
        userStore,
        userId,
        opponentLevel: 25,
        rngSeed: seed,
      });
      for (const key of drops) expect(allowedHard.has(key)).toBe(true);
    }
  });

  it("is deterministic for the same seed + opponent level", async () => {
    const a = await seedUser();
    const dropsA = await grantDropsForBattleWin({
      userStore: a.userStore,
      userId: a.userId,
      opponentLevel: 10,
      rngSeed: 99,
    });
    const b = await seedUser();
    const dropsB = await grantDropsForBattleWin({
      userStore: b.userStore,
      userId: b.userId,
      opponentLevel: 10,
      rngSeed: 99,
    });
    expect(dropsB).toEqual(dropsA);
  });

  it("calls grantItems with qty=1 for each dropped key in order", async () => {
    const { userStore, userId } = await seedUser();
    const grantCalls: Array<{ key: string; qty: number }> = [];
    const orig = userStore.grantItems.bind(userStore);
    userStore.grantItems = async (uid, key, qty) => {
      grantCalls.push({ key, qty });
      return orig(uid, key, qty);
    };
    const drops = await grantDropsForBattleWin({
      userStore,
      userId,
      opponentLevel: 10,
      rngSeed: 17,
    });
    expect(grantCalls.map((c) => c.key)).toEqual(drops);
    expect(grantCalls.every((c) => c.qty === 1)).toBe(true);
  });
});

describe("computeXpAwards", () => {
  function teamWith(ids: Array<string | null>): CaptainTeam {
    return {
      id: "cap_x",
      name: "x",
      factionId: "kraken",
      crews: ids.map((id) => ({
        id,
        templateKey: "tide_brawler",
        moveKeys: ["tide_surge"],
        level: DEFAULT_LEVEL,
        xp: 0,
        attrs: null,
      })),
    };
  }

  it("awards winner-multiplier XP to every crew with an id", () => {
    const team = teamWith(["c1", "c2", "c3"]);
    const awards = computeXpAwards({ team, playerWon: true });
    const expected = Math.floor(BASE_XP_PER_BATTLE * WINNER_XP_MULTIPLIER);
    expect(awards).toEqual([
      { crewId: "c1", xpGain: expected },
      { crewId: "c2", xpGain: expected },
      { crewId: "c3", xpGain: expected },
    ]);
  });

  it("awards loser-multiplier XP on loss", () => {
    const team = teamWith(["c1"]);
    const awards = computeXpAwards({ team, playerWon: false });
    expect(awards[0]!.xpGain).toBe(Math.floor(BASE_XP_PER_BATTLE * LOSER_XP_MULTIPLIER));
  });

  it("skips crews without a persisted id", () => {
    const team = teamWith(["c1", null, "c3"]);
    const awards = computeXpAwards({ team, playerWon: true });
    expect(awards.map((a) => a.crewId)).toEqual(["c1", "c3"]);
  });

  it("scales by opponent level when provided", () => {
    const team = teamWith(["c1"]);
    const lowOpp = computeXpAwards({
      team,
      playerWon: true,
      opponentLevel: DEFAULT_LEVEL / 2,
    });
    const highOpp = computeXpAwards({
      team,
      playerWon: true,
      opponentLevel: DEFAULT_LEVEL * 2,
    });
    expect(highOpp[0]!.xpGain).toBe(lowOpp[0]!.xpGain * 4);
  });
});
