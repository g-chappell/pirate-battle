import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "../battleStore.js";
import { buildServer } from "../index.js";
import { InMemoryUserStore } from "../userStore.js";
import { SESSION_COOKIE_NAME } from "./session.js";

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
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  const target = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!target) return undefined;
  return target.split(";")[0];
}

describe("session routes", () => {
  it("POST /api/session/anonymous creates user and sets signed cookie", async () => {
    const { app, userStore } = makeApp();
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/session/anonymous",
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      stakeAddr: null,
      captains: [],
    });

    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieHeader = extractCookieHeader(setCookie);
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toMatch(/^pb_session=/);
    expect(cookieHeader).not.toBe(`${SESSION_COOKIE_NAME}=${body.id}`);

    const stored = await userStore.findById(body.id);
    expect(stored).not.toBeNull();

    await app.close();
  });

  it("GET /me returns 401 when no cookie is sent", async () => {
    const { app } = makeApp();
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });

    await app.close();
  });

  it("GET /me returns 401 when cookie has invalid signature", async () => {
    const { app } = makeApp();
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { cookie: `${SESSION_COOKIE_NAME}=tampered.signature` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_session" });

    await app.close();
  });

  it("GET /me returns 401 when cookie is unsigned", async () => {
    const { app, userStore } = makeApp();
    await app.ready();

    const created = await userStore.createAnonymous();
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${created.id}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_session" });

    await app.close();
  });

  it("GET /me returns the user after a session is created", async () => {
    const { app } = makeApp();
    await app.ready();

    const create = await app.inject({
      method: "POST",
      url: "/api/session/anonymous",
    });
    const cookieHeader = extractCookieHeader(create.headers["set-cookie"]);
    expect(cookieHeader).toBeDefined();

    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { cookie: cookieHeader! },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(create.json());

    await app.close();
  });

  it("GET /me returns 401 when user no longer exists", async () => {
    const { app, userStore } = makeApp();
    await app.ready();

    const create = await app.inject({
      method: "POST",
      url: "/api/session/anonymous",
    });
    const cookieHeader = extractCookieHeader(create.headers["set-cookie"]);
    expect(cookieHeader).toBeDefined();

    const body = create.json();
    (userStore as unknown as { users: Map<string, unknown> }).users.delete(
      body.id,
    );

    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { cookie: cookieHeader! },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "user_not_found" });

    await app.close();
  });
});
