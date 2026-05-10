import { randomBytes } from "node:crypto";

export const DEFAULT_NONCE_TTL_MS = 5 * 60 * 1000;

export interface NonceRecord {
  nonce: string;
  expiresAt: number;
  usedAt: number | null;
}

export type ConsumeFailure = "unknown" | "expired" | "used";

export type ConsumeResult = { ok: true } | { ok: false; reason: ConsumeFailure };

export interface NonceStore {
  issue(): Promise<NonceRecord>;
  consume(nonce: string): Promise<ConsumeResult>;
}

export interface InMemoryNonceStoreOptions {
  ttlMs?: number;
  randomFn?: () => string;
  nowFn?: () => number;
}

export class InMemoryNonceStore implements NonceStore {
  private readonly records = new Map<string, NonceRecord>();
  private readonly ttlMs: number;
  private readonly randomFn: () => string;
  private readonly nowFn: () => number;

  constructor(opts: InMemoryNonceStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_NONCE_TTL_MS;
    this.randomFn = opts.randomFn ?? (() => randomBytes(16).toString("hex"));
    this.nowFn = opts.nowFn ?? Date.now;
  }

  async issue(): Promise<NonceRecord> {
    const now = this.nowFn();
    const nonce = this.randomFn();
    const record: NonceRecord = {
      nonce,
      expiresAt: now + this.ttlMs,
      usedAt: null,
    };
    this.records.set(nonce, record);
    return record;
  }

  async consume(nonce: string): Promise<ConsumeResult> {
    const record = this.records.get(nonce);
    if (!record) return { ok: false, reason: "unknown" };
    if (record.usedAt !== null) return { ok: false, reason: "used" };
    const now = this.nowFn();
    if (now > record.expiresAt) return { ok: false, reason: "expired" };
    record.usedAt = now;
    return { ok: true };
  }
}
