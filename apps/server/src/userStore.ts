import { CREWS_BY_KEY, TRAINING_CHIP_KEY } from "@pirate-battle/content";
import {
  applyXp,
  DEFAULT_LEVEL,
  maxTrainedDelta,
  trainedDeltaOf,
  type CrewAttrs,
  type TrainableStat,
} from "@pirate-battle/core";
import type { PrismaClient } from "@pirate-battle/db";

export interface CaptainSummary {
  id: string;
  name: string;
  factionId: string;
}

export interface UserSummary {
  id: string;
  stakeAddr: string | null;
  captains: CaptainSummary[];
}

export interface CreateCaptainCrewInput {
  templateKey: string;
  moveKeys: readonly string[];
}

export interface CreateCaptainInput {
  name: string;
  factionId: string;
  crews: readonly CreateCaptainCrewInput[];
}

export interface CaptainTeamCrew {
  id?: string | null;
  templateKey: string;
  moveKeys: string[];
  level?: number;
  xp?: number;
  attrs?: CrewAttrs | null;
}

export interface CaptainTeam {
  id: string;
  name: string;
  factionId: string;
  crews: CaptainTeamCrew[];
}

export interface XpAward {
  crewId: string;
  xpGain: number;
}

export interface CrewProgress {
  crewId: string;
  level: number;
  xp: number;
  levelsGained: number;
}

export type SetDiscordUserIdResult = { ok: true } | { ok: false; reason: "not_found" | "conflict" };

export interface InventoryEntry {
  templateKey: string;
  qty: number;
}

export type ConsumeItemResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: "not_found" | "insufficient_qty" };

export type TrainCrewResult =
  | {
      ok: true;
      crew: CaptainTeamCrew;
      remainingChips: number;
    }
  | {
      ok: false;
      reason: "not_found" | "no_chips" | "at_cap" | "unknown_template";
    };

export interface CrewRef {
  id: string;
  templateKey: string;
  captainId: string;
}

export interface UserStore {
  createAnonymous(): Promise<UserSummary>;
  findById(id: string): Promise<UserSummary | null>;
  findByStakeAddr(stakeAddr: string): Promise<UserSummary | null>;
  createWithStakeAddr(stakeAddr: string): Promise<UserSummary>;
  attachStakeAddrToUser(userId: string, stakeAddr: string): Promise<UserSummary | null>;
  mergeAnonymousIntoWallet(anonUserId: string, walletUserId: string): Promise<UserSummary | null>;
  createCaptain(userId: string, input: CreateCaptainInput): Promise<CaptainSummary | null>;
  getCaptainTeam(userId: string, captainId: string): Promise<CaptainTeam | null>;
  findCrewForUser(userId: string, crewId: string): Promise<CrewRef | null>;
  applyXpRewards(awards: readonly XpAward[]): Promise<CrewProgress[]>;
  setDiscordUserId(userId: string, discordUserId: string): Promise<SetDiscordUserIdResult>;
  getInventory(userId: string): Promise<InventoryEntry[]>;
  grantItems(userId: string, templateKey: string, qty: number): Promise<InventoryEntry | null>;
  consumeItem(userId: string, templateKey: string, qty: number): Promise<ConsumeItemResult>;
  trainCrewAttribute(input: TrainCrewInput): Promise<TrainCrewResult>;
}

export interface TrainCrewInput {
  userId: string;
  captainId: string;
  crewId: string;
  stat: TrainableStat;
}

function parseAttrs(raw: unknown): CrewAttrs | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const attrs: CrewAttrs = {};
  for (const key of ["hp", "atk", "def", "spd"] as const) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      attrs[key] = v;
    }
  }
  return Object.keys(attrs).length > 0 ? attrs : null;
}

