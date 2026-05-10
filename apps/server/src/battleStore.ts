import type { Action, BattleEvent, BattleState } from "@pirate-battle/core";
import { BattleMode, Prisma, type PrismaClient } from "@pirate-battle/db";

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
  };
}

export class InMemoryBattleStore implements BattleStore {
  private readonly battles = new Map<string, InMemoryBattleRow>();
  private nextId = 1;

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

  getEvents(battleId: string): readonly BattleEvent[] {
    const row = this.battles.get(battleId);
    if (!row) return [];
    return row.events;
  }
}
