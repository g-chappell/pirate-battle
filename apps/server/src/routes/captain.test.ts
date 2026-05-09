import { CREWS } from "@pirate-battle/content";
import { describe, expect, it } from "vitest";

import { buildServer } from "../index.js";
import { InMemoryUserStore } from "../userStore.js";
import { TEAM_SIZE } from "./captain.js";
import { SESSION_COOKIE_NAME } from "./session.js";

function makeApp() {
  const userStore = new InMemoryUserStore();
  const app = buildServer({
    sessionSecret: "test-secret-not-used-in-prod",
    userStore,
    logger: false,
  });
  return { app, userStore };
}

function extractCookieHeader(setCookieHeader: string | string[] | undefined) {
  if (!setCookieHeader) return undefined;
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
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

const SIX_KEYS = CREWS.slice(0, TEAM_SIZE).map((c) => c.templateKey);

describe("POST /api/captain", () => {
  it("creates a captain with 6 crew rows for the session user", async () => {
    const { app, userStore } = makeApp();
    await app.ready();

    const { cookieHeader, userId } = await authedCookie(app);

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

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      name: "Bonny",
      factionId: "kraken",
    });

    const me = await userStore.findById(userId);
    expect(me?.captains).toHaveLength(1);
    expect(me?.captains[0]).toMatchObject({
      id: body.id,
      name: "Bonny",
      factionId: "kraken",
    });

    const stored = userStore.getCaptain(body.id);
    expect(stored?.crews).toHaveLength(TEAM_SIZE);
    expect(stored?.crews.map((c) => c.templateKey)).toEqual(SIX_KEYS);
    for (const crew of stored?.crews ?? []) {
      expect(crew.moveKeys.length).toBeGreaterThanOrEqual(1);
    }

    await app.close();
  });

  it("returns 401 without a session cookie", async () => {
    const { app } = makeApp();
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/captain",
      payload: {
        name: "Bonny",
        factionId: "kraken",
        crewTemplateKeys: SIX_KEYS,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });

    await app.close();
  });

  it("returns 400 when team size != 6", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/captain",
      headers: { cookie: cookieHeader },
      payload: {
        name: "Bonny",
        factionId: "kraken",
        crewTemplateKeys: SIX_KEYS.slice(0, 5),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_team_size" });

    await app.close();
  });

  it("returns 400 when a templateKey is unknown", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/captain",
      headers: { cookie: cookieHeader },
      payload: {
        name: "Bonny",
        factionId: "kraken",
        crewTemplateKeys: [
          ...SIX_KEYS.slice(0, 5),
          "definitely_not_a_real_crew",
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unknown_template_key" });

    await app.close();
  });

  it("returns 400 when name is empty", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/captain",
      headers: { cookie: cookieHeader },
      payload: {
        name: "   ",
        factionId: "kraken",
        crewTemplateKeys: SIX_KEYS,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_name" });

    await app.close();
  });

  it("returns 400 when body is not an object", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/captain",
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      payload: '"just a string"',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_body" });

    await app.close();
  });
});
