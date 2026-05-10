import { describe, expect, it } from "vitest";

import { InMemoryPvpQueueStore } from "./pvpQueueStore.js";

describe("InMemoryPvpQueueStore", () => {
  it("enqueues users idempotently per user, refreshing captain", async () => {
    const store = new InMemoryPvpQueueStore();
    const first = await store.enqueue("u1", "c1");
    expect(first.created).toBe(true);

    const second = await store.enqueue("u1", "c2");
    expect(second.created).toBe(false);
    expect(second.entry.captainId).toBe("c2");
  });

  it("finds the oldest unmatched other entry, ignoring the caller", async () => {
    let now = 1_000;
    const store = new InMemoryPvpQueueStore({ nowFn: () => now });
    await store.enqueue("u1", "c1");
    now += 10;
    await store.enqueue("u2", "c2");
    now += 10;
    await store.enqueue("u3", "c3");

    const oldest = await store.findOldestUnmatchedOther("u3");
    expect(oldest?.userId).toBe("u1");

    await store.markMatched(["u1"], "battle_1");
    const oldestAfter = await store.findOldestUnmatchedOther("u3");
    expect(oldestAfter?.userId).toBe("u2");
  });

  it("removes entries by user", async () => {
    const store = new InMemoryPvpQueueStore();
    await store.enqueue("u1", "c1");
    await store.remove("u1");
    expect(await store.findByUser("u1")).toBeNull();
  });
});
