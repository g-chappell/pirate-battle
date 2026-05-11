import type { PrismaClient } from "@pirate-battle/db";

import { applyElo, DEFAULT_ELO, DEFAULT_K_FACTOR } from "./elo.js";

export interface SeasonRecord {
  id: string;
  name: string;
  startsAt: number;
  endsAt: number;
}

export interface RatingRecord {
  userId: string;
  seasonId: string;
  elo: number;
  wins: number;
  losses: number;
  updatedAt: number;
}

export interface LeaderboardEntry {
  userId: string;
  elo: number;
  wins: number;
  losses: number;
  rank: number;
}

export interface OpenSeasonInput {
  name: string;
  startsAt: number;
  endsAt: number;
}

export interface SeasonStore {
  findCurrent(at?: number): Promise<SeasonRecord | null>;
  findById(id: string): Promise<SeasonRecord | null>;
  open(input: OpenSeasonInput): Promise<SeasonRecord>;
  getRating(userId: string, seasonId: string): Promise<RatingRecord | null>;
  applyMatchResult(input: ApplyMatchResultInput): Promise<ApplyMatchResult>;
  listLeaderboard(
    seasonId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ entries: LeaderboardEntry[]; total: number }>;
}

export interface ApplyMatchResultInput {
  seasonId: string;
  winnerUserId: string;
  loserUserId: string;
  k?: number;
}

export interface ApplyMatchResult {
  winner: RatingRecord;
  loser: RatingRecord;
  delta: number;
}

function clampPagination(opts: { limit: number; offset: number }) {
  const limit = Math.max(1, Math.min(100, Math.floor(opts.limit)));
  const offset = Math.max(0, Math.floor(opts.offset));
  return { limit, offset };
}

export class PrismaSeasonStore implements SeasonStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findCurrent(at: number = Date.now()): Promise<SeasonRecord | null> {
    const date = new Date(at);
    const row = await this.prisma.season.findFirst({
      where: { startsAt: { lte: date }, endsAt: { gt: date } },
      orderBy: { startsAt: "desc" },
    });
    return row ? toSeasonRecord(row) : null;
  }

  async findById(id: string): Promise<SeasonRecord | null> {
    const row = await this.prisma.season.findUnique({ where: { id } });
    return row ? toSeasonRecord(row) : null;
  }

  async open(input: OpenSeasonInput): Promise<SeasonRecord> {
    const row = await this.prisma.season.create({
      data: {
        name: input.name,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
      },
    });
    return toSeasonRecord(row);
  }

  async getRating(userId: string, seasonId: string): Promise<RatingRecord | null> {
    const row = await this.prisma.pvpRating.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    return row ? toRatingRecord(row) : null;
  }

  async applyMatchResult(input: ApplyMatchResultInput): Promise<ApplyMatchResult> {
    const k = input.k ?? DEFAULT_K_FACTOR;
    return this.prisma.$transaction(async (tx) => {
      const winnerRow = await tx.pvpRating.upsert({
        where: { userId_seasonId: { userId: input.winnerUserId, seasonId: input.seasonId } },
        create: { userId: input.winnerUserId, seasonId: input.seasonId, elo: DEFAULT_ELO },
        update: {},
      });
      const loserRow = await tx.pvpRating.upsert({
        where: { userId_seasonId: { userId: input.loserUserId, seasonId: input.seasonId } },
        create: { userId: input.loserUserId, seasonId: input.seasonId, elo: DEFAULT_ELO },
        update: {},
      });
      const update = applyElo(winnerRow.elo, loserRow.elo, k);
      const updatedWinner = await tx.pvpRating.update({
        where: { id: winnerRow.id },
        data: { elo: update.newWinnerRating, wins: { increment: 1 } },
      });
      const updatedLoser = await tx.pvpRating.update({
        where: { id: loserRow.id },
        data: { elo: update.newLoserRating, losses: { increment: 1 } },
      });
      return {
        winner: toRatingRecord(updatedWinner),
        loser: toRatingRecord(updatedLoser),
        delta: update.delta,
      };
    });
  }

  async listLeaderboard(
    seasonId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ entries: LeaderboardEntry[]; total: number }> {
    const { limit, offset } = clampPagination(opts);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.pvpRating.findMany({
        where: { seasonId },
        orderBy: [{ elo: "desc" }, { userId: "asc" }],
        skip: offset,
        take: limit,
      }),
      this.prisma.pvpRating.count({ where: { seasonId } }),
    ]);
    return {
      entries: rows.map((row, i) => ({
        userId: row.userId,
        elo: row.elo,
        wins: row.wins,
        losses: row.losses,
        rank: offset + i + 1,
      })),
      total,
    };
  }
}

