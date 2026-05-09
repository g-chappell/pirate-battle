import { describe, expect, it } from "vitest";

import { InMemoryNonceStore } from "./nonceStore.js";

describe("InMemoryNonceStore", () => {
  it("issues nonces with the configured TTL", async () => {
    const store = new InMemoryNonceStore({
      ttlMs: 1_000,
      randomFn: () => "abc123",
      nowFn: () => 10_000,
    });
    const record = await store.issue();
    expect(record.nonce).toBe("abc123");
    expect(record.expiresAt).toBe(11_000);
    expect(record.usedAt).toBeNull();
  });

  it("uses cryptographically random nonces by default", async () => {
    const store = new InMemoryNonceStore();
    const a = await store.issue();
    const b = await store.issue();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("consume succeeds once and rejects subsequent calls as used", async () => {
    let now = 0;
    const store = new InMemoryNonceStore({
      ttlMs: 1_000,
      randomFn: () => "n1",
      nowFn: () => now,
    });
    await store.issue();
    now = 500;
    expect(await store.consume("n1")).toEqual({ ok: true });
    now = 600;
    expect(await store.consume("n1")).toEqual({ ok: false, reason: "used" });
  });

  it("rejects unknown nonces", async () => {
    const store = new InMemoryNonceStore();
    expect(await store.consume("never-issued")).toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  it("rejects expired nonces", async () => {
    let now = 0;
    const store = new InMemoryNonceStore({
      ttlMs: 1_000,
      randomFn: () => "n2",
      nowFn: () => now,
    });
    await store.issue();
    now = 1_500;
    expect(await store.consume("n2")).toEqual({
      ok: false,
      reason: "expired",
    });
  });
});
