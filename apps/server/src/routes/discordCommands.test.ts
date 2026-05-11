import { CREWS } from "@pirate-battle/content";
import type { BattleState, CrewSnapshot, MoveDef } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { buildServer } from "../index.js";
import { InMemoryUserStore } from "../userStore.js";

import { TEAM_SIZE } from "./captain.js";

const SIX_KEYS = CREWS.slice(0, TEAM_SIZE).map((c) => c.templateKey);

const MOVE: MoveDef = {
  key: "tackle",
  name: "Tackle",
  affinity: "kraken",
  basePower: 30,
  accuracy: 100,
  kind: "damage",
};

function crew(templateKey: string, hp = 100): CrewSnapshot {
  return {
    templateKey,
    hp,
    maxHp: 100,
    atk: 50,
    def: 50,
    spd: 50,
    level: 5,
    affinity: "kraken",
    statuses: [],
    moves: [MOVE],
  };
}

interface Harness {
  app: ReturnType<typeof buildServer>;
  userStore: InMemoryUserStore;
  battleStore: InMemoryBattleStore;
}

function makeApp(seed = 12345): Harness {
  const userStore = new InMemoryUserStore();
  const battleStore = new InMemoryBattleStore();
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    battleStore,
    seedFactory: () => seed,
    logger: false,
  });
  return { app, userStore, battleStore };
}

async function seedLinkedUser(
  h: Harness,
  discordUserId: string,
): Promise<{ userId: string; captainId: string }> {
  const user = await h.userStore.createAnonymous();
  const set = await h.userStore.setDiscordUserId(user.id, discordUserId);
  if (!set.ok) throw new Error(`setDiscordUserId failed: ${set.reason}`);
  const captain = await h.userStore.createCaptain(user.id, {
    name: "Bonny",
    factionId: "kraken",
    crews: SIX_KEYS.map((templateKey) => ({
      templateKey,
      moveKeys: CREWS.find((c) => c.templateKey === templateKey)!.moveKeys,
    })),
  });
  if (!captain) throw new Error("captain create failed");
  return { userId: user.id, captainId: captain.id };
}

async function seedFinishedBattle(opts: {
  store: InMemoryBattleStore;
  userId: string;
  captainId: string | null;
  winner: "A" | "B";
  turn?: number;
}) {
  const initialState: BattleState = {
    turn: 0,
    activeA: crew("hero"),
    activeB: crew("foe"),
    benchA: [],
    benchB: [],
    log: [],
    rngSeed: 1,
    rngState: 1,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
  };
  const created = await opts.store.create({
    ownerUserId: opts.userId,
    captainId: opts.captainId,
    state: initialState,
  });
  const finalState: BattleState = {
    ...initialState,
    turn: opts.turn ?? 1,
    winner: opts.winner,
  };
  await opts.store.recordTurn(created.id, finalState, []);
  return created.id;
}

describe("GET /api/discord/me", () => {
  it("returns 400 when discordUserId is missing", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({ method: "GET", url: "/api/discord/me" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_discord_user_id" });
    await h.app.close();
  });

  it("returns 400 when discordUserId is non-numeric", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/me?discordUserId=not-a-number",
    });
    expect(res.statusCode).toBe(400);
    await h.app.close();
  });

  it("returns 404 when the discord user is not linked", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/me?discordUserId=11111111",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_linked" });
    await h.app.close();
  });

  it("returns the linked user with captain summaries", async () => {
    const h = makeApp();
    await h.app.ready();
    await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/me?discordUserId=55512",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toEqual(expect.any(String));
    expect(body.user.captains).toHaveLength(1);
    expect(body.user.captains[0]).toMatchObject({
      name: "Bonny",
      factionId: "kraken",
    });
    await h.app.close();
  });
});