interface PrismaSeasonRow {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
}

interface PrismaRatingRow {
  userId: string;
  seasonId: string;
  elo: number;
  wins: number;
  losses: number;
  updatedAt: Date;
}

function toSeasonRecord(row: PrismaSeasonRow): SeasonRecord {
  return {
    id: row.id,
    name: row.name,
    startsAt: row.startsAt.getTime(),
    endsAt: row.endsAt.getTime(),
  };
}

function toRatingRecord(row: PrismaRatingRow): RatingRecord {
  return {
    userId: row.userId,
    seasonId: row.seasonId,
    elo: row.elo,
    wins: row.wins,
    losses: row.losses,
    updatedAt: row.updatedAt.getTime(),
  };
}

type InMemorySeasonRow = SeasonRecord;
type InMemoryRatingRow = RatingRecord;

export class InMemorySeasonStore implements SeasonStore {
  private readonly seasons = new Map<string, InMemorySeasonRow>();
  private readonly ratings = new Map<string, InMemoryRatingRow>();
  private readonly nowFn: () => number;
  private nextSeasonId = 1;

  constructor(opts: { nowFn?: () => number } = {}) {
    this.nowFn = opts.nowFn ?? Date.now;
  }

  async findCurrent(at?: number): Promise<SeasonRecord | null> {
    const t = at ?? this.nowFn();
    let best: InMemorySeasonRow | null = null;
    for (const s of this.seasons.values()) {
      if (s.startsAt <= t && t < s.endsAt) {
        if (best === null || s.startsAt > best.startsAt) best = s;
      }
    }
    return best;
  }

  async findById(id: string): Promise<SeasonRecord | null> {
    return this.seasons.get(id) ?? null;
  }

  async open(input: OpenSeasonInput): Promise<SeasonRecord> {
    for (const s of this.seasons.values()) {
      if (s.name === input.name) {
        throw new Error(`season ${input.name} already exists`);
      }
    }
    const id = `mem_season_${this.nextSeasonId++}`;
    const row: InMemorySeasonRow = {
      id,
      name: input.name,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    };
    this.seasons.set(id, row);
    return row;
  }

  async getRating(userId: string, seasonId: string): Promise<RatingRecord | null> {
    return this.ratings.get(this.ratingKey(userId, seasonId)) ?? null;
  }

  async applyMatchResult(input: ApplyMatchResultInput): Promise<ApplyMatchResult> {
    if (!this.seasons.has(input.seasonId)) {
      throw new Error(`unknown season ${input.seasonId}`);
    }
    const k = input.k ?? DEFAULT_K_FACTOR;
    const winner = this.ensureRating(input.winnerUserId, input.seasonId);
    const loser = this.ensureRating(input.loserUserId, input.seasonId);
    const update = applyElo(winner.elo, loser.elo, k);
    winner.elo = update.newWinnerRating;
    winner.wins += 1;
    winner.updatedAt = this.nowFn();
    loser.elo = update.newLoserRating;
    loser.losses += 1;
    loser.updatedAt = this.nowFn();
    return { winner: { ...winner }, loser: { ...loser }, delta: update.delta };
  }

  async listLeaderboard(
    seasonId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ entries: LeaderboardEntry[]; total: number }> {
    const { limit, offset } = clampPagination(opts);
    const rows = Array.from(this.ratings.values())
      .filter((r) => r.seasonId === seasonId)
      .sort((a, b) => b.elo - a.elo || a.userId.localeCompare(b.userId));
    const slice = rows.slice(offset, offset + limit);
    return {
      entries: slice.map((row, i) => ({
        userId: row.userId,
        elo: row.elo,
        wins: row.wins,
        losses: row.losses,
        rank: offset + i + 1,
      })),
      total: rows.length,
    };
  }

  private ensureRating(userId: string, seasonId: string): InMemoryRatingRow {
    const key = this.ratingKey(userId, seasonId);
    let row = this.ratings.get(key);
    if (!row) {
      row = {
        userId,
        seasonId,
        elo: DEFAULT_ELO,
        wins: 0,
        losses: 0,
        updatedAt: this.nowFn(),
      };
      this.ratings.set(key, row);
    }
    return row;
  }

  private ratingKey(userId: string, seasonId: string): string {
    return `${seasonId}::${userId}`;
  }
}
