import { PrismaClient } from "../generated/client/index.js";

export type { Prisma } from "../generated/client/index.js";
export { PrismaClient, BattleMode } from "../generated/client/index.js";

let cached: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!cached) {
    cached = new PrismaClient();
  }
  return cached;
}

export const prisma: PrismaClient = getPrisma();
