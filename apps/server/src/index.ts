import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";

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
import {
  InMemoryBattleStore,
  PrismaBattleStore,
  type BattleStore,
} from "./battleStore.js";
import {
  InMemoryDiscordLinkTokenStore,
  type DiscordLinkTokenStore,
} from "./discordLinkStore.js";
import { InMemoryNonceStore, type NonceStore } from "./nonceStore.js";
import {
  InMemoryPvpChallengeStore,
  PrismaPvpChallengeStore,
  type PvpChallengeStore,
} from "./pvpChallengeStore.js";
import {
  InMemoryPvpQueueStore,
  PrismaPvpQueueStore,
  type PvpQueueStore,
} from "./pvpQueueStore.js";
import { RosterDerivationService } from "./rosterDerivation.js";
import { authRoutes } from "./routes/auth.js";
import { battleRoutes } from "./routes/battle.js";
import { captainRoutes } from "./routes/captain.js";
import { discordLinkRoutes } from "./routes/discordLink.js";
import { pvpRoutes } from "./routes/pvp.js";
import { rosterRoutes } from "./routes/roster.js";
import { sessionRoutes } from "./routes/session.js";
import {
  InMemoryUserStore,
  PrismaUserStore,
  type UserStore,
} from "./userStore.js";
import {
  CardanoWalletAuthVerifier,
  type WalletAuthVerifier,
} from "./walletAuth.js";

export interface BuildServerOptions {
  sessionSecret: string;
  userStore: UserStore;
  battleStore: BattleStore;
  nonceStore?: NonceStore;
  discordLinkTokenStore?: DiscordLinkTokenStore;
  pvpChallengeStore?: PvpChallengeStore;
  pvpQueueStore?: PvpQueueStore;
  walletAuthVerifier?: WalletAuthVerifier;
  nftService?: BlockfrostNftService;
  derivationService?: RosterDerivationService;
  seedFactory?: () => number;
  nowFn?: () => number;
  logger?: boolean;
}

export function buildServer(opts: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? true });

  app.register(fastifyCookie, { secret: opts.sessionSecret });

  app.get("/health", async () => ({ ok: true }));

  app.register(sessionRoutes, { userStore: opts.userStore });
  app.register(captainRoutes, { userStore: opts.userStore });
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
    tokenStore:
      opts.discordLinkTokenStore ?? new InMemoryDiscordLinkTokenStore(),
  });
  app.register(pvpRoutes, {
    userStore: opts.userStore,
    battleStore: opts.battleStore,
    challengeStore: opts.pvpChallengeStore ?? new InMemoryPvpChallengeStore(),
    queueStore: opts.pvpQueueStore ?? new InMemoryPvpQueueStore(),
    seedFactory: opts.seedFactory,
    nowFn: opts.nowFn,
  });

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
  WalletAuthVerifier,
  CollectionStore,
};

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

  const app = buildServer({
    sessionSecret,
    userStore,
    battleStore,
    nftService,
    derivationService,
    pvpChallengeStore,
    pvpQueueStore,
  });
  app.listen({ port, host }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
