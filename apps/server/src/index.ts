import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";

import { InMemoryBattleStore, PrismaBattleStore, type BattleStore } from "./battleStore.js";
import {
  BlockfrostHttpClient,
  BlockfrostNftService,
  getNetworkFromEnv,
  loadAllowlistFromEnv,
} from "./cardano/blockfrost.js";
import {
  InMemoryCollectionStore,
  PrismaCollectionStore,
  type CollectionStore,
} from "./cardano/collectionStore.js";
import { PrismaNftSnapshotStore } from "./cardano/nftSnapshotStore.js";
import { InMemoryDiscordLinkTokenStore, type DiscordLinkTokenStore } from "./discordLinkStore.js";
import { InMemoryNonceStore, type NonceStore } from "./nonceStore.js";
import {
  InMemoryPvpChallengeStore,
  PrismaPvpChallengeStore,
  type PvpChallengeStore,
} from "./pvpChallengeStore.js";
import { InMemoryPvpQueueStore, PrismaPvpQueueStore, type PvpQueueStore } from "./pvpQueueStore.js";
import { RosterDerivationService } from "./rosterDerivation.js";
import { authRoutes } from "./routes/auth.js";
import { battleRoutes } from "./routes/battle.js";
import { captainRoutes } from "./routes/captain.js";
import { crewRoutes } from "./routes/crew.js";
import { discordCommandRoutes } from "./routes/discordCommands.js";
import { discordLinkRoutes } from "./routes/discordLink.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { pvpRoutes } from "./routes/pvp.js";
import { rosterRoutes } from "./routes/roster.js";
import { sessionRoutes } from "./routes/session.js";
import { statsRoutes } from "./routes/stats.js";
import { InMemorySeasonStore, PrismaSeasonStore, type SeasonStore } from "./seasonStore.js";
import { InMemoryUserStore, PrismaUserStore, type UserStore } from "./userStore.js";
import { CardanoWalletAuthVerifier, type WalletAuthVerifier } from "./walletAuth.js";

export interface BuildServerOptions {
  sessionSecret: string;
  userStore: UserStore;
  battleStore: BattleStore;
  nonceStore?: NonceStore;
  discordLinkTokenStore?: DiscordLinkTokenStore;
  pvpChallengeStore?: PvpChallengeStore;
  pvpQueueStore?: PvpQueueStore;
  seasonStore?: SeasonStore;
  walletAuthVerifier?: WalletAuthVerifier;
  nftService?: BlockfrostNftService;
  derivationService?: RosterDerivationService;
  seedFactory?: () => number;
  nowFn?: () => number;
  logger?: boolean;
  webDistPath?: string;
}

