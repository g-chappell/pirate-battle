import type { Action, BattleEvent, BattleState, Side } from "@pirate-battle/core";
import { BattleMode, Prisma, type PrismaClient } from "@pirate-battle/db";

import type { FinishedBattleStats } from "./statsAggregator.js";

export interface BattleSummary {
  id: string;
  mode: BattleMode;
  ownerUserId: string;
  participantBId: string | null;
  captainId: string | null;
  captainBId: string | null;
  state: BattleState;
  pendingActionA: Action | null;
  pendingActionB: Action | null;
  pendingSubmitAt: number | null;
  discordChannelId: string | null;
  discordMessageId: string | null;
  discordGuildId: string | null;
  discordMessageSentAt: number | null;
}

export interface SetDiscordMessageInput {
  channelId: string;
  messageId: string;
  sentAtMs: number;
  guildId: string | null;
}

export interface FinishedBattleRow {
  id: string;
  mode: BattleMode;
  userSide: Side;
  winner: Side;
  turn: number;
  startedAt: number;
  endedAt: number;
}

export interface CreateBattleInput {
  ownerUserId: string;
  captainId: string | null;
  state: BattleState;
}

export interface CreatePvpBattleInput {
  participantAId: string;
  participantBId: string;
  captainAId: string;
  captainBId: string;
  state: BattleState;
}

export interface BattleStore {
  create(input: CreateBattleInput): Promise<BattleSummary>;
  createPvp(input: CreatePvpBattleInput): Promise<BattleSummary>;
  get(battleId: string): Promise<BattleSummary | null>;
  recordTurn(
    battleId: string,
    newState: BattleState,
    newEvents: readonly BattleEvent[],
  ): Promise<BattleSummary>;
  setPendingAction(
    battleId: string,
    side: "A" | "B",
    action: Action | null,
    submittedAt: number | null,
  ): Promise<BattleSummary>;
  clearPendingActions(battleId: string): Promise<BattleSummary>;
  listInProgressPvpForUser(userId: string): Promise<BattleSummary[]>;
  findActivePveForUser(userId: string): Promise<BattleSummary | null>;
  listFinishedForUser(userId: string, limit: number): Promise<FinishedBattleRow[]>;
  getFinishedStatsForUser(userId: string): Promise<FinishedBattleStats[]>;
  setDiscordMessage(battleId: string, input: SetDiscordMessageInput): Promise<BattleSummary>;
  clearDiscordMessage(battleId: string): Promise<BattleSummary>;
  listInProgressWithDiscordMessage(): Promise<BattleSummary[]>;
}

function seedToBuffer(seed: number): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(4);
  const view = new DataView(ab);
  view.setUint32(0, seed >>> 0, false);
  return new Uint8Array(ab);
}

interface PrismaBattleRow {
  id: string;
  mode: BattleMode;
  participantAId: string;
  participantBId: string | null;
  captainId: string | null;
  captainBId: string | null;
  resultJson: unknown;
  pendingActionA: unknown;
  pendingActionB: unknown;
  pendingSubmitAt: Date | null;
  discordChannelId: string | null;
  discordMessageId: string | null;
  discordGuildId: string | null;
  discordMessageSentAt: Date | null;
}

function toSummary(row: PrismaBattleRow): BattleSummary {
  return {
    id: row.id,
    mode: row.mode,
    ownerUserId: row.participantAId,
    participantBId: row.participantBId,
    captainId: row.captainId,
    captainBId: row.captainBId,
    state: row.resultJson as unknown as BattleState,
    pendingActionA: (row.pendingActionA as Action | null) ?? null,
    pendingActionB: (row.pendingActionB as Action | null) ?? null,
    pendingSubmitAt: row.pendingSubmitAt ? row.pendingSubmitAt.getTime() : null,
    discordChannelId: row.discordChannelId,
    discordMessageId: row.discordMessageId,
    discordGuildId: row.discordGuildId,
    discordMessageSentAt: row.discordMessageSentAt ? row.discordMessageSentAt.getTime() : null,
  };
}

