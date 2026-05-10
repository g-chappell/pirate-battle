import { randomBytes } from "node:crypto";

import type { PrismaClient } from "@pirate-battle/db";

export const DEFAULT_PVP_CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PvpChallengeRecord {
  id: string;
  token: string;
  challengerUserId: string;
  challengerCaptainId: string;
  expiresAt: number;
  acceptedBattleId: string | null;
  acceptedAt: number | null;
}

export interface PvpChallengeIssueInput {
  challengerUserId: string;
  challengerCaptainId: string;
}

export type PvpChallengeAcceptFailure =
  | "unknown"
  | "expired"
  | "already_accepted"
  | "self_accept";

export type PvpChallengeAcceptResult =
  | { ok: true; record: PvpChallengeRecord }
  | { ok: false; reason: PvpChallengeAcceptFailure };

export interface PvpChallengeStore {
  issue(input: PvpChallengeIssueInput): Promise<PvpChallengeRecord>;
  findByToken(token: string): Promise<PvpChallengeRecord | null>;
  markAccepted(
    token: string,
    accepterUserId: string,
    battleId: string,
  ): Promise<PvpChallengeAcceptResult>;
}

export interface PvpChallengeStoreOptions {
  ttlMs?: number;
  randomFn?: () => string;
  nowFn?: () => number;
}

function defaultRandomToken(): string {
  return randomBytes(24).toString("hex");
}

export class InMemoryPvpChallengeStore implements PvpChallengeStore {
  private readonly records = new Map<string, PvpChallengeRecord>();
  private readonly ttlMs: number;
  private readonly randomFn: () => string;
  private readonly nowFn: () => number;
  private nextId = 1;

  constructor(opts: PvpChallengeStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_PVP_CHALLENGE_TTL_MS;
    this.randomFn = opts.randomFn ?? defaultRandomToken;
    this.nowFn = opts.nowFn ?? Date.now;
  }

  async issue(input: PvpChallengeIssueInput): Promise<PvpChallengeRecord> {
    const now = this.nowFn();
    const record: PvpChallengeRecord = {
      id: `mem_pvp_chal_${this.nextId++}`,
      token: this.randomFn(),
      challengerUserId: input.challengerUserId,
      challengerCaptainId: input.challengerCaptainId,
      expiresAt: now + this.ttlMs,
      acceptedBattleId: null,
      acceptedAt: null,
    };
    this.records.set(record.token, record);
    return record;
  }

  async findByToken(token: string): Promise<PvpChallengeRecord | null> {
    return this.records.get(token) ?? null;
  }

  async markAccepted(
    token: string,
    accepterUserId: string,
    battleId: string,
  ): Promise<PvpChallengeAcceptResult> {
    const record = this.records.get(token);
    if (!record) return { ok: false, reason: "unknown" };
    if (record.acceptedBattleId !== null) {
      return { ok: false, reason: "already_accepted" };
    }
    const now = this.nowFn();
    if (now > record.expiresAt) return { ok: false, reason: "expired" };
    if (record.challengerUserId === accepterUserId) {
      return { ok: false, reason: "self_accept" };
    }
    record.acceptedBattleId = battleId;
    record.acceptedAt = now;
    return { ok: true, record };
  }
}

export class PrismaPvpChallengeStore implements PvpChallengeStore {
  private readonly ttlMs: number;
  private readonly randomFn: () => string;
  private readonly nowFn: () => number;

  constructor(
    private readonly prisma: PrismaClient,
    opts: PvpChallengeStoreOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_PVP_CHALLENGE_TTL_MS;
    this.randomFn = opts.randomFn ?? defaultRandomToken;
    this.nowFn = opts.nowFn ?? Date.now;
  }

  async issue(input: PvpChallengeIssueInput): Promise<PvpChallengeRecord> {
    const now = this.nowFn();
    const expiresAt = new Date(now + this.ttlMs);
    const created = await this.prisma.pvpChallenge.create({
      data: {
        token: this.randomFn(),
        challengerUserId: input.challengerUserId,
        challengerCaptainId: input.challengerCaptainId,
        expiresAt,
      },
    });
    return toRecord(created);
  }

  async findByToken(token: string): Promise<PvpChallengeRecord | null> {
    const found = await this.prisma.pvpChallenge.findUnique({
      where: { token },
    });
    return found ? toRecord(found) : null;
  }

  async markAccepted(
    token: string,
    accepterUserId: string,
    battleId: string,
  ): Promise<PvpChallengeAcceptResult> {
    const now = this.nowFn();
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.pvpChallenge.findUnique({ where: { token } });
      if (!found) return { ok: false, reason: "unknown" } as const;
      if (found.acceptedBattleId !== null) {
        return { ok: false, reason: "already_accepted" } as const;
      }
      if (found.expiresAt.getTime() < now) {
        return { ok: false, reason: "expired" } as const;
      }
      if (found.challengerUserId === accepterUserId) {
        return { ok: false, reason: "self_accept" } as const;
      }
      const updated = await tx.pvpChallenge.update({
        where: { token },
        data: { acceptedBattleId: battleId, acceptedAt: new Date(now) },
      });
      return { ok: true, record: toRecord(updated) } as const;
    });
  }
}

interface PrismaPvpChallengeRow {
  id: string;
  token: string;
  challengerUserId: string;
  challengerCaptainId: string;
  expiresAt: Date;
  acceptedBattleId: string | null;
  acceptedAt: Date | null;
}

function toRecord(row: PrismaPvpChallengeRow): PvpChallengeRecord {
  return {
    id: row.id,
    token: row.token,
    challengerUserId: row.challengerUserId,
    challengerCaptainId: row.challengerCaptainId,
    expiresAt: row.expiresAt.getTime(),
    acceptedBattleId: row.acceptedBattleId,
    acceptedAt: row.acceptedAt ? row.acceptedAt.getTime() : null,
  };
}
