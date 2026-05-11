import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import type { BattleStore } from "../battleStore.js";
import {
  computeCrewStats,
  computeUserStats,
  type CrewStats,
  type UserStats,
} from "../statsAggregator.js";
import type { UserStore } from "../userStore.js";

import { getUserIdFromCookie } from "./session.js";

export const STATS_CACHE_TTL_MS = 60_000;

export interface StatsPluginOptions {
  userStore: UserStore;
  battleStore: BattleStore;
  nowFn?: () => number;
}

export interface StatsResponse {
  user: UserStats;
  crew: CrewStats | null;
}

interface StatsQuery {
  crewId?: string;
}

interface CacheEntry {
  at: number;
  payload: StatsResponse;
}

export const statsRoutes: FastifyPluginCallback<StatsPluginOptions> = (
  fastify: FastifyInstance,
  opts: StatsPluginOptions,
  done: () => void,
): void => {
  const { userStore, battleStore } = opts;
  const now = opts.nowFn ?? (() => Date.now());
  const cache = new Map<string, CacheEntry>();

  fastify.get<{ Querystring: StatsQuery }>("/api/stats", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const rawCrewId = req.query.crewId;
    const crewId = typeof rawCrewId === "string" && rawCrewId.length > 0 ? rawCrewId : null;

    let templateKey: string | null = null;
    if (crewId !== null) {
      const ref = await userStore.findCrewForUser(userId, crewId);
      if (!ref) return reply.code(404).send({ error: "crew_not_found" });
      templateKey = ref.templateKey;
    }

    const cacheKey = `${userId}::${crewId ?? ""}`;
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.at < STATS_CACHE_TTL_MS) {
      return reply.send(cached.payload);
    }

    const battles = await battleStore.getFinishedStatsForUser(userId);
    const userStats = computeUserStats(battles);
    const crewStats = templateKey !== null ? computeCrewStats(battles, templateKey) : null;
    const payload: StatsResponse = { user: userStats, crew: crewStats };
    cache.set(cacheKey, { at: now(), payload });

    return reply.send(payload);
  });

  done();
};
