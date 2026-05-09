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

export interface UserStore {
  createAnonymous(): Promise<UserSummary>;
  findById(id: string): Promise<UserSummary | null>;
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
}

export class InMemoryUserStore implements UserStore {
  private readonly users = new Map<string, UserSummary>();
  private nextId = 1;

  async createAnonymous(): Promise<UserSummary> {
    const id = `mem_user_${this.nextId++}`;
    const user: UserSummary = { id, stakeAddr: null, captains: [] };
    this.users.set(id, user);
    return user;
  }

  async findById(id: string): Promise<UserSummary | null> {
    return this.users.get(id) ?? null;
  }
}
