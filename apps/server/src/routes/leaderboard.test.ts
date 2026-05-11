import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { buildServer } from "../index.js";
import { InMemorySeasonStore } from "../seasonStore.js";
import { InMemoryUserStore } from "../userStore.js";

const MAY_2026 = Date.UTC(2026, 4, 1);
const JUNE_2026 = Date.UTC(2026, 5, 1);

function makeApp() {
  const seasonStore = new InMemorySeasonStore();
  const app = buildServer({
    sessionSecret: "test-secret",
    userStore: new InMemoryUserStore(),
    battleStore: new InMemoryBattleStore(),
    seasonStore,
    logger: false,
  });
  return { app, seasonStore };
}

describe("GET /api/leaderboard/:seasonId", () => {
  it("returns 404 when the season is unknown", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/leaderboard/no_such_season" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "season_not_found" });
    await app.close();
  });

  it("returns leaderboard entries sorted by ELO desc with rank", async () => {
    const { app, seasonStore } = makeApp();
    const season = await seasonStore.open({
      name: "2026-05",
      startsAt: MAY_2026,
      endsAt: JUNE_2026,
    });
    await seasonStore.applyMatchResult({
      seasonId: season.id,
      winnerUserId: "u_a",
      loserUserId: "u_b",
    });
    await seasonStore.applyMatchResult({
      seasonId: season.id,
      winnerUserId: "u_a",
      loserUserId: "u_c",
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: `/api/leaderboard/${season.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      season: { id: string; name: string };
      entries: { userId: string; rank: number; elo: number }[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.season.id).toBe(season.id);
    expect(body.entries[0]!.userId).toBe("u_a");
    expect(body.entries[0]!.rank).toBe(1);
    expect(body.total).toBe(3);
    await app.close();
  });

  it("honours limit and offset query params", async () => {
    const { app, seasonStore } = makeApp();
    const season = await seasonStore.open({
      name: "2026-05",
      startsAt: MAY_2026,
      endsAt: JUNE_2026,
    });
    for (let i = 0; i < 4; i++) {
      await seasonStore.applyMatchResult({
        seasonId: season.id,
        winnerUserId: `u_${i}`,
        loserUserId: "u_loser",
      });
    }
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/leaderboard/${season.id}?limit=2&offset=1`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      entries: { rank: number }[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0]!.rank).toBe(2);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(1);
    expect(body.total).toBe(5);
    await app.close();
  });

  it("clamps oversized limit", async () => {
    const { app, seasonStore } = makeApp();
    const season = await seasonStore.open({
      name: "S",
      startsAt: MAY_2026,
      endsAt: JUNE_2026,
    });
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/leaderboard/${season.id}?limit=9999`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { limit: number };
    expect(body.limit).toBe(100);
    await app.close();
  });
});

describe("GET /api/seasons/current", () => {
  it("returns 404 when no season is active", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/seasons/current" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "no_active_season" });
    await app.close();
  });

  it("returns the active season payload", async () => {
    const { app, seasonStore } = makeApp();
    const season = await seasonStore.open({
      name: "2026-05",
      startsAt: 0,
      endsAt: Date.now() + 86_400_000,
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/seasons/current" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: season.id,
      name: season.name,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
    });
    await app.close();
  });
});