export class PrismaUserStore implements UserStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createAnonymous(): Promise<UserSummary> {
    const user = await this.prisma.user.create({
      data: { stakeAddr: null },
    });
    return { id: user.id, stakeAddr: user.stakeAddr, captains: [] };
  }

  async findById(id: string): Promise<UserSummary | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        captains: {
          select: { id: true, name: true, factionId: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      stakeAddr: user.stakeAddr,
      captains: user.captains,
    };
  }

  async findByStakeAddr(stakeAddr: string): Promise<UserSummary | null> {
    const user = await this.prisma.user.findUnique({
      where: { stakeAddr },
      include: {
        captains: {
          select: { id: true, name: true, factionId: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      stakeAddr: user.stakeAddr,
      captains: user.captains,
    };
  }

  async createWithStakeAddr(stakeAddr: string): Promise<UserSummary> {
    const user = await this.prisma.user.create({ data: { stakeAddr } });
    return { id: user.id, stakeAddr: user.stakeAddr, captains: [] };
  }

  async attachStakeAddrToUser(userId: string, stakeAddr: string): Promise<UserSummary | null> {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { stakeAddr },
        include: {
          captains: {
            select: { id: true, name: true, factionId: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      return {
        id: updated.id,
        stakeAddr: updated.stakeAddr,
        captains: updated.captains,
      };
    } catch {
      return null;
    }
  }

  async mergeAnonymousIntoWallet(
    anonUserId: string,
    walletUserId: string,
  ): Promise<UserSummary | null> {
    if (anonUserId === walletUserId) return this.findById(walletUserId);
    return this.prisma.$transaction(async (tx) => {
      const anon = await tx.user.findUnique({ where: { id: anonUserId } });
      if (!anon) return null;
      if (anon.stakeAddr !== null) return null;

      const wallet = await tx.user.findUnique({ where: { id: walletUserId } });
      if (!wallet) return null;

      await tx.captain.updateMany({
        where: { userId: anonUserId },
        data: { userId: walletUserId },
      });
      await tx.battle.updateMany({
        where: { participantAId: anonUserId },
        data: { participantAId: walletUserId },
      });
      await tx.user.delete({ where: { id: anonUserId } });

      const merged = await tx.user.findUnique({
        where: { id: walletUserId },
        include: {
          captains: {
            select: { id: true, name: true, factionId: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!merged) return null;
      return {
        id: merged.id,
        stakeAddr: merged.stakeAddr,
        captains: merged.captains,
      };
    });
  }

  async createCaptain(userId: string, input: CreateCaptainInput): Promise<CaptainSummary | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const captain = await this.prisma.captain.create({
      data: {
        userId,
        name: input.name,
        factionId: input.factionId,
        crews: {
          create: input.crews.map((crew) => ({
            templateKey: crew.templateKey,
            level: DEFAULT_LEVEL,
            moves: {
              create: crew.moveKeys.map((moveKey, slot) => ({
                moveKey,
                slot,
              })),
            },
          })),
        },
      },
      select: { id: true, name: true, factionId: true },
    });
    return captain;
  }

  async getCaptainTeam(userId: string, captainId: string): Promise<CaptainTeam | null> {
    const captain = await this.prisma.captain.findUnique({
      where: { id: captainId },
      include: {
        crews: {
          orderBy: { createdAt: "asc" },
          include: { moves: { orderBy: { slot: "asc" } } },
        },
      },
    });
    if (!captain || captain.userId !== userId) return null;
    return {
      id: captain.id,
      name: captain.name,
      factionId: captain.factionId,
      crews: captain.crews.map((c) => ({
        id: c.id,
        templateKey: c.templateKey,
        moveKeys: c.moves.map((m) => m.moveKey),
        level: c.level,
        xp: c.xp,
        attrs: parseAttrs(c.attrs),
      })),
    };
  }

  async findCrewForUser(userId: string, crewId: string): Promise<CrewRef | null> {
    const crew = await this.prisma.crew.findUnique({
      where: { id: crewId },
      include: { captain: { select: { userId: true } } },
    });
    if (!crew || crew.captain.userId !== userId) return null;
    return { id: crew.id, templateKey: crew.templateKey, captainId: crew.captainId };
  }

  async applyXpRewards(awards: readonly XpAward[]): Promise<CrewProgress[]> {
    if (awards.length === 0) return [];
    return this.prisma.$transaction(async (tx) => {
      const out: CrewProgress[] = [];
      for (const award of awards) {
        const crew = await tx.crew.findUnique({ where: { id: award.crewId } });
        if (!crew) continue;
        const result = applyXp(crew.level, crew.xp, award.xpGain);
        await tx.crew.update({
          where: { id: award.crewId },
          data: { level: result.level, xp: result.xp },
        });
        out.push({
          crewId: award.crewId,
          level: result.level,
          xp: result.xp,
          levelsGained: result.levelsGained,
        });
      }
      return out;
    });
  }

  async setDiscordUserId(userId: string, discordUserId: string): Promise<SetDiscordUserIdResult> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) return { ok: false, reason: "not_found" };
      const taken = await tx.user.findUnique({ where: { discordUserId } });
      if (taken && taken.id !== userId) {
        return { ok: false, reason: "conflict" };
      }
      await tx.user.update({ where: { id: userId }, data: { discordUserId } });
      return { ok: true };
    });
  }

  async getInventory(userId: string): Promise<InventoryEntry[]> {
    const items = await this.prisma.item.findMany({
      where: { ownerUserId: userId },
      orderBy: { templateKey: "asc" },
      select: { templateKey: true, qty: true },
    });
    return items;
  }

  async grantItems(
    userId: string,
    templateKey: string,
    qty: number,
  ): Promise<InventoryEntry | null> {
    if (!Number.isInteger(qty) || qty <= 0) return null;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const updated = await this.prisma.item.upsert({
      where: { ownerUserId_templateKey: { ownerUserId: userId, templateKey } },
      create: { ownerUserId: userId, templateKey, qty },
      update: { qty: { increment: qty } },
      select: { templateKey: true, qty: true },
    });
    return updated;
  }

  async consumeItem(userId: string, templateKey: string, qty: number): Promise<ConsumeItemResult> {
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: "insufficient_qty" };
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.item.findUnique({
        where: { ownerUserId_templateKey: { ownerUserId: userId, templateKey } },
      });
      if (!existing) return { ok: false, reason: "not_found" };
      if (existing.qty < qty) return { ok: false, reason: "insufficient_qty" };
      const updated = await tx.item.update({
        where: { ownerUserId_templateKey: { ownerUserId: userId, templateKey } },
        data: { qty: { decrement: qty } },
        select: { qty: true },
      });
      return { ok: true, remaining: updated.qty };
    });
  }

  async trainCrewAttribute(input: TrainCrewInput): Promise<TrainCrewResult> {
    return this.prisma.$transaction(async (tx) => {
      const captain = await tx.captain.findUnique({
        where: { id: input.captainId },
        select: { userId: true },
      });
      if (!captain || captain.userId !== input.userId) {
        return { ok: false, reason: "not_found" };
      }
      const crew = await tx.crew.findUnique({ where: { id: input.crewId } });
      if (!crew || crew.captainId !== input.captainId) {
        return { ok: false, reason: "not_found" };
      }

      const template = CREWS_BY_KEY[crew.templateKey];
      if (!template) {
        return { ok: false, reason: "unknown_template" };
      }

      const attrs = parseAttrs(crew.attrs) ?? {};
      const current = trainedDeltaOf(attrs, input.stat);
      if (current >= maxTrainedDelta(template.baseStats[input.stat])) {
        return { ok: false, reason: "at_cap" };
      }

      const chip = await tx.item.findUnique({
        where: {
          ownerUserId_templateKey: {
            ownerUserId: input.userId,
            templateKey: TRAINING_CHIP_KEY,
          },
        },
      });
      if (!chip || chip.qty < 1) {
        return { ok: false, reason: "no_chips" };
      }

      const nextAttrs: CrewAttrs = { ...attrs, [input.stat]: current + 1 };
      await tx.crew.update({
        where: { id: crew.id },
        data: { attrs: nextAttrs as Record<string, number> },
      });
      const remaining = await tx.item.update({
        where: {
          ownerUserId_templateKey: {
            ownerUserId: input.userId,
            templateKey: TRAINING_CHIP_KEY,
          },
        },
        data: { qty: { decrement: 1 } },
        select: { qty: true },
      });

      const refreshed = await tx.crew.findUnique({
        where: { id: crew.id },
        include: { moves: { orderBy: { slot: "asc" } } },
      });
      if (!refreshed) return { ok: false, reason: "not_found" };

      return {
        ok: true,
        crew: {
          id: refreshed.id,
          templateKey: refreshed.templateKey,
          moveKeys: refreshed.moves.map((m) => m.moveKey),
          level: refreshed.level,
          xp: refreshed.xp,
          attrs: parseAttrs(refreshed.attrs),
        },
        remainingChips: remaining.qty,
      };
    });
  }
}

interface InMemoryCrew {
  id: string;
  templateKey: string;
  moveKeys: readonly string[];
  level: number;
  xp: number;
  attrs: CrewAttrs | null;
}

interface InMemoryCaptain extends CaptainSummary {
  userId: string;
  crews: InMemoryCrew[];
}

export class InMemoryUserStore implements UserStore {
  private readonly users = new Map<string, UserSummary>();
  private readonly captains = new Map<string, InMemoryCaptain>();
  private readonly discordUserIds = new Map<string, string>();
  private readonly inventories = new Map<string, Map<string, number>>();
  private nextUserId = 1;
  private nextCaptainId = 1;
  private nextCrewId = 1;

  async createAnonymous(): Promise<UserSummary> {
    const id = `mem_user_${this.nextUserId++}`;
    const user: UserSummary = { id, stakeAddr: null, captains: [] };
    this.users.set(id, user);
    return user;
  }

  async findById(id: string): Promise<UserSummary | null> {
    return this.users.get(id) ?? null;
  }

  async findByStakeAddr(stakeAddr: string): Promise<UserSummary | null> {
    for (const user of this.users.values()) {
      if (user.stakeAddr === stakeAddr) return user;
    }
    return null;
  }

  async createWithStakeAddr(stakeAddr: string): Promise<UserSummary> {
    const id = `mem_user_${this.nextUserId++}`;
    const user: UserSummary = { id, stakeAddr, captains: [] };
    this.users.set(id, user);
    return user;
  }

  async attachStakeAddrToUser(userId: string, stakeAddr: string): Promise<UserSummary | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    for (const other of this.users.values()) {
      if (other.id !== userId && other.stakeAddr === stakeAddr) return null;
    }
    user.stakeAddr = stakeAddr;
    return user;
  }

  async mergeAnonymousIntoWallet(
    anonUserId: string,
    walletUserId: string,
  ): Promise<UserSummary | null> {
    if (anonUserId === walletUserId) return this.users.get(walletUserId) ?? null;
    const anon = this.users.get(anonUserId);
    if (!anon) return null;
    if (anon.stakeAddr !== null) return null;
    const wallet = this.users.get(walletUserId);
    if (!wallet) return null;

    for (const captain of this.captains.values()) {
      if (captain.userId === anonUserId) {
        captain.userId = walletUserId;
        wallet.captains.push({
          id: captain.id,
          name: captain.name,
          factionId: captain.factionId,
        });
      }
    }
    this.users.delete(anonUserId);
    return wallet;
  }

  async createCaptain(userId: string, input: CreateCaptainInput): Promise<CaptainSummary | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    const captainId = `mem_captain_${this.nextCaptainId++}`;
    const captain: InMemoryCaptain = {
      id: captainId,
      userId,
      name: input.name,
      factionId: input.factionId,
      crews: input.crews.map((crew) => ({
        id: `mem_crew_${this.nextCrewId++}`,
        templateKey: crew.templateKey,
        moveKeys: [...crew.moveKeys],
        level: DEFAULT_LEVEL,
        xp: 0,
        attrs: null,
      })),
    };
    this.captains.set(captainId, captain);
    user.captains.push({
      id: captain.id,
      name: captain.name,
      factionId: captain.factionId,
    });
    return { id: captain.id, name: captain.name, factionId: captain.factionId };
  }

  async getCaptainTeam(userId: string, captainId: string): Promise<CaptainTeam | null> {
    const captain = this.captains.get(captainId);
    if (!captain || captain.userId !== userId) return null;
    return {
      id: captain.id,
      name: captain.name,
      factionId: captain.factionId,
      crews: captain.crews.map((c) => ({
        id: c.id,
        templateKey: c.templateKey,
        moveKeys: [...c.moveKeys],
        level: c.level,
        xp: c.xp,
        attrs: c.attrs,
      })),
    };
  }

  async findCrewForUser(userId: string, crewId: string): Promise<CrewRef | null> {
    for (const captain of this.captains.values()) {
      if (captain.userId !== userId) continue;
      const crew = captain.crews.find((c) => c.id === crewId);
      if (crew) {
        return { id: crew.id, templateKey: crew.templateKey, captainId: captain.id };
      }
    }
    return null;
  }

  async applyXpRewards(awards: readonly XpAward[]): Promise<CrewProgress[]> {
    if (awards.length === 0) return [];
    const out: CrewProgress[] = [];
    for (const award of awards) {
      const captain = this.findCaptainByCrewId(award.crewId);
      if (!captain) continue;
      const crew = captain.crews.find((c) => c.id === award.crewId);
      if (!crew) continue;
      const result = applyXp(crew.level, crew.xp, award.xpGain);
      crew.level = result.level;
      crew.xp = result.xp;
      out.push({
        crewId: crew.id,
        level: result.level,
        xp: result.xp,
        levelsGained: result.levelsGained,
      });
    }
    return out;
  }

  async setDiscordUserId(userId: string, discordUserId: string): Promise<SetDiscordUserIdResult> {
    if (!this.users.has(userId)) return { ok: false, reason: "not_found" };
    const existingOwner = this.discordUserIds.get(discordUserId);
    if (existingOwner && existingOwner !== userId) {
      return { ok: false, reason: "conflict" };
    }
    for (const [discord, owner] of this.discordUserIds.entries()) {
      if (owner === userId && discord !== discordUserId) {
        this.discordUserIds.delete(discord);
      }
    }
    this.discordUserIds.set(discordUserId, userId);
    return { ok: true };
  }

  getDiscordUserId(userId: string): string | undefined {
    for (const [discord, owner] of this.discordUserIds.entries()) {
      if (owner === userId) return discord;
    }
    return undefined;
  }

  private findCaptainByCrewId(crewId: string): InMemoryCaptain | undefined {
    for (const captain of this.captains.values()) {
      if (captain.crews.some((c) => c.id === crewId)) return captain;
    }
    return undefined;
  }

  getCaptain(id: string): InMemoryCaptain | undefined {
    return this.captains.get(id);
  }

  async getInventory(userId: string): Promise<InventoryEntry[]> {
    const inv = this.inventories.get(userId);
    if (!inv) return [];
    return Array.from(inv.entries())
      .filter(([, qty]) => qty > 0)
      .map(([templateKey, qty]) => ({ templateKey, qty }))
      .sort((a, b) => a.templateKey.localeCompare(b.templateKey));
  }

  async grantItems(
    userId: string,
    templateKey: string,
    qty: number,
  ): Promise<InventoryEntry | null> {
    if (!Number.isInteger(qty) || qty <= 0) return null;
    if (!this.users.has(userId)) return null;
    let inv = this.inventories.get(userId);
    if (!inv) {
      inv = new Map();
      this.inventories.set(userId, inv);
    }
    const next = (inv.get(templateKey) ?? 0) + qty;
    inv.set(templateKey, next);
    return { templateKey, qty: next };
  }

  async consumeItem(userId: string, templateKey: string, qty: number): Promise<ConsumeItemResult> {
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: "insufficient_qty" };
    const inv = this.inventories.get(userId);
    const current = inv?.get(templateKey) ?? 0;
    if (!inv || current === 0) return { ok: false, reason: "not_found" };
    if (current < qty) return { ok: false, reason: "insufficient_qty" };
    const remaining = current - qty;
    inv.set(templateKey, remaining);
    return { ok: true, remaining };
  }

  async trainCrewAttribute(input: TrainCrewInput): Promise<TrainCrewResult> {
    const captain = this.captains.get(input.captainId);
    if (!captain || captain.userId !== input.userId) {
      return { ok: false, reason: "not_found" };
    }
    const crew = captain.crews.find((c) => c.id === input.crewId);
    if (!crew) return { ok: false, reason: "not_found" };

    const template = CREWS_BY_KEY[crew.templateKey];
    if (!template) return { ok: false, reason: "unknown_template" };

    const attrs: CrewAttrs = { ...(crew.attrs ?? {}) };
    const current = trainedDeltaOf(attrs, input.stat);
    if (current >= maxTrainedDelta(template.baseStats[input.stat])) {
      return { ok: false, reason: "at_cap" };
    }

    const inv = this.inventories.get(input.userId);
    const qty = inv?.get(TRAINING_CHIP_KEY) ?? 0;
    if (qty < 1) return { ok: false, reason: "no_chips" };

    attrs[input.stat] = current + 1;
    crew.attrs = attrs;
    inv!.set(TRAINING_CHIP_KEY, qty - 1);

    return {
      ok: true,
      crew: {
        id: crew.id,
        templateKey: crew.templateKey,
        moveKeys: [...crew.moveKeys],
        level: crew.level,
        xp: crew.xp,
        attrs: { ...attrs },
      },
      remainingChips: qty - 1,
    };
  }
}
