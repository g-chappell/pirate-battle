import { describe, expect, it } from "vitest";

import { DEFAULT_PVP_CHALLENGE_TTL_MS, InMemoryPvpChallengeStore } from "./pvpChallengeStore.js";

describe("InMemoryPvpChallengeStore", () => {
  it("issues unique tokens scoped to the challenger captain", async () => {
    const store = new InMemoryPvpChallengeStore();
    const a = await store.issue({
      challengerUserId: "u1",
      challengerCaptainId: "c1",
    });
    const b = await store.issue({
      challengerUserId: "u1",
      challengerCaptainId: "c2",
    });
    expect(a.token).not.toEqual(b.token);
    expect(a.challengerCaptainId).toBe("c1");
    expect(b.challengerCaptainId).toBe("c2");
  });

  it("expires tokens after the TTL", async () => {
    let now = 1_000;
    const store = new InMemoryPvpChallengeStore({ nowFn: () => now });
    const issued = await store.issue({
      challengerUserId: "u1",
      challengerCaptainId: "c1",
    });
    now += DEFAULT_PVP_CHALLENGE_TTL_MS + 1;
    const result = await store.markAccepted(issued.token, "u2", "battle_1");
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects double-accept", async () => {
    const store = new InMemoryPvpChallengeStore();
    const issued = await store.issue({
      challengerUserId: "u1",
      challengerCaptainId: "c1",
    });
    const first = await store.markAccepted(issued.token, "u2", "battle_1");
    expect(first.ok).toBe(true);
    const second = await store.markAccepted(issued.token, "u3", "battle_2");
    expect(second).toEqual({ ok: false, reason: "already_accepted" });
  });

  it("rejects self-accept", async () => {
    const store = new InMemoryPvpChallengeStore();
    const issued = await store.issue({
      challengerUserId: "u1",
      challengerCaptainId: "c1",
    });
    const result = await store.markAccepted(issued.token, "u1", "battle_1");
    expect(result).toEqual({ ok: false, reason: "self_accept" });
  });
});
