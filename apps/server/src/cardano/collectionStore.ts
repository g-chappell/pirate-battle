import type { PrismaClient } from "@pirate-battle/db";
import type { CollectionRules } from "@pirate-battle/shared";

export interface CollectionRecord {
  policyId: string;
  name: string;
  rules: CollectionRules;
}

export type CollectionUpsertChange = "created" | "updated";

export interface CollectionUpsertResult {
  record: CollectionRecord;
  change: CollectionUpsertChange;
}

export interface CollectionStore {
  listAll(): Promise<CollectionRecord[]>;
  upsertOne(record: CollectionRecord): Promise<CollectionUpsertResult>;
}

export class PrismaCollectionStore implements CollectionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(): Promise<CollectionRecord[]> {
    const rows = await this.prisma.collection.findMany({
      orderBy: { policyId: "asc" },
    });
    return rows.map((r) => ({
      policyId: r.policyId,
      name: r.name,
      rules: r.ruleJson as unknown as CollectionRules,
    }));
  }

  async upsertOne(record: CollectionRecord): Promise<CollectionUpsertResult> {
    const existing = await this.prisma.collection.findUnique({
      where: { policyId: record.policyId },
      select: { id: true },
    });
    const row = await this.prisma.collection.upsert({
      where: { policyId: record.policyId },
      create: {
        policyId: record.policyId,
        name: record.name,
        ruleJson: record.rules as unknown as object,
      },
      update: {
        name: record.name,
        ruleJson: record.rules as unknown as object,
      },
    });
    return {
      record: {
        policyId: row.policyId,
        name: row.name,
        rules: row.ruleJson as unknown as CollectionRules,
      },
      change: existing ? "updated" : "created",
    };
  }
}

export class InMemoryCollectionStore implements CollectionStore {
  private readonly records: CollectionRecord[];

  constructor(records: readonly CollectionRecord[] = []) {
    this.records = records.map((r) => ({ ...r }));
  }

  async listAll(): Promise<CollectionRecord[]> {
    return this.records.map((r) => ({ ...r }));
  }

  async upsertOne(record: CollectionRecord): Promise<CollectionUpsertResult> {
    const idx = this.records.findIndex(
      (r) => r.policyId.toLowerCase() === record.policyId.toLowerCase(),
    );
    const copy: CollectionRecord = { ...record };
    if (idx >= 0) {
      this.records[idx] = copy;
      return { record: { ...copy }, change: "updated" };
    }
    this.records.push(copy);
    return { record: { ...copy }, change: "created" };
  }
}
