import { CREWS } from "@pirate-battle/content";
import type { BattleEvent, BattleState, CrewSnapshot, MoveDef } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { buildServer } from "../index.js";
import { InMemoryUserStore } from "../userStore.js";

import { TEAM_SIZE } from "./captain.js";
import { SESSION_COOKIE_NAME } from "./session.js";

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

function makeApp(opts: { now?: () => number } = {}) {
  const userStore = new InMemoryUserStore();
  const battleStore = new InMemoryBattleStore(opts.now ? { now: opts.now } : {});
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    battleStore,
    seedFactory: () => 1,
    nowFn: opts.now,
    logger: false,
  });
  return { app, userStore, battleStore };
}

function extractCookieHeader(setCookieHeader: string | string[] | undefined) {
  if (!setCookieHeader) return undefined;
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const target = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return target ? target.split(";")[0] : undefined;
}

async function authedSession(app: ReturnType<typeof makeApp>["app"]) {
  const create = await app.inject({ method: "POST", url: "/api/session/anonymous" });
  const cookie = extractCookieHeader(create.headers["set-cookie"]);
  if (!cookie) throw new Error("no cookie");
  return { cookie, userId: create.json().id as string };
}

async function createCaptain(app: ReturnType<typeof makeApp>["app"], cookie: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/captain",
    headers: { cookie },
    payload: { name: "Bonny", factionId: "kraken", crewTemplateKeys: SIX_KEYS },
  });
  if (res.statusCode !== 201) {
    throw new Error(`captain create failed: ${res.statusCode} ${res.body}`);
  }
  return res.json().id as string;
}

async function seedFinishedBattle(opts: {
  store: InMemoryBattleStore;
  userId: string;
  captainId: string | null;
  winner: "A" | "B";
  teamA: CrewSnapshot[];
  teamB: CrewSnapshot[];
  events?: BattleEvent[];
  turn?: number;
}) {
  const initialState: BattleState = {
    turn: 0,
    activeA: opts.teamA[0]!,
    activeB: opts.teamB[0]!,
    benchA: opts.teamA.slice(1),
    benchB: opts.teamB.slice(1),
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
  const events = opts.events ?? [];
  const finalState: BattleState = {
    ...initialState,
    turn: opts.turn ?? events.length,
    winner: opts.winner,
    log: [...initialState.log, ...events],
  };
  await opts.store.recordTurn(created.id, finalState, events);
  return created.id;
}

describe("GET /api/stats", () => {
  it("returns 401 without a session", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/stats" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns zero stats for a user with no battles", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const res = await app.inject({ method: "GET", url: "/api/stats", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: { totalBattles: 0, wins: 0, losses: 0, winRate: 0, avgTurns: 0 },
      crew: null,
    });
    await app.close();
  });

  it("aggregates wins, losses, and win rate across finished battles", async () => {
    const { app, battleStore } = makeApp();
    await app.ready();
    const { cookie, userId } = await authedSession(app);

    await seedFinishedBattle({
      store: battleStore,
      userId,
      captainId: null,
      winner: "A",
      teamA: [crew("hero")],
      teamB: [crew("foe", 0)],
      turn: 4,
    });
    await seedFinishedBattle({
      store: battleStore,
      userId,
      captainId: null,
      winner: "B",
      teamA: [crew("hero", 0)],
      teamB: [crew("foe")],
      turn: 8,
    });

    const res = await app.inject({ method: "GET", url: "/api/stats", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.totalBattles).toBe(2);
    expect(body.user.wins).toBe(1);
    expect(body.user.losses).toBe(1);
    expect(body.user.winRate).toBeCloseTo(0.5, 6);
    expect(body.user.avgTurns).toBeCloseTo(6, 6);
    expect(body.crew).toBeNull();
    await app.close();
  });

  it("returns 404 when crewId does not belong to the user", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookie } = await authedSession(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/stats?crewId=does_not_exist",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "crew_not_found" });
    await app.close();
  });

  it("returns crew-specific stats when crewId is provided", async () => {
    const { app, userStore, battleStore } = makeApp();
    await app.ready();
    const { cookie, userId } = await authedSession(app);
    const captainId = await createCaptain(app, cookie);

    const team = await userStore.getCaptainTeam(userId, captainId);
    if (!team) throw new Error("team missing");
    const targetCrew = team.crews[0];
    if (!targetCrew || !targetCrew.id) throw new Error("crew missing id");

    const events: BattleEvent[] = [
      { kind: "faint", side: "B" },
      { kind: "faint", side: "B" },
      { kind: "faint", side: "A" },
    ];
    await seedFinishedBattle({
      store: battleStore,
      userId,
      captainId,
      winner: "A",
      teamA: [crew(targetCrew.templateKey), crew("ally")],
      teamB: [crew("foe", 0), crew("foe2", 0)],
      events,
      turn: 6,
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/stats?crewId=${targetCrew.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.crew).toEqual({
      templateKey: targetCrew.templateKey,
      participated: 1,
      wins: 1,
      losses: 0,
      finishingBlows: 1,
      deaths: 0,
      teamKills: 2,
      teamDeaths: 1,
    });
    expect(body.user.wins).toBe(1);
    await app.close();
  });

  it("caches results for 60 seconds per (userId, crewId)", async () => {
    let now = 1_000_000;
    const { app, battleStore } = makeApp({ now: () => now });
    await app.ready();
    const { cookie, userId } = await authedSession(app);

    await seedFinishedBattle({
      store: battleStore,
      userId,
      captainId: null,
      winner: "A",
      teamA: [crew("hero")],
      teamB: [crew("foe", 0)],
    });

    const first = await app.inject({ method: "GET", url: "/api/stats", headers: { cookie } });
    expect(first.json().user.wins).toBe(1);

    // Second battle is finished after the first query — should NOT show up while cache is warm.
    await seedFinishedBattle({
      store: battleStore,
      userId,
      captainId: null,
      winner: "A",
      teamA: [crew("hero")],
      teamB: [crew("foe", 0)],
    });
    now += 30_000;
    const cached = await app.inject({ method: "GET", url: "/api/stats", headers: { cookie } });
    expect(cached.json().user.wins).toBe(1);

    now += 31_000;
    const refreshed = await app.inject({ method: "GET", url: "/api/stats", headers: { cookie } });
    expect(refreshed.json().user.wins).toBe(2);

    await app.close();
  });
});