describe("GET /api/discord/team", () => {
  it("returns 400 when captainId is missing", async () => {
    const h = makeApp();
    await h.app.ready();
    await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/team?discordUserId=55512",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_captain_id" });
    await h.app.close();
  });

  it("returns 404 when discord user not linked", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/team?discordUserId=55512&captainId=anything",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_linked" });
    await h.app.close();
  });

  it("returns 404 when captain does not belong to the user", async () => {
    const h = makeApp();
    await h.app.ready();
    await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/team?discordUserId=55512&captainId=other-captain",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "captain_not_found" });
    await h.app.close();
  });

  it("returns the captain's crew roster", async () => {
    const h = makeApp();
    await h.app.ready();
    const { captainId } = await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "GET",
      url: `/api/discord/team?discordUserId=55512&captainId=${captainId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.captain.id).toBe(captainId);
    expect(body.captain.name).toBe("Bonny");
    expect(body.captain.crews).toHaveLength(TEAM_SIZE);
    expect(body.captain.crews[0]).toMatchObject({
      templateKey: expect.any(String),
      level: expect.any(Number),
      moveKeys: expect.any(Array),
    });
    await h.app.close();
  });
});

describe("POST /api/discord/battle", () => {
  it("returns 400 when opponent is not 'ai'", async () => {
    const h = makeApp();
    await h.app.ready();
    const { captainId } = await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle",
      payload: { discordUserId: "55512", captainId, opponent: "human" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unsupported_opponent" });
    await h.app.close();
  });

  it("returns 404 when discord user not linked", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle",
      payload: { discordUserId: "55512", captainId: "anything", opponent: "ai" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_linked" });
    await h.app.close();
  });

  it("creates a battle and returns the initial state + captain name", async () => {
    const h = makeApp();
    await h.app.ready();
    const { captainId } = await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle",
      payload: { discordUserId: "55512", captainId, opponent: "ai" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toEqual(expect.any(String));
    expect(body.captainName).toBe("Bonny");
    expect(body.state.turn).toBe(0);
    expect(body.state.winner).toBeNull();
    expect(body.state.activeA.maxHp).toBeGreaterThan(0);
    expect(body.state.activeB.maxHp).toBeGreaterThan(0);
    expect(body.state.benchA).toHaveLength(TEAM_SIZE - 1);
    expect(body.state.benchB).toHaveLength(TEAM_SIZE - 1);
    await h.app.close();
  });
});

describe("GET /api/discord/stats", () => {
  it("returns 404 when caller is not linked", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/stats?discordUserId=55512",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_linked" });
    await h.app.close();
  });

  it("returns zero stats when the user has no battles", async () => {
    const h = makeApp();
    await h.app.ready();
    await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/stats?discordUserId=55512",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: { totalBattles: 0, wins: 0, losses: 0, winRate: 0, avgTurns: 0 },
      discordUserId: "55512",
    });
    await h.app.close();
  });

  it("aggregates the caller's own wins/losses when no target is given", async () => {
    const h = makeApp();
    await h.app.ready();
    const { userId } = await seedLinkedUser(h, "55512");
    await seedFinishedBattle({
      store: h.battleStore,
      userId,
      captainId: null,
      winner: "A",
      turn: 4,
    });
    await seedFinishedBattle({
      store: h.battleStore,
      userId,
      captainId: null,
      winner: "B",
      turn: 6,
    });
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/stats?discordUserId=55512",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.totalBattles).toBe(2);
    expect(body.user.wins).toBe(1);
    expect(body.user.losses).toBe(1);
    expect(body.user.avgTurns).toBeCloseTo(5, 6);
    await h.app.close();
  });

  it("returns the target user's stats when targetDiscordUserId is provided", async () => {
    const h = makeApp();
    await h.app.ready();
    await seedLinkedUser(h, "55512");
    const target = await seedLinkedUser(h, "99999");
    await seedFinishedBattle({
      store: h.battleStore,
      userId: target.userId,
      captainId: null,
      winner: "A",
    });
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/stats?discordUserId=55512&targetDiscordUserId=99999",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { totalBattles: 1, wins: 1, losses: 0 },
      discordUserId: "99999",
    });
    await h.app.close();
  });

  it("returns 404 target_not_linked when the target Discord user is not linked", async () => {
    const h = makeApp();
    await h.app.ready();
    await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/stats?discordUserId=55512&targetDiscordUserId=99999",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "target_not_linked" });
    await h.app.close();
  });
});

async function startBattleFor(h: Harness, discordUserId: string, captainId: string) {
  const res = await h.app.inject({
    method: "POST",
    url: "/api/discord/battle",
    payload: { discordUserId, captainId, opponent: "ai" },
  });
  if (res.statusCode !== 201) {
    throw new Error(`battle start failed: ${res.statusCode} ${res.body}`);
  }
  return res.json() as { id: string; state: BattleState; captainName: string };
}

describe("GET /api/discord/battle/active", () => {
  it("returns 400 when discordUserId is missing", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({ method: "GET", url: "/api/discord/battle/active" });
    expect(res.statusCode).toBe(400);
    await h.app.close();
  });

  it("returns 404 when the discord user is not linked", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/battle/active?discordUserId=55512",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_linked" });
    await h.app.close();
  });

  it("returns 404 no_active_battle when the user has no in-progress PvE", async () => {
    const h = makeApp();
    await h.app.ready();
    await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/battle/active?discordUserId=55512",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "no_active_battle" });
    await h.app.close();
  });

  it("returns the latest in-progress PvE battle", async () => {
    const h = makeApp();
    await h.app.ready();
    const { captainId } = await seedLinkedUser(h, "55512");
    const started = await startBattleFor(h, "55512", captainId);
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/battle/active?discordUserId=55512",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(started.id);
    expect(body.state.winner).toBeNull();
    await h.app.close();
  });

  it("does not return finished battles", async () => {
    const h = makeApp();
    await h.app.ready();
    const { userId } = await seedLinkedUser(h, "55512");
    await seedFinishedBattle({
      store: h.battleStore,
      userId,
      captainId: null,
      winner: "A",
    });
    const res = await h.app.inject({
      method: "GET",
      url: "/api/discord/battle/active?discordUserId=55512",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "no_active_battle" });
    await h.app.close();
  });
});

describe("POST /api/discord/battle/action", () => {
  it("returns 400 when discordUserId is missing", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle/action",
      payload: { action: { type: "forfeit" } },
    });
    expect(res.statusCode).toBe(400);
    await h.app.close();
  });

  it("returns 404 not_linked for an unlinked user", async () => {
    const h = makeApp();
    await h.app.ready();
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle/action",
      payload: { discordUserId: "55512", action: { type: "forfeit" } },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_linked" });
    await h.app.close();
  });

  it("returns 404 no_active_battle when the user has none", async () => {
    const h = makeApp();
    await h.app.ready();
    await seedLinkedUser(h, "55512");
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle/action",
      payload: { discordUserId: "55512", action: { type: "forfeit" } },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "no_active_battle" });
    await h.app.close();
  });

  it("returns 400 when the action shape is invalid", async () => {
    const h = makeApp();
    await h.app.ready();
    const { captainId } = await seedLinkedUser(h, "55512");
    await startBattleFor(h, "55512", captainId);
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle/action",
      payload: { discordUserId: "55512", action: { type: "nope" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_action_type" });
    await h.app.close();
  });

  it("returns 400 unknown_move when the active crew doesn't know the move", async () => {
    const h = makeApp();
    await h.app.ready();
    const { captainId } = await seedLinkedUser(h, "55512");
    await startBattleFor(h, "55512", captainId);
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle/action",
      payload: {
        discordUserId: "55512",
        action: { type: "move", moveKey: "definitely_not_a_move" },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unknown_move" });
    await h.app.close();
  });

  it("ends the battle on forfeit and clears the active battle", async () => {
    const h = makeApp();
    await h.app.ready();
    const { captainId } = await seedLinkedUser(h, "55512");
    await startBattleFor(h, "55512", captainId);
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle/action",
      payload: { discordUserId: "55512", action: { type: "forfeit" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state.winner).toBe("B");

    const after = await h.app.inject({
      method: "GET",
      url: "/api/discord/battle/active?discordUserId=55512",
    });
    expect(after.statusCode).toBe(404);
    expect(after.json()).toEqual({ error: "no_active_battle" });
    await h.app.close();
  });

  it("returns 409 battle_ended when acting on a finished battle", async () => {
    const h = makeApp();
    await h.app.ready();
    const { captainId } = await seedLinkedUser(h, "55512");
    await startBattleFor(h, "55512", captainId);
    await h.app.inject({
      method: "POST",
      url: "/api/discord/battle/action",
      payload: { discordUserId: "55512", action: { type: "forfeit" } },
    });
    // a fresh action attempt finds no active battle now
    const res = await h.app.inject({
      method: "POST",
      url: "/api/discord/battle/action",
      payload: { discordUserId: "55512", action: { type: "forfeit" } },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "no_active_battle" });
    await h.app.close();
  });
});
