import { CREWS, TRAINING_CHIP_KEY } from "@pirate-battle/content";
import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { buildServer } from "../index.js";
import { InMemoryUserStore } from "../userStore.js";

import { TEAM_SIZE } from "./captain.js";
import { SESSION_COOKIE_NAME } from "./session.js";

const SIX_KEYS = CREWS.slice(0, TEAM_SIZE).map((c) => c.templateKey);

function makeApp() {
  const userStore = new InMemoryUserStore();
  const battleStore = new InMemoryBattleStore();
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    battleStore,
    logger: false,
  });
  return { app, userStore };
}

function extractCookieHeader(setCookieHeader: string | string[] | undefined) {
  if (!setCookieHeader) return undefined;
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const target = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!target) return undefined;
  return target.split(";")[0];
}

async function authedCookie(app: ReturnType<typeof makeApp>["app"]) {
  const create = await app.inject({
    method: "POST",
    url: "/api/session/anonymous",
  });
  const cookieHeader = extractCookieHeader(create.headers["set-cookie"]);
  if (!cookieHeader) throw new Error("session cookie not set");
  return { cookieHeader, userId: create.json().id as string };
}

async function setupCaptain(app: ReturnType<typeof makeApp>["app"], cookieHeader: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/captain",
    headers: { cookie: cookieHeader },
    payload: {
      name: "Bonny",
      factionId: "kraken",
      crewTemplateKeys: SIX_KEYS,
    },
  });
  return res.json() as { id: string };
}

describe("GET /api/captain/:captainId/team", () => {
  it("returns crews and inventory for the owning user", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader, userId } = await authedCookie(app);
    const captain = await setupCaptain(app, cookieHeader);
    await userStore.grantItems(userId, TRAINING_CHIP_KEY, 3);

    const res = await app.inject({
      method: "GET",
      url: `/api/captain/${captain.id}/team`,
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.captainId).toBe(captain.id);
    expect(body.crews).toHaveLength(TEAM_SIZE);
    expect(body.inventory).toEqual([{ templateKey: TRAINING_CHIP_KEY, qty: 3 }]);

    await app.close();
  });

  it("returns 401 without a session cookie", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/captain/anything/team",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 404 when captain is not owned by user", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);
    const captain = await setupCaptain(app, cookieHeader);

    // Different session
    const other = await authedCookie(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/captain/${captain.id}/team`,
      headers: { cookie: other.cookieHeader },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "captain_not_found" });
    await app.close();
  });
});

describe("POST /api/captain/:captainId/crew/:crewId/train", () => {
  it("trains a stat, decrements chip qty, returns updated crew", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader, userId } = await authedCookie(app);
    const captain = await setupCaptain(app, cookieHeader);
    await userStore.grantItems(userId, TRAINING_CHIP_KEY, 2);

    const team = userStore.getCaptain(captain.id)!;
    const crewId = team.crews[0]!.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/captain/${captain.id}/crew/${crewId}/train`,
      headers: { cookie: cookieHeader },
      payload: { stat: "atk" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.crew.attrs).toEqual({ atk: 1 });
    expect(body.remainingChips).toBe(1);

    await app.close();
  });

  it("returns 409 no_chips when inventory is empty", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);
    const captain = await setupCaptain(app, cookieHeader);
    const team = userStore.getCaptain(captain.id)!;
    const crewId = team.crews[0]!.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/captain/${captain.id}/crew/${crewId}/train`,
      headers: { cookie: cookieHeader },
      payload: { stat: "atk" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "no_chips" });

    await app.close();
  });

  it("returns 400 for invalid stat", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader, userId } = await authedCookie(app);
    const captain = await setupCaptain(app, cookieHeader);
    await userStore.grantItems(userId, TRAINING_CHIP_KEY, 1);
    const team = userStore.getCaptain(captain.id)!;
    const crewId = team.crews[0]!.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/captain/${captain.id}/crew/${crewId}/train`,
      headers: { cookie: cookieHeader },
      payload: { stat: "hp" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_stat" });
    await app.close();
  });

  it("returns 404 cross-user training attempt", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);
    const captain = await setupCaptain(app, cookieHeader);
    const team = userStore.getCaptain(captain.id)!;
    const crewId = team.crews[0]!.id;

    const other = await authedCookie(app);
    await userStore.grantItems(other.userId, TRAINING_CHIP_KEY, 1);
    const res = await app.inject({
      method: "POST",
      url: `/api/captain/${captain.id}/crew/${crewId}/train`,
      headers: { cookie: other.cookieHeader },
      payload: { stat: "atk" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    await app.close();
  });

  it("returns 409 at_cap once the 20% bound is hit", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader, userId } = await authedCookie(app);
    const captain = await setupCaptain(app, cookieHeader);
    await userStore.grantItems(userId, TRAINING_CHIP_KEY, 30);
    const team = userStore.getCaptain(captain.id)!;
    const crewId = team.crews[0]!.id;

    // First crew is tide_brawler, base atk=60, cap=+12 → 12 successful trains.
    for (let i = 0; i < 12; i++) {
      const r = await app.inject({
        method: "POST",
        url: `/api/captain/${captain.id}/crew/${crewId}/train`,
        headers: { cookie: cookieHeader },
        payload: { stat: "atk" },
      });
      expect(r.statusCode).toBe(200);
    }
    const overflow = await app.inject({
      method: "POST",
      url: `/api/captain/${captain.id}/crew/${crewId}/train`,
      headers: { cookie: cookieHeader },
      payload: { stat: "atk" },
    });
    expect(overflow.statusCode).toBe(409);
    expect(overflow.json()).toEqual({ error: "at_cap" });

    await app.close();
  });
});
