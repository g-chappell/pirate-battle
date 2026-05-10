import type { PrismaClient } from "@pirate-battle/db";
import type { CollectionRules } from "@pirate-battle/shared";

export interface CollectionRecord {
  policyId: string;
  name: string;
  rules: CollectionRules;
}

export interface CollectionStore {
  listAll(): Promise<CollectionRecord[]>;
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
}

export class InMemoryCollectionStore implements CollectionStore {
  private readonly records: CollectionRecord[];

  constructor(records: readonly CollectionRecord[] = []) {
    this.records = records.map((r) => ({ ...r }));
  }

  async listAll(): Promise<CollectionRecord[]> {
    return this.records.map((r) => ({ ...r }));
  }
}
