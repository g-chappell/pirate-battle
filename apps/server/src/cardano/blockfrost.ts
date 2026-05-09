import { BlockFrostAPI } from "@blockfrost/blockfrost-js";

import type { NftSnapshotStore } from "./nftSnapshotStore.js";

export const POLICY_ID_HEX_LEN = 56;
export const DEFAULT_NFT_FRESHNESS_MS = 5 * 60 * 1000;
export const DEFAULT_BLOCKFROST_NETWORK: CardanoNetwork = "mainnet";

export type CardanoNetwork = "mainnet" | "preview" | "preprod" | "sanchonet";

export interface UserNft {
  policyId: string;
  assetName: string;
  unit: string;
  quantity: string;
}

export interface RawAccountAsset {
  unit: string;
  quantity: string;
}

export interface BlockfrostClient {
  accountsAddressesAssetsAll(stakeAddr: string): Promise<RawAccountAsset[]>;
}

export class BlockfrostHttpClient implements BlockfrostClient {
  private readonly api: BlockFrostAPI;

  constructor(opts: { projectId: string; network?: CardanoNetwork }) {
    this.api = new BlockFrostAPI({
      projectId: opts.projectId,
      network: opts.network ?? DEFAULT_BLOCKFROST_NETWORK,
    });
  }

  async accountsAddressesAssetsAll(
    stakeAddr: string,
  ): Promise<RawAccountAsset[]> {
    const result = await this.api.accountsAddressesAssetsAll(stakeAddr);
    return result.map((a) => ({ unit: a.unit, quantity: a.quantity }));
  }
}

export function getNetworkFromEnv(env: NodeJS.ProcessEnv): CardanoNetwork {
  const raw = env["BLOCKFROST_NETWORK"];
  if (!raw) return DEFAULT_BLOCKFROST_NETWORK;
  if (
    raw === "mainnet" ||
    raw === "preview" ||
    raw === "preprod" ||
    raw === "sanchonet"
  ) {
    return raw;
  }
  throw new Error(
    `BLOCKFROST_NETWORK must be one of mainnet|preview|preprod|sanchonet (got: ${raw})`,
  );
}

export function loadAllowlistFromEnv(env: NodeJS.ProcessEnv): string[] {
  const raw = env["NFT_ALLOWLIST_POLICY_IDS"];
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);
}

export function filterByAllowlist(
  rawAssets: readonly RawAccountAsset[],
  allowlist: readonly string[],
): UserNft[] {
  if (allowlist.length === 0) return [];
  const allowSet = new Set(allowlist.map((p) => p.toLowerCase()));
  const out: UserNft[] = [];
  for (const asset of rawAssets) {
    if (asset.unit.length <= POLICY_ID_HEX_LEN) continue;
    const policyId = asset.unit.slice(0, POLICY_ID_HEX_LEN).toLowerCase();
    if (!allowSet.has(policyId)) continue;
    const assetName = asset.unit.slice(POLICY_ID_HEX_LEN);
    out.push({
      policyId,
      assetName,
      unit: asset.unit,
      quantity: asset.quantity,
    });
  }
  return out;
}

export interface BlockfrostNftServiceOptions {
  client: BlockfrostClient;
  store: NftSnapshotStore;
  allowlist: readonly string[];
  freshnessMs?: number;
  nowFn?: () => number;
}

export interface FetchUserNftsInput {
  userId: string;
  stakeAddr: string;
}

export interface FetchUserNftsResult {
  nfts: UserNft[];
  fetchedAt: Date;
  source: "cache" | "blockfrost";
}

export class BlockfrostNftService {
  private readonly client: BlockfrostClient;
  private readonly store: NftSnapshotStore;
  private readonly allowlist: readonly string[];
  private readonly freshnessMs: number;
  private readonly nowFn: () => number;

  constructor(opts: BlockfrostNftServiceOptions) {
    this.client = opts.client;
    this.store = opts.store;
    this.allowlist = opts.allowlist;
    this.freshnessMs = opts.freshnessMs ?? DEFAULT_NFT_FRESHNESS_MS;
    this.nowFn = opts.nowFn ?? Date.now;
  }

  async fetchUserNfts(input: FetchUserNftsInput): Promise<FetchUserNftsResult> {
    const cached = await this.store.getLatestForUser(input.userId);
    if (cached) {
      const ageMs = this.nowFn() - cached.fetchedAt.getTime();
      if (ageMs < this.freshnessMs) {
        return {
          nfts: cached.nfts,
          fetchedAt: cached.fetchedAt,
          source: "cache",
        };
      }
    }

    const raw = await this.client.accountsAddressesAssetsAll(input.stakeAddr);
    const nfts = filterByAllowlist(raw, this.allowlist);
    const saved = await this.store.saveSnapshot(input.userId, nfts);
    return {
      nfts: saved.nfts,
      fetchedAt: saved.fetchedAt,
      source: "blockfrost",
    };
  }
}
