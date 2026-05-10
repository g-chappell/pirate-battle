import { applyXp, DEFAULT_LEVEL, type CrewAttrs } from "@pirate-battle/core";
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

export interface UserStore {
  createAnonymous(): Promise<UserSummary>;
  findById(id: string): Promise<UserSummary | null>;
  findByStakeAddr(stakeAddr: string): Promise<UserSummary | null>;
  createWithStakeAddr(stakeAddr: string): Promise<UserSummary>;
  attachStakeAddrToUser(userId: string, stakeAddr: string): Promise<UserSummary | null>;
  mergeAnonymousIntoWallet(anonUserId: string, walletUserId: string): Promise<UserSummary | null>;
  createCaptain(userId: string, input: CreateCaptainInput): Promise<CaptainSummary | null>;
  getCaptainTeam(userId: string, captainId: string): Promise<CaptainTeam | null>;
  applyXpRewards(awards: readonly XpAward[]): Promise<CrewProgress[]>;
  setDiscordUserId(userId: string, discordUserId: string): Promise<SetDiscordUserIdResult>;
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
}
