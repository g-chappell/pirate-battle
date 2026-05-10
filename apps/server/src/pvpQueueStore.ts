import type { PrismaClient } from "@pirate-battle/db";

export interface PvpQueueEntryRecord {
  id: string;
  userId: string;
  captainId: string;
  matchedBattleId: string | null;
  joinedAt: number;
}

export interface PvpQueueStore {
  enqueue(
    userId: string,
    captainId: string,
  ): Promise<{ entry: PvpQueueEntryRecord; created: boolean }>;
  findOldestUnmatchedOther(userId: string): Promise<PvpQueueEntryRecord | null>;
  findByUser(userId: string): Promise<PvpQueueEntryRecord | null>;
  markMatched(userIds: readonly string[], battleId: string): Promise<void>;
  remove(userId: string): Promise<void>;
}

export class InMemoryPvpQueueStore implements PvpQueueStore {
  private readonly entries = new Map<string, PvpQueueEntryRecord>();
  private readonly nowFn: () => number;
  private nextId = 1;

  constructor(opts: { nowFn?: () => number } = {}) {
    this.nowFn = opts.nowFn ?? Date.now;
  }

  async enqueue(
    userId: string,
    captainId: string,
  ): Promise<{ entry: PvpQueueEntryRecord; created: boolean }> {
    const existing = this.entries.get(userId);
    if (existing) {
      existing.captainId = captainId;
      return { entry: existing, created: false };
    }
    const entry: PvpQueueEntryRecord = {
      id: `mem_pvp_q_${this.nextId++}`,
      userId,
      captainId,
      matchedBattleId: null,
      joinedAt: this.nowFn(),
    };
    this.entries.set(userId, entry);
    return { entry, created: true };
  }

  async findOldestUnmatchedOther(userId: string): Promise<PvpQueueEntryRecord | null> {
    let best: PvpQueueEntryRecord | null = null;
    for (const entry of this.entries.values()) {
      if (entry.userId === userId) continue;
      if (entry.matchedBattleId !== null) continue;
      if (best === null || entry.joinedAt < best.joinedAt) best = entry;
    }
    return best;
  }

  async findByUser(userId: string): Promise<PvpQueueEntryRecord | null> {
    return this.entries.get(userId) ?? null;
  }

  async markMatched(userIds: readonly string[], battleId: string): Promise<void> {
    for (const userId of userIds) {
      const entry = this.entries.get(userId);
      if (entry) entry.matchedBattleId = battleId;
    }
  }

  async remove(userId: string): Promise<void> {
    this.entries.delete(userId);
  }
}

export class PrismaPvpQueueStore implements PvpQueueStore {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(
    userId: string,
    captainId: string,
  ): Promise<{ entry: PvpQueueEntryRecord; created: boolean }> {
    const existing = await this.prisma.pvpQueueEntry.findUnique({
      where: { userId },
    });
    if (existing) {
      const updated = await this.prisma.pvpQueueEntry.update({
        where: { userId },
        data: { captainId },
      });
      return { entry: toRecord(updated), created: false };
    }
    const created = await this.prisma.pvpQueueEntry.create({
      data: { userId, captainId },
    });
    return { entry: toRecord(created), created: true };
  }

  async findOldestUnmatchedOther(userId: string): Promise<PvpQueueEntryRecord | null> {
    const found = await this.prisma.pvpQueueEntry.findFirst({
      where: { userId: { not: userId }, matchedBattleId: null },
      orderBy: { joinedAt: "asc" },
    });
    return found ? toRecord(found) : null;
  }

  async findByUser(userId: string): Promise<PvpQueueEntryRecord | null> {
    const found = await this.prisma.pvpQueueEntry.findUnique({
      where: { userId },
    });
    return found ? toRecord(found) : null;
  }

  async markMatched(userIds: readonly string[], battleId: string): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.pvpQueueEntry.updateMany({
      where: { userId: { in: [...userIds] } },
      data: { matchedBattleId: battleId },
    });
  }

  async remove(userId: string): Promise<void> {
    await this.prisma.pvpQueueEntry.delete({ where: { userId } }).catch(() => undefined);
  }
}

interface PrismaPvpQueueRow {
  id: string;
  userId: string;
  captainId: string;
  matchedBattleId: string | null;
  joinedAt: Date;
}

function toRecord(row: PrismaPvpQueueRow): PvpQueueEntryRecord {
  return {
    id: row.id,
    userId: row.userId,
    captainId: row.captainId,
    matchedBattleId: row.matchedBattleId,
    joinedAt: row.joinedAt.getTime(),
  };
}