export class PrismaBattleStore implements BattleStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateBattleInput): Promise<BattleSummary> {
    const battle = await this.prisma.battle.create({
      data: {
        mode: BattleMode.PVE,
        participantAId: input.ownerUserId,
        participantBId: null,
        captainId: input.captainId,
        seed: seedToBuffer(input.state.rngSeed),
        resultJson: input.state as unknown as object,
      },
    });
    return toSummary(battle);
  }

  async createPvp(input: CreatePvpBattleInput): Promise<BattleSummary> {
    const battle = await this.prisma.battle.create({
      data: {
        mode: BattleMode.PVP,
        participantAId: input.participantAId,
        participantBId: input.participantBId,
        captainId: input.captainAId,
        captainBId: input.captainBId,
        seed: seedToBuffer(input.state.rngSeed),
        resultJson: input.state as unknown as object,
      },
    });
    return toSummary(battle);
  }

  async get(battleId: string): Promise<BattleSummary | null> {
    const battle = await this.prisma.battle.findUnique({
      where: { id: battleId },
    });
    if (!battle || battle.resultJson === null) return null;
    return toSummary(battle);
  }

  async recordTurn(
    battleId: string,
    newState: BattleState,
    newEvents: readonly BattleEvent[],
  ): Promise<BattleSummary> {
    const baseIdx = newState.log.length - newEvents.length;
    await this.prisma.$transaction([
      ...newEvents.map((event, i) =>
        this.prisma.battleEvent.create({
          data: {
            battleId,
            idx: baseIdx + i,
            kindStr: event.kind,
            payloadJson: event as unknown as object,
          },
        }),
      ),
      this.prisma.battle.update({
        where: { id: battleId },
        data: {
          resultJson: newState as unknown as object,
          endedAt: newState.winner !== null ? new Date() : null,
          pendingActionA: Prisma.JsonNull,
          pendingActionB: Prisma.JsonNull,
          pendingSubmitAt: null,
        },
      }),
    ]);
    const battle = await this.prisma.battle.findUniqueOrThrow({
      where: { id: battleId },
    });
    return toSummary(battle);
  }

  async setPendingAction(
    battleId: string,
    side: "A" | "B",
    action: Action | null,
    submittedAt: number | null,
  ): Promise<BattleSummary> {
    const value = action === null ? Prisma.JsonNull : (action as unknown as Prisma.InputJsonValue);
    const data: Prisma.BattleUpdateInput = {
      pendingSubmitAt: submittedAt ? new Date(submittedAt) : null,
    };
    if (side === "A") data.pendingActionA = value;
    else data.pendingActionB = value;
    const updated = await this.prisma.battle.update({
      where: { id: battleId },
      data,
    });
    return toSummary(updated);
  }

  async clearPendingActions(battleId: string): Promise<BattleSummary> {
    const updated = await this.prisma.battle.update({
      where: { id: battleId },
      data: {
        pendingActionA: Prisma.JsonNull,
        pendingActionB: Prisma.JsonNull,
        pendingSubmitAt: null,
      },
    });
    return toSummary(updated);
  }

  async listInProgressPvpForUser(userId: string): Promise<BattleSummary[]> {
    const rows = await this.prisma.battle.findMany({
      where: {
        mode: BattleMode.PVP,
        endedAt: null,
        OR: [{ participantAId: userId }, { participantBId: userId }],
      },
      orderBy: { startedAt: "desc" },
    });
    return rows.filter((r) => r.resultJson !== null).map(toSummary);
  }

  async findActivePveForUser(userId: string): Promise<BattleSummary | null> {
    const row = await this.prisma.battle.findFirst({
      where: {
        mode: BattleMode.PVE,
        endedAt: null,
        participantAId: userId,
      },
      orderBy: { startedAt: "desc" },
    });
    if (!row || row.resultJson === null) return null;
    return toSummary(row);
  }

  async listFinishedForUser(userId: string, limit: number): Promise<FinishedBattleRow[]> {
    const rows = await this.prisma.battle.findMany({
      where: {
        endedAt: { not: null },
        OR: [{ participantAId: userId }, { participantBId: userId }],
      },
      orderBy: { endedAt: "desc" },
      take: limit,
    });
    const out: FinishedBattleRow[] = [];
    for (const row of rows) {
      if (row.resultJson === null || row.endedAt === null) continue;
      const state = row.resultJson as unknown as BattleState;
      if (state.winner === null) continue;
      out.push({
        id: row.id,
        mode: row.mode,
        userSide: row.participantAId === userId ? "A" : "B",
        winner: state.winner,
        turn: state.turn,
        startedAt: row.startedAt.getTime(),
        endedAt: row.endedAt.getTime(),
      });
    }
    return out;
  }

  async getFinishedStatsForUser(userId: string): Promise<FinishedBattleStats[]> {
    const rows = await this.prisma.battle.findMany({
      where: {
        endedAt: { not: null },
        OR: [{ participantAId: userId }, { participantBId: userId }],
      },
      orderBy: { endedAt: "desc" },
      include: { events: { orderBy: { idx: "asc" } } },
    });
    const out: FinishedBattleStats[] = [];
    for (const row of rows) {
      if (row.resultJson === null) continue;
      const state = row.resultJson as unknown as BattleState;
      if (state.winner === null) continue;
      const userSide: Side = row.participantAId === userId ? "A" : "B";
      const events = row.events.map((e) => e.payloadJson as unknown as BattleEvent);
      out.push({ state, userSide, events });
    }
    return out;
  }

  async setDiscordMessage(battleId: string, input: SetDiscordMessageInput): Promise<BattleSummary> {
    const updated = await this.prisma.battle.update({
      where: { id: battleId },
      data: {
        discordChannelId: input.channelId,
        discordMessageId: input.messageId,
        discordGuildId: input.guildId,
        discordMessageSentAt: new Date(input.sentAtMs),
      },
    });
    return toSummary(updated);
  }

  async clearDiscordMessage(battleId: string): Promise<BattleSummary> {
    const updated = await this.prisma.battle.update({
      where: { id: battleId },
      data: {
        discordChannelId: null,
        discordMessageId: null,
        discordGuildId: null,
        discordMessageSentAt: null,
      },
    });
    return toSummary(updated);
  }

  async listInProgressWithDiscordMessage(): Promise<BattleSummary[]> {
    const rows = await this.prisma.battle.findMany({
      where: {
        endedAt: null,
        discordMessageId: { not: null },
      },
      orderBy: { startedAt: "asc" },
    });
    return rows.filter((r) => r.resultJson !== null).map(toSummary);
  }
}

