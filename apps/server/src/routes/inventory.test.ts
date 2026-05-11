import { MINOR_POTION_KEY, TRAINING_CHIP_KEY } from "@pirate-battle/content";
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

describe("GET /api/inventory", () => {
  it("returns 401 without a session cookie", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/inventory" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns an empty list when the user has no items", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/inventory",
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ inventory: [] });
    await app.close();
  });

  it("returns granted items keyed by templateKey", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader, userId } = await authedCookie(app);
    await userStore.grantItems(userId, TRAINING_CHIP_KEY, 2);
    await userStore.grantItems(userId, MINOR_POTION_KEY, 1);
    const res = await app.inject({
      method: "GET",
      url: "/api/inventory",
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      inventory: [
        { templateKey: MINOR_POTION_KEY, qty: 1 },
        { templateKey: TRAINING_CHIP_KEY, qty: 2 },
      ],
    });
    await app.close();
  });
});

describe("POST /api/item/apply", () => {
  it("returns 401 without a session cookie", async () => {
    const { app } = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/item/apply",
      payload: { templateKey: MINOR_POTION_KEY },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 when templateKey is missing", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/item/apply",
      headers: { cookie: cookieHeader },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_template_key" });
    await app.close();
  });

  it("returns 400 when templateKey is unknown", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/item/apply",
      headers: { cookie: cookieHeader },
      payload: { templateKey: "not-a-real-item" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unknown_item" });
    await app.close();
  });

  it("rejects training-chip with use_training_endpoint", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader, userId } = await authedCookie(app);
    await userStore.grantItems(userId, TRAINING_CHIP_KEY, 3);
    const res = await app.inject({
      method: "POST",
      url: "/api/item/apply",
      headers: { cookie: cookieHeader },
      payload: { templateKey: TRAINING_CHIP_KEY },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "use_training_endpoint" });
    const inv = await userStore.getInventory(userId);
    expect(inv).toEqual([{ templateKey: TRAINING_CHIP_KEY, qty: 3 }]);
    await app.close();
  });

  it("returns 404 when applying an item the user does not own", async () => {
    const { app } = makeApp();
    await app.ready();
    const { cookieHeader } = await authedCookie(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/item/apply",
      headers: { cookie: cookieHeader },
      payload: { templateKey: MINOR_POTION_KEY },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    await app.close();
  });

  it("decrements qty on successful apply and reports remaining count", async () => {
    const { app, userStore } = makeApp();
    await app.ready();
    const { cookieHeader, userId } = await authedCookie(app);
    await userStore.grantItems(userId, MINOR_POTION_KEY, 2);
    const res = await app.inject({
      method: "POST",
      url: "/api/item/apply",
      headers: { cookie: cookieHeader },
      payload: { templateKey: MINOR_POTION_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      templateKey: MINOR_POTION_KEY,
      applied: true,
      remaining: 1,
    });
    const inv = await userStore.getInventory(userId);
    expect(inv).toEqual([{ templateKey: MINOR_POTION_KEY, qty: 1 }]);
    await app.close();
  });
});
