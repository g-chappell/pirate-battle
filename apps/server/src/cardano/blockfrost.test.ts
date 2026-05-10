import { describe, expect, it } from "vitest";

import {
  BlockfrostNftService,
  DEFAULT_NFT_FRESHNESS_MS,
  filterByAllowlist,
  getNetworkFromEnv,
  loadAllowlistFromEnv,
  type BlockfrostClient,
  type RawAccountAsset,
} from "./blockfrost.js";
import { InMemoryNftSnapshotStore } from "./nftSnapshotStore.js";

const POLICY_A = "a".repeat(56);
const POLICY_B = "b".repeat(56);
const POLICY_C = "c".repeat(56);

class StubBlockfrostClient implements BlockfrostClient {
  callCount = 0;
  lastStakeAddr: string | null = null;

  constructor(private readonly assets: RawAccountAsset[]) {}

  async accountsAddressesAssetsAll(stakeAddr: string): Promise<RawAccountAsset[]> {
    this.callCount++;
    this.lastStakeAddr = stakeAddr;
    return this.assets;
  }
}

describe("getNetworkFromEnv", () => {
  it("defaults to mainnet when env var is absent", () => {
    expect(getNetworkFromEnv({})).toBe("mainnet");
  });

  it.each(["mainnet", "preview", "preprod", "sanchonet"] as const)("accepts %s", (network) => {
    expect(getNetworkFromEnv({ BLOCKFROST_NETWORK: network })).toBe(network);
  });

  it("throws on invalid network value", () => {
    expect(() => getNetworkFromEnv({ BLOCKFROST_NETWORK: "testnet" })).toThrowError(
      /BLOCKFROST_NETWORK/,
    );
  });
});

describe("loadAllowlistFromEnv", () => {
  it("returns an empty list when env var is absent", () => {
    expect(loadAllowlistFromEnv({})).toEqual([]);
  });

  it("splits comma-separated policy IDs and lower-cases them", () => {
    expect(
      loadAllowlistFromEnv({
        NFT_ALLOWLIST_POLICY_IDS: `${POLICY_A.toUpperCase()},${POLICY_B}`,
      }),
    ).toEqual([POLICY_A, POLICY_B]);
  });

  it("trims whitespace and ignores empty entries", () => {
    expect(
      loadAllowlistFromEnv({
        NFT_ALLOWLIST_POLICY_IDS: ` ${POLICY_A} ,, ${POLICY_B} `,
      }),
    ).toEqual([POLICY_A, POLICY_B]);
  });
});

describe("filterByAllowlist", () => {
  it("returns nothing when allowlist is empty", () => {
    expect(filterByAllowlist([{ unit: `${POLICY_A}4f544b`, quantity: "1" }], [])).toEqual([]);
  });

  it("returns only assets whose policy id is on the allowlist", () => {
    const assets: RawAccountAsset[] = [
      { unit: `${POLICY_A}4f544b`, quantity: "1" },
      { unit: `${POLICY_B}4d4e44`, quantity: "2" },
      { unit: `${POLICY_C}5859`, quantity: "3" },
      { unit: "lovelace", quantity: "1000000" },
    ];
    const result = filterByAllowlist(assets, [POLICY_A, POLICY_C]);
    expect(result).toEqual([
      {
        policyId: POLICY_A,
        assetName: "4f544b",
        unit: `${POLICY_A}4f544b`,
        quantity: "1",
      },
      {
        policyId: POLICY_C,
        assetName: "5859",
        unit: `${POLICY_C}5859`,
        quantity: "3",
      },
    ]);
  });

  it("matches case-insensitively", () => {
    const assets: RawAccountAsset[] = [{ unit: `${POLICY_A.toUpperCase()}AB`, quantity: "1" }];
    const result = filterByAllowlist(assets, [POLICY_A]);
    expect(result).toHaveLength(1);
    expect(result[0]!.policyId).toBe(POLICY_A);
  });

  it("ignores units shorter than a policy id (e.g. lovelace)", () => {
    const assets: RawAccountAsset[] = [{ unit: "lovelace", quantity: "1" }];
    expect(filterByAllowlist(assets, [POLICY_A])).toEqual([]);
  });
});