interface InMemoryBattleRow {
  id: string;
  mode: BattleMode;
  ownerUserId: string;
  participantBId: string | null;
  captainId: string | null;
  captainBId: string | null;
  state: BattleState;
  events: BattleEvent[];
  pendingActionA: Action | null;
  pendingActionB: Action | null;
  pendingSubmitAt: number | null;
  startedAt: number;
  endedAt: number | null;
  discordChannelId: string | null;
  discordMessageId: string | null;
  discordGuildId: string | null;
  discordMessageSentAt: number | null;
}

function rowToSummary(row: InMemoryBattleRow): BattleSummary {
  return {
    id: row.id,
    mode: row.mode,
    ownerUserId: row.ownerUserId,
    participantBId: row.participantBId,
    captainId: row.captainId,
    captainBId: row.captainBId,
    state: row.state,
    pendingActionA: row.pendingActionA,
    pendingActionB: row.pendingActionB,
    pendingSubmitAt: row.pendingSubmitAt,
    discordChannelId: row.discordChannelId,
    discordMessageId: row.discordMessageId,
    discordGuildId: row.discordGuildId,
    discordMessageSentAt: row.discordMessageSentAt,
  };
}

export class InMemoryBattleStore implements BattleStore {
  private readonly battles = new Map<string, InMemoryBattleRow>();
  private nextId = 1;
  private nowMs: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.nowMs = opts.now ?? (() => Date.now());
  }

  async create(input: CreateBattleInput): Promise<BattleSummary> {
    const id = `mem_battle_${this.nextId++}`;
    const row: InMemoryBattleRow = {
      id,
      mode: BattleMode.PVE,
      ownerUserId: input.ownerUserId,
      participantBId: null,
      captainId: input.captainId,
      captainBId: null,
      state: input.state,
      events: [],
      pendingActionA: null,
      pendingActionB: null,
      pendingSubmitAt: null,
      startedAt: this.nowMs(),
      endedAt: null,
      discordChannelId: null,
      discordMessageId: null,
      discordGuildId: null,
      discordMessageSentAt: null,
    };
    this.battles.set(id, row);
    return rowToSummary(row);
  }

  async createPvp(input: CreatePvpBattleInput): Promise<BattleSummary> {
    const id = `mem_battle_${this.nextId++}`;
    const row: InMemoryBattleRow = {
      id,
      mode: BattleMode.PVP,
      ownerUserId: input.participantAId,
      participantBId: input.participantBId,
      captainId: input.captainAId,
      captainBId: input.captainBId,
      state: input.state,
      events: [],
      pendingActionA: null,
      pendingActionB: null,
      pendingSubmitAt: null,
      startedAt: this.nowMs(),
      endedAt: null,
      discordChannelId: null,
      discordMessageId: null,
      discordGuildId: null,
      discordMessageSentAt: null,
    };
    this.battles.set(id, row);
    return rowToSummary(row);
  }

  async get(battleId: string): Promise<BattleSummary | null> {
    const row = this.battles.get(battleId);
    if (!row) return null;
    return rowToSummary(row);
  }

  async recordTurn(
    battleId: string,
    newState: BattleState,
    newEvents: readonly BattleEvent[],
  ): Promise<BattleSummary> {
    const row = this.battles.get(battleId);
    if (!row) throw new Error(`battle ${battleId} not found`);
    row.state = newState;
    row.events.push(...newEvents);
    row.pendingActionA = null;
    row.pendingActionB = null;
    row.pendingSubmitAt = null;
    if (newState.winner !== null && row.endedAt === null) {
      row.endedAt = this.nowMs();
    }
    return rowToSummary(row);
  }

  async setPendingAction(
    battleId: string,
    side: "A" | "B",
    action: Action | null,
    submittedAt: number | null,
  ): Promise<BattleSummary> {
    const row = this.battles.get(battleId);
    if (!row) throw new Error(`battle ${battleId} not found`);
    if (side === "A") row.pendingActionA = action;
    else row.pendingActionB = action;
    row.pendingSubmitAt = submittedAt;
    return rowToSummary(row);
  }

  async clearPendingActions(battleId: string): Promise<BattleSummary> {
    const row = this.battles.get(battleId);
    if (!row) throw new Error(`battle ${battleId} not found`);
    row.pendingActionA = null;
    row.pendingActionB = null;
    row.pendingSubmitAt = null;
    return rowToSummary(row);
  }

  async listInProgressPvpForUser(userId: string): Promise<BattleSummary[]> {
    const out: BattleSummary[] = [];
    for (const row of this.battles.values()) {
      if (row.mode !== BattleMode.PVP) continue;
      if (row.state.winner !== null) continue;
      if (row.ownerUserId !== userId && row.participantBId !== userId) continue;
      out.push(rowToSummary(row));
    }
    return out;
  }

  async findActivePveForUser(userId: string): Promise<BattleSummary | null> {
    const matches: InMemoryBattleRow[] = [];
    for (const row of this.battles.values()) {
      if (row.mode !== BattleMode.PVE) continue;
      if (row.endedAt !== null) continue;
      if (row.ownerUserId !== userId) continue;
      matches.push(row);
    }
    matches.sort((a, b) => b.startedAt - a.startedAt);
    const latest = matches[0];
    return latest ? rowToSummary(latest) : null;
  }

  async listFinishedForUser(userId: string, limit: number): Promise<FinishedBattleRow[]> {
    const matches: FinishedBattleRow[] = [];
    for (const row of this.battles.values()) {
      if (row.endedAt === null) continue;
      if (row.state.winner === null) continue;
      if (row.ownerUserId !== userId && row.participantBId !== userId) continue;
      matches.push({
        id: row.id,
        mode: row.mode,
        userSide: row.ownerUserId === userId ? "A" : "B",
        winner: row.state.winner,
        turn: row.state.turn,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
      });
    }
    matches.sort((a, b) => b.endedAt - a.endedAt);
    return matches.slice(0, limit);
  }

  async getFinishedStatsForUser(userId: string): Promise<FinishedBattleStats[]> {
    const out: FinishedBattleStats[] = [];
    const rows = Array.from(this.battles.values()).sort(
      (a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0),
    );
    for (const row of rows) {
      if (row.endedAt === null) continue;
      if (row.state.winner === null) continue;
      if (row.ownerUserId !== userId && row.participantBId !== userId) continue;
      const userSide: Side = row.ownerUserId === userId ? "A" : "B";
      out.push({ state: row.state, userSide, events: row.events });
    }
    return out;
  }

  getEvents(battleId: string): readonly BattleEvent[] {
    const row = this.battles.get(battleId);
    if (!row) return [];
    return row.events;
  }

  async setDiscordMessage(battleId: string, input: SetDiscordMessageInput): Promise<BattleSummary> {
    const row = this.battles.get(battleId);
    if (!row) throw new Error(`battle ${battleId} not found`);
    row.discordChannelId = input.channelId;
    row.discordMessageId = input.messageId;
    row.discordGuildId = input.guildId;
    row.discordMessageSentAt = input.sentAtMs;
    return rowToSummary(row);
  }

  async clearDiscordMessage(battleId: string): Promise<BattleSummary> {
    const row = this.battles.get(battleId);
    if (!row) throw new Error(`battle ${battleId} not found`);
    row.discordChannelId = null;
    row.discordMessageId = null;
    row.discordGuildId = null;
    row.discordMessageSentAt = null;
    return rowToSummary(row);
  }

  async listInProgressWithDiscordMessage(): Promise<BattleSummary[]> {
    const matches: InMemoryBattleRow[] = [];
    for (const row of this.battles.values()) {
      if (row.endedAt !== null) continue;
      if (row.discordMessageId === null) continue;
      matches.push(row);
    }
    matches.sort((a, b) => a.startedAt - b.startedAt);
    return matches.map(rowToSummary);
  }
}
