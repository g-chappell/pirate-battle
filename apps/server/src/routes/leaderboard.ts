import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import type { SeasonStore } from "../seasonStore.js";

export const LEADERBOARD_DEFAULT_LIMIT = 25;
export const LEADERBOARD_MAX_LIMIT = 100;

export interface LeaderboardPluginOptions {
  seasonStore: SeasonStore;
}

interface LeaderboardQuery {
  limit?: string;
  offset?: string;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export const leaderboardRoutes: FastifyPluginCallback<LeaderboardPluginOptions> = (
  fastify: FastifyInstance,
  opts: LeaderboardPluginOptions,
  done: () => void,
): void => {
  const { seasonStore } = opts;

  fastify.get<{ Params: { seasonId: string }; Querystring: LeaderboardQuery }>(
    "/api/leaderboard/:seasonId",
    async (req, reply) => {
      const seasonId = req.params.seasonId;
      const season = await seasonStore.findById(seasonId);
      if (!season) return reply.code(404).send({ error: "season_not_found" });

      const rawLimit = parsePositiveInt(req.query.limit, LEADERBOARD_DEFAULT_LIMIT);
      const limit = Math.min(Math.max(1, rawLimit), LEADERBOARD_MAX_LIMIT);
      const offset = parsePositiveInt(req.query.offset, 0);

      const { entries, total } = await seasonStore.listLeaderboard(seasonId, { limit, offset });
      return reply.send({
        season: {
          id: season.id,
          name: season.name,
          startsAt: season.startsAt,
          endsAt: season.endsAt,
        },
        entries,
        total,
        limit,
        offset,
      });
    },
  );

  fastify.get("/api/seasons/current", async (_req, reply) => {
    const season = await seasonStore.findCurrent();
    if (!season) return reply.code(404).send({ error: "no_active_season" });
    return reply.send({
      id: season.id,
      name: season.name,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
    });
  });

  done();
};
