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
  templateKey: string;
  moveKeys: string[];
}

export interface CaptainTeam {
  id: string;
  name: string;
  factionId: string;
  crews: CaptainTeamCrew[];
}

export interface UserStore {
  createAnonymous(): Promise<UserSummary>;
  findById(id: string): Promise<UserSummary | null>;
  createCaptain(
    userId: string,
    input: CreateCaptainInput,
  ): Promise<CaptainSummary | null>;
  getCaptainTeam(
    userId: string,
    captainId: string,
  ): Promise<CaptainTeam | null>;
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

  async createCaptain(
    userId: string,
    input: CreateCaptainInput,
  ): Promise<CaptainSummary | null> {
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

  async getCaptainTeam(
    userId: string,
    captainId: string,
  ): Promise<CaptainTeam | null> {
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
        templateKey: c.templateKey,
        moveKeys: c.moves.map((m) => m.moveKey),
      })),
    };
  }
}

interface InMemoryCrew {
  id: string;
  templateKey: string;
  moveKeys: readonly string[];
}

interface InMemoryCaptain extends CaptainSummary {
  userId: string;
  crews: InMemoryCrew[];
}

export class InMemoryUserStore implements UserStore {
  private readonly users = new Map<string, UserSummary>();
  private readonly captains = new Map<string, InMemoryCaptain>();
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

  async createCaptain(
    userId: string,
    input: CreateCaptainInput,
  ): Promise<CaptainSummary | null> {
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

  async getCaptainTeam(
    userId: string,
    captainId: string,
  ): Promise<CaptainTeam | null> {
    const captain = this.captains.get(captainId);
    if (!captain || captain.userId !== userId) return null;
    return {
      id: captain.id,
      name: captain.name,
      factionId: captain.factionId,
      crews: captain.crews.map((c) => ({
        templateKey: c.templateKey,
        moveKeys: [...c.moveKeys],
      })),
    };
  }

  getCaptain(id: string): InMemoryCaptain | undefined {
    return this.captains.get(id);
  }
}
