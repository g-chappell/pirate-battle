import { describe, expect, it } from "vitest";

import type { UserNft } from "./blockfrost.js";
import { InMemoryNftSnapshotStore } from "./nftSnapshotStore.js";

const sampleNft = (suffix = "1"): UserNft => ({
  policyId: "a".repeat(56),
  assetName: `4f544b${suffix}`,
  unit: `${"a".repeat(56)}4f544b${suffix}`,
  quantity: "1",
});

describe("InMemoryNftSnapshotStore", () => {
  it("returns null when the user has no snapshots", async () => {
    const store = new InMemoryNftSnapshotStore();
    expect(await store.getLatestForUser("user_a")).toBeNull();
  });

  it("returns the only snapshot when one exists", async () => {
    let now = 1_000;
    const store = new InMemoryNftSnapshotStore({ nowFn: () => now });
    const nft = sampleNft();
    const saved = await store.saveSnapshot("user_a", [nft]);
    now = 2_000;
    const latest = await store.getLatestForUser("user_a");
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(saved.id);
    expect(latest!.nfts).toHaveLength(1);
    expect(latest!.nfts[0]).toEqual(nft);
  });

  it("returns the most recent snapshot when multiple exist", async () => {
    let now = 1_000;
    const store = new InMemoryNftSnapshotStore({ nowFn: () => now });
    await store.saveSnapshot("user_a", [sampleNft("1")]);
    now = 5_000;
    const second = await store.saveSnapshot("user_a", [sampleNft("2")]);
    now = 3_000;
    await store.saveSnapshot("user_a", [sampleNft("3")]);

    const latest = await store.getLatestForUser("user_a");
    expect(latest!.id).toBe(second.id);
    expect(latest!.nfts[0]?.assetName).toBe("4f544b2");
  });

  it("isolates snapshots per user", async () => {
    const store = new InMemoryNftSnapshotStore({ nowFn: () => 1_000 });
    await store.saveSnapshot("user_a", [sampleNft("a")]);
    const latestB = await store.getLatestForUser("user_b");
    expect(latestB).toBeNull();
  });

  it("does not mutate the caller's nft array on save", async () => {
    const store = new InMemoryNftSnapshotStore({ nowFn: () => 1_000 });
    const input = [sampleNft()];
    const saved = await store.saveSnapshot("user_a", input);
    input[0]!.quantity = "999";
    expect(saved.nfts[0]!.quantity).toBe("1");
  });
});
