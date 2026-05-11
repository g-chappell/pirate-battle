import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import { buildAIOpponentTeam } from "../aiTeam.js";
import type { BattleStore } from "../battleStore.js";
import { buildInitialBattleState, teamToSnapshots } from "../crewSnapshot.js";
import { applyAuthorizedPveTurn } from "../pveTurn.js";
import type { UserStore } from "../userStore.js";

import { getUserIdFromCookie } from "./session.js";

export { computeXpAwards, grantDropsForBattleWin } from "../pveTurn.js";

export interface BattlePluginOptions {
  userStore: UserStore;
  battleStore: BattleStore;
  seedFactory?: () => number;
}

interface StartRequestBody {
  captainId?: unknown;
}

interface ActionRequestBody {
  action?: unknown;
}

interface HistoryQuery {
  limit?: string;
}

const HISTORY_DEFAULT_LIMIT = 10;
const HISTORY_MAX_LIMIT = 50;

function defaultSeedFactory(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

export const battleRoutes: FastifyPluginCallback<BattlePluginOptions> = (
  fastify: FastifyInstance,
  opts: BattlePluginOptions,
  done: () => void,
): void => {
  const { userStore, battleStore } = opts;
  const seedFactory = opts.seedFactory ?? defaultSeedFactory;

  fastify.post("/api/battle/start", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const body = (req.body ?? {}) as StartRequestBody;
    if (typeof body.captainId !== "string" || body.captainId.length === 0) {
      return reply.code(400).send({ error: "invalid_captain_id" });
    }

    const team = await userStore.getCaptainTeam(userId, body.captainId);
    if (!team) return reply.code(404).send({ error: "captain_not_found" });

    const playerSnapshots = teamToSnapshots(team);
    const aiSnapshots = teamToSnapshots(buildAIOpponentTeam());
    const seed = seedFactory();
    const initialState = buildInitialBattleState(playerSnapshots, aiSnapshots, seed);

    const summary = await battleStore.create({
      ownerUserId: userId,
      captainId: team.id,
      state: initialState,
    });

    return reply.code(201).send({ id: summary.id, state: summary.state });
  });

  fastify.get<{ Querystring: HistoryQuery }>("/api/battle/history", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    let limit = HISTORY_DEFAULT_LIMIT;
    if (typeof req.query.limit === "string" && req.query.limit !== "") {
      const parsed = Number.parseInt(req.query.limit, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return reply.code(400).send({ error: "invalid_limit" });
      }
      limit = Math.min(parsed, HISTORY_MAX_LIMIT);
    }

    const battles = await battleStore.listFinishedForUser(userId, limit);
    return reply.send({ battles });
  });

  fastify.get<{ Params: { id: string } }>("/api/battle/:id", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const summary = await battleStore.get(req.params.id);
    if (!summary) return reply.code(404).send({ error: "battle_not_found" });
    if (summary.ownerUserId !== userId) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return reply.send({ id: summary.id, state: summary.state });
  });

  fastify.post<{ Params: { id: string } }>("/api/battle/:id/action", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const summary = await battleStore.get(req.params.id);
    if (!summary) return reply.code(404).send({ error: "battle_not_found" });
    if (summary.ownerUserId !== userId) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const body = (req.body ?? {}) as ActionRequestBody;
    const result = await applyAuthorizedPveTurn({
      userStore,
      battleStore,
      summary,
      rawAction: body.action,
    });
    if (!result.ok) {
      return reply.code(result.code).send({ error: result.error });
    }
    return reply.send({ id: result.summary.id, state: result.summary.state });
  });

  done();
};
