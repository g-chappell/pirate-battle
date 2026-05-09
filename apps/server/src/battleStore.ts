import type { BattleEvent, BattleState } from "@pirate-battle/core";
import { BattleMode, type PrismaClient } from "@pirate-battle/db";

export interface BattleSummary {
  id: string;
  ownerUserId: string;
  state: BattleState;
}

export interface CreateBattleInput {
  ownerUserId: string;
  state: BattleState;
}

export interface BattleStore {
  create(input: CreateBattleInput): Promise<BattleSummary>;
  get(battleId: string): Promise<BattleSummary | null>;
  recordTurn(
    battleId: string,
    newState: BattleState,
    newEvents: readonly BattleEvent[],
  ): Promise<BattleSummary>;
}

function seedToBuffer(seed: number): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(4);
  const view = new DataView(ab);
  view.setUint32(0, seed >>> 0, false);
  return new Uint8Array(ab);
}

export class PrismaBattleStore implements BattleStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateBattleInput): Promise<BattleSummary> {
    const battle = await this.prisma.battle.create({
      data: {
        mode: BattleMode.PVE,
        participantAId: input.ownerUserId,
        participantBId: null,
        seed: seedToBuffer(input.state.rngSeed),
        resultJson: input.state as unknown as object,
      },
    });
    return {
      id: battle.id,
      ownerUserId: battle.participantAId,
      state: input.state,
    };
  }

  async get(battleId: string): Promise<BattleSummary | null> {
    const battle = await this.prisma.battle.findUnique({
      where: { id: battleId },
    });
    if (!battle || battle.resultJson === null) return null;
    return {
      id: battle.id,
      ownerUserId: battle.participantAId,
      state: battle.resultJson as unknown as BattleState,
    };
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
        },
      }),
    ]);
    const battle = await this.prisma.battle.findUniqueOrThrow({
      where: { id: battleId },
    });
    return {
      id: battle.id,
      ownerUserId: battle.participantAId,
      state: newState,
    };
  }
}

interface InMemoryBattleRow {
  id: string;
  ownerUserId: string;
  state: BattleState;
  events: BattleEvent[];
}

export class InMemoryBattleStore implements BattleStore {
  private readonly battles = new Map<string, InMemoryBattleRow>();
  private nextId = 1;

  async create(input: CreateBattleInput): Promise<BattleSummary> {
    const id = `mem_battle_${this.nextId++}`;
    const row: InMemoryBattleRow = {
      id,
      ownerUserId: input.ownerUserId,
      state: input.state,
      events: [],
    };
    this.battles.set(id, row);
    return { id, ownerUserId: row.ownerUserId, state: row.state };
  }

  async get(battleId: string): Promise<BattleSummary | null> {
    const row = this.battles.get(battleId);
    if (!row) return null;
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      state: row.state,
    };
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
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      state: row.state,
    };
  }

  getEvents(battleId: string): readonly BattleEvent[] {
    const row = this.battles.get(battleId);
    if (!row) return [];
    return row.events;
  }
}
