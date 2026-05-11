import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "./battleStore.js";
import { InMemoryUserStore } from "./userStore.js";

import { buildServer } from "./index.js";

let webDistPath: string;

beforeEach(() => {
  webDistPath = mkdtempSync(join(tmpdir(), "pb-web-dist-"));
  writeFileSync(join(webDistPath, "index.html"), "<!doctype html><title>pb</title>");
  mkdirSync(join(webDistPath, "assets"));
  writeFileSync(join(webDistPath, "assets", "app.js"), "console.log('hi');");
});

afterEach(() => {
  rmSync(webDistPath, { recursive: true, force: true });
});

function makeApp() {
  return buildServer({
    sessionSecret: "test-secret",
    userStore: new InMemoryUserStore(),
    battleStore: new InMemoryBattleStore(),
    webDistPath,
    logger: false,
  });
}

describe("static web serving", () => {
  it("serves index.html at /", async () => {
    const app = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/",
      headers: { accept: "text/html" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<!doctype html>");
  });

  it("serves hashed assets from /assets/", async () => {
    const app = makeApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/assets/app.js" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("console.log");
  });

  it("falls back to index.html for unknown SPA routes (HTML accept)", async () => {
    const app = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/team-builder",
      headers: { accept: "text/html" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<!doctype html>");
  });

  it("returns JSON 404 for unknown /api/* routes", async () => {
    const app = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/no-such-endpoint",
      headers: { accept: "text/html,application/json" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toMatchObject({ statusCode: 404, error: "Not Found" });
  });

  it("returns JSON 404 for non-GET on unknown route", async () => {
    const app = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/not-a-route",
      headers: { accept: "text/html" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("returns JSON 404 when client doesn't ask for HTML", async () => {
    const app = makeApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/something",
      headers: { accept: "application/json" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("does not interfere with /health", async () => {
    const app = makeApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("does not interfere with API routes", async () => {
    const app = makeApp();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/session/anonymous" });
    expect(res.statusCode).toBe(201);
  });
});

describe("buildServer without webDistPath", () => {
  it("returns Fastify default 404 when no static config", async () => {
    const app = buildServer({
      sessionSecret: "test-secret",
      userStore: new InMemoryUserStore(),
      battleStore: new InMemoryBattleStore(),
      logger: false,
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(404);
  });
});
