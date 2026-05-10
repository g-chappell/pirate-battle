import { describe, expect, it } from "vitest";

import { InMemoryDiscordLinkTokenStore } from "./discordLinkStore.js";

describe("InMemoryDiscordLinkTokenStore", () => {
  it("issues tokens with the configured TTL bound to a userId", async () => {
    const store = new InMemoryDiscordLinkTokenStore({
      ttlMs: 60_000,
      randomFn: () => "tok-1",
      nowFn: () => 10_000,
    });
    const record = await store.issue("user-1");
    expect(record.token).toBe("tok-1");
    expect(record.userId).toBe("user-1");
    expect(record.expiresAt).toBe(70_000);
    expect(record.usedAt).toBeNull();
  });

  it("uses cryptographically random tokens by default", async () => {
    const store = new InMemoryDiscordLinkTokenStore();
    const a = await store.issue("user-1");
    const b = await store.issue("user-2");
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[0-9a-f]{48}$/);
  });

  it("consume returns the bound userId once and rejects re-use", async () => {
    let now = 0;
    const store = new InMemoryDiscordLinkTokenStore({
      ttlMs: 60_000,
      randomFn: () => "tok-2",
      nowFn: () => now,
    });
    await store.issue("user-42");
    now = 1_000;
    expect(await store.consume("tok-2")).toEqual({
      ok: true,
      userId: "user-42",
    });
    now = 2_000;
    expect(await store.consume("tok-2")).toEqual({
      ok: false,
      reason: "used",
    });
  });

  it("rejects unknown tokens", async () => {
    const store = new InMemoryDiscordLinkTokenStore();
    expect(await store.consume("does-not-exist")).toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  it("rejects expired tokens", async () => {
    let now = 0;
    const store = new InMemoryDiscordLinkTokenStore({
      ttlMs: 60_000,
      randomFn: () => "tok-3",
      nowFn: () => now,
    });
    await store.issue("user-3");
    now = 60_001;
    expect(await store.consume("tok-3")).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("does not return the userId on a failed consume", async () => {
    const store = new InMemoryDiscordLinkTokenStore({
      ttlMs: 1_000,
      randomFn: () => "tok-4",
      nowFn: () => 0,
    });
    await store.issue("user-secret");
    const result = await store.consume("wrong-token");
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("userId");
  });
});