export function buildServer(opts: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? true });

  app.register(fastifyCookie, { secret: opts.sessionSecret });

  app.get("/health", async () => ({ ok: true }));

  app.register(sessionRoutes, { userStore: opts.userStore });
  app.register(captainRoutes, { userStore: opts.userStore });
  app.register(crewRoutes, { userStore: opts.userStore });
  app.register(inventoryRoutes, { userStore: opts.userStore });
  app.register(rosterRoutes, {
    userStore: opts.userStore,
    nftService: opts.nftService,
    derivationService: opts.derivationService,
  });
  app.register(battleRoutes, {
    userStore: opts.userStore,
    battleStore: opts.battleStore,
    seedFactory: opts.seedFactory,
  });
  app.register(authRoutes, {
    userStore: opts.userStore,
    nonceStore: opts.nonceStore ?? new InMemoryNonceStore(),
    verifier: opts.walletAuthVerifier ?? new CardanoWalletAuthVerifier(),
  });
  app.register(discordLinkRoutes, {
    userStore: opts.userStore,
    tokenStore: opts.discordLinkTokenStore ?? new InMemoryDiscordLinkTokenStore(),
  });
  app.register(discordCommandRoutes, {
    userStore: opts.userStore,
    battleStore: opts.battleStore,
    seedFactory: opts.seedFactory,
  });
  app.register(pvpRoutes, {
    userStore: opts.userStore,
    battleStore: opts.battleStore,
    challengeStore: opts.pvpChallengeStore ?? new InMemoryPvpChallengeStore(),
    queueStore: opts.pvpQueueStore ?? new InMemoryPvpQueueStore(),
    seasonStore: opts.seasonStore,
    seedFactory: opts.seedFactory,
    nowFn: opts.nowFn,
  });
  app.register(statsRoutes, {
    userStore: opts.userStore,
    battleStore: opts.battleStore,
    nowFn: opts.nowFn,
  });
  if (opts.seasonStore) {
    app.register(leaderboardRoutes, { seasonStore: opts.seasonStore });
  }

  if (opts.webDistPath) {
    app.register(fastifyStatic, {
      root: opts.webDistPath,
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      const accept = req.headers.accept ?? "";
      const isHtmlNav =
        req.method === "GET" &&
        !req.url.startsWith("/api/") &&
        req.url !== "/health" &&
        accept.includes("text/html");
      if (isHtmlNav) {
        return reply.type("text/html").sendFile("index.html");
      }
      return reply.code(404).send({
        message: `Route ${req.method}:${req.url} not found`,
        error: "Not Found",
        statusCode: 404,
      });
    });
  }

  return app;
}

export {
  InMemoryUserStore,
  PrismaUserStore,
  InMemoryBattleStore,
  PrismaBattleStore,
  InMemoryNonceStore,
  InMemoryDiscordLinkTokenStore,
  InMemoryPvpChallengeStore,
  PrismaPvpChallengeStore,
  InMemoryPvpQueueStore,
  PrismaPvpQueueStore,
  InMemorySeasonStore,
  PrismaSeasonStore,
  InMemoryCollectionStore,
  PrismaCollectionStore,
  CardanoWalletAuthVerifier,
  RosterDerivationService,
};
export type {
  UserStore,
  BattleStore,
  NonceStore,
  DiscordLinkTokenStore,
  PvpChallengeStore,
  PvpQueueStore,
  SeasonStore,
  WalletAuthVerifier,
  CollectionStore,
};

function resolveWebDistPath(): string | undefined {
  if (process.env.WEB_DIST_PATH) return process.env.WEB_DIST_PATH;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, "../../web/dist"), resolve(here, "../../../web/dist")];
  return candidates.find((p) => existsSync(resolve(p, "index.html")));
}

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
  const pvpChallengeStore = new PrismaPvpChallengeStore(prismaClient);
  const pvpQueueStore = new PrismaPvpQueueStore(prismaClient);
  const seasonStore = new PrismaSeasonStore(prismaClient);

  const blockfrostProjectId = process.env.BLOCKFROST_PROJECT_ID;
  const allowlist = loadAllowlistFromEnv(process.env);
  const nftService =
    blockfrostProjectId && allowlist.length > 0
      ? new BlockfrostNftService({
          client: new BlockfrostHttpClient({
            projectId: blockfrostProjectId,
            network: getNetworkFromEnv(process.env),
          }),
          store: new PrismaNftSnapshotStore(prismaClient),
          allowlist,
        })
      : undefined;

  const collectionStore = new PrismaCollectionStore(prismaClient);
  const collections = await collectionStore.listAll();
  const derivationService = new RosterDerivationService(collections);

  const webDistPath = resolveWebDistPath();
  const app = buildServer({
    sessionSecret,
    userStore,
    battleStore,
    nftService,
    derivationService,
    pvpChallengeStore,
    pvpQueueStore,
    seasonStore,
    webDistPath,
  });
  if (webDistPath) {
    app.log.info({ webDistPath }, "serving web client");
  } else {
    app.log.warn("web client dist not found; SPA will not be served");
  }
  app.listen({ port, host }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