describe("BlockfrostNftService.fetchUserNfts", () => {
  const stake = "stake1u9example";

  it("calls Blockfrost and stores a snapshot when no cache exists", async () => {
    const client = new StubBlockfrostClient([
      { unit: `${POLICY_A}deadbeef`, quantity: "1" },
      { unit: `${POLICY_B}cafe`, quantity: "5" },
    ]);
    const store = new InMemoryNftSnapshotStore({ nowFn: () => 10_000 });
    const service = new BlockfrostNftService({
      client,
      store,
      allowlist: [POLICY_A],
      nowFn: () => 10_000,
    });

    const result = await service.fetchUserNfts({
      userId: "user_a",
      stakeAddr: stake,
    });
    expect(client.callCount).toBe(1);
    expect(client.lastStakeAddr).toBe(stake);
    expect(result.source).toBe("blockfrost");
    expect(result.nfts).toEqual([
      {
        policyId: POLICY_A,
        assetName: "deadbeef",
        unit: `${POLICY_A}deadbeef`,
        quantity: "1",
      },
    ]);

    const persisted = await store.getLatestForUser("user_a");
    expect(persisted).not.toBeNull();
    expect(persisted!.nfts).toHaveLength(1);
  });

  it("returns the cached snapshot when within the freshness window", async () => {
    const client = new StubBlockfrostClient([{ unit: `${POLICY_A}feed`, quantity: "1" }]);
    let now = 10_000;
    const store = new InMemoryNftSnapshotStore({ nowFn: () => now });
    const service = new BlockfrostNftService({
      client,
      store,
      allowlist: [POLICY_A],
      nowFn: () => now,
    });

    const first = await service.fetchUserNfts({
      userId: "user_a",
      stakeAddr: stake,
    });
    expect(first.source).toBe("blockfrost");

    now = 10_000 + (DEFAULT_NFT_FRESHNESS_MS - 1);
    const second = await service.fetchUserNfts({
      userId: "user_a",
      stakeAddr: stake,
    });
    expect(second.source).toBe("cache");
    expect(client.callCount).toBe(1);
    expect(second.nfts).toEqual(first.nfts);
  });

  it("refetches once the cache passes the freshness window", async () => {
    const client = new StubBlockfrostClient([{ unit: `${POLICY_A}aa`, quantity: "1" }]);
    let now = 0;
    const store = new InMemoryNftSnapshotStore({ nowFn: () => now });
    const service = new BlockfrostNftService({
      client,
      store,
      allowlist: [POLICY_A],
      freshnessMs: 1_000,
      nowFn: () => now,
    });

    await service.fetchUserNfts({ userId: "user_a", stakeAddr: stake });
    expect(client.callCount).toBe(1);

    now = 1_500;
    const refreshed = await service.fetchUserNfts({
      userId: "user_a",
      stakeAddr: stake,
    });
    expect(refreshed.source).toBe("blockfrost");
    expect(client.callCount).toBe(2);
  });

  it("isolates cache by userId", async () => {
    const client = new StubBlockfrostClient([{ unit: `${POLICY_A}11`, quantity: "1" }]);
    const now = 1_000;
    const store = new InMemoryNftSnapshotStore({ nowFn: () => now });
    const service = new BlockfrostNftService({
      client,
      store,
      allowlist: [POLICY_A],
      nowFn: () => now,
    });

    await service.fetchUserNfts({ userId: "user_a", stakeAddr: stake });
    expect(client.callCount).toBe(1);
    await service.fetchUserNfts({ userId: "user_b", stakeAddr: stake });
    expect(client.callCount).toBe(2);
  });
});
