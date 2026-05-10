import { randomBytes } from "node:crypto";

export const DEFAULT_DISCORD_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

export interface DiscordLinkTokenRecord {
  token: string;
  userId: string;
  expiresAt: number;
  usedAt: number | null;
}

export type DiscordLinkConsumeFailure = "unknown" | "expired" | "used";

export type DiscordLinkConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: DiscordLinkConsumeFailure };

export interface DiscordLinkTokenStore {
  issue(userId: string): Promise<DiscordLinkTokenRecord>;
  consume(token: string): Promise<DiscordLinkConsumeResult>;
}

export interface InMemoryDiscordLinkTokenStoreOptions {
  ttlMs?: number;
  randomFn?: () => string;
  nowFn?: () => number;
}

export class InMemoryDiscordLinkTokenStore implements DiscordLinkTokenStore {
  private readonly records = new Map<string, DiscordLinkTokenRecord>();
  private readonly ttlMs: number;
  private readonly randomFn: () => string;
  private readonly nowFn: () => number;

  constructor(opts: InMemoryDiscordLinkTokenStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_DISCORD_LINK_TOKEN_TTL_MS;
    this.randomFn = opts.randomFn ?? (() => randomBytes(24).toString("hex"));
    this.nowFn = opts.nowFn ?? Date.now;
  }

  async issue(userId: string): Promise<DiscordLinkTokenRecord> {
    const now = this.nowFn();
    const token = this.randomFn();
    const record: DiscordLinkTokenRecord = {
      token,
      userId,
      expiresAt: now + this.ttlMs,
      usedAt: null,
    };
    this.records.set(token, record);
    return record;
  }

  async consume(token: string): Promise<DiscordLinkConsumeResult> {
    const record = this.records.get(token);
    if (!record) return { ok: false, reason: "unknown" };
    if (record.usedAt !== null) return { ok: false, reason: "used" };
    const now = this.nowFn();
    if (now > record.expiresAt) return { ok: false, reason: "expired" };
    record.usedAt = now;
    return { ok: true, userId: record.userId };
  }
}
