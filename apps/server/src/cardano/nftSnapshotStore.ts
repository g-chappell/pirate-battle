import type { PrismaClient } from "@pirate-battle/db";

import type { UserNft } from "./blockfrost.js";

export interface NftSnapshotRecord {
  id: string;
  userId: string;
  fetchedAt: Date;
  nfts: UserNft[];
}

export interface NftSnapshotStore {
  getLatestForUser(userId: string): Promise<NftSnapshotRecord | null>;
  saveSnapshot(userId: string, nfts: UserNft[]): Promise<NftSnapshotRecord>;
}

export class PrismaNftSnapshotStore implements NftSnapshotStore {
  constructor(private readonly prisma: PrismaClient) {}

  async getLatestForUser(userId: string): Promise<NftSnapshotRecord | null> {
    const row = await this.prisma.nftSnapshot.findFirst({
      where: { userId },
      orderBy: { fetchedAt: "desc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      fetchedAt: row.fetchedAt,
      nfts: row.nftsJson as unknown as UserNft[],
    };
  }

  async saveSnapshot(
    userId: string,
    nfts: UserNft[],
  ): Promise<NftSnapshotRecord> {
    const row = await this.prisma.nftSnapshot.create({
      data: {
        userId,
        nftsJson: nfts as unknown as object,
      },
    });
    return {
      id: row.id,
      userId: row.userId,
      fetchedAt: row.fetchedAt,
      nfts,
    };
  }
}

export interface InMemoryNftSnapshotStoreOptions {
  nowFn?: () => number;
}

export class InMemoryNftSnapshotStore implements NftSnapshotStore {
  private readonly snapshots: NftSnapshotRecord[] = [];
  private readonly nowFn: () => number;
  private nextId = 1;

  constructor(opts: InMemoryNftSnapshotStoreOptions = {}) {
    this.nowFn = opts.nowFn ?? Date.now;
  }

  async getLatestForUser(userId: string): Promise<NftSnapshotRecord | null> {
    let latest: NftSnapshotRecord | null = null;
    for (const snap of this.snapshots) {
      if (snap.userId !== userId) continue;
      if (!latest || snap.fetchedAt.getTime() > latest.fetchedAt.getTime()) {
        latest = snap;
      }
    }
    return latest;
  }

  async saveSnapshot(
    userId: string,
    nfts: UserNft[],
  ): Promise<NftSnapshotRecord> {
    const record: NftSnapshotRecord = {
      id: `mem_snapshot_${this.nextId++}`,
      userId,
      fetchedAt: new Date(this.nowFn()),
      nfts: nfts.map((n) => ({ ...n })),
    };
    this.snapshots.push(record);
    return { ...record, nfts: record.nfts.map((n) => ({ ...n })) };
  }

  all(): NftSnapshotRecord[] {
    return this.snapshots.map((s) => ({
      ...s,
      nfts: s.nfts.map((n) => ({ ...n })),
    }));
  }
}
