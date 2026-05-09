import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";

import {
  InMemoryBattleStore,
  PrismaBattleStore,
  type BattleStore,
} from "./battleStore.js";
import { battleRoutes } from "./routes/battle.js";
import { captainRoutes } from "./routes/captain.js";
import { sessionRoutes } from "./routes/session.js";
import {
  InMemoryUserStore,
  PrismaUserStore,
  type UserStore,
} from "./userStore.js";

export interface BuildServerOptions {
  sessionSecret: string;
  userStore: UserStore;
  battleStore: BattleStore;
  seedFactory?: () => number;
  logger?: boolean;
}

export function buildServer(opts: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? true });

  app.register(fastifyCookie, { secret: opts.sessionSecret });

  app.get("/health", async () => ({ ok: true }));

  app.register(sessionRoutes, { userStore: opts.userStore });
  app.register(captainRoutes, { userStore: opts.userStore });
  app.register(battleRoutes, {
    userStore: opts.userStore,
    battleStore: opts.battleStore,
    seedFactory: opts.seedFactory,
  });

  return app;
}

export {
  InMemoryUserStore,
  PrismaUserStore,
  InMemoryBattleStore,
  PrismaBattleStore,
};
export type { UserStore, BattleStore };

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error("SESSION_SECRET environment variable is required");
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";

  const { getPrisma } = await import("@pirate-battle/db");
  const prismaClient = getPrisma();
  const userStore = new PrismaUserStore(prismaClient);
  const battleStore = new PrismaBattleStore(prismaClient);

  const app = buildServer({ sessionSecret, userStore, battleStore });
  app.listen({ port, host }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
