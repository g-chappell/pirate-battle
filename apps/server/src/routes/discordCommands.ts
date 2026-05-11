import type { BattleState } from "@pirate-battle/core";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import { buildAIOpponentTeam } from "../aiTeam.js";
import type { BattleStore } from "../battleStore.js";
import { buildInitialBattleState, teamToSnapshots } from "../crewSnapshot.js";
import { computeUserStats, type UserStats, type FinishedBattleStats } from "../statsAggregator.js";
import type { CaptainTeam, UserStore, UserSummary } from "../userStore.js";

export interface DiscordCommandsPluginOptions {
  userStore: UserStore;
  battleStore: BattleStore;
  seedFactory?: () => number;
}

export const MAX_DISCORD_USER_ID_LENGTH = 64;
const DISCORD_USER_ID_RE = /^[0-9]+$/;

interface BattleStartBody {
  discordUserId?: unknown;
  captainId?: unknown;
  opponent?: unknown;
}

interface DiscordUserQuery {
  discordUserId?: string;
}

interface TeamQuery extends DiscordUserQuery {
  captainId?: string;
}

interface StatsQuery extends DiscordUserQuery {
  targetDiscordUserId?: string;
}

interface DiscordMeResponse {
  user: UserSummary;
}

interface DiscordTeamResponse {
  captain: CaptainTeam;
}

interface DiscordBattleResponse {
  id: string;
  state: BattleState;
  captainName: string;
}

interface DiscordStatsResponse {
  user: UserStats;
  discordUserId: string;
}

function defaultSeedFactory(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function isValidDiscordUserId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_DISCORD_USER_ID_LENGTH &&
    DISCORD_USER_ID_RE.test(value)
  );
}

export const discordCommandRoutes: FastifyPluginCallback<DiscordCommandsPluginOptions> = (
  fastify: FastifyInstance,
  opts: DiscordCommandsPluginOptions,
  done: () => void,
): void => {
  const { userStore, battleStore } = opts;
  const seedFactory = opts.seedFactory ?? defaultSeedFactory;

  fastify.get<{ Querystring: DiscordUserQuery }>("/api/discord/me", async (req, reply) => {
    const discordUserId = req.query.discordUserId;
    if (!isValidDiscordUserId(discordUserId)) {
      return reply.code(400).send({ error: "invalid_discord_user_id" });
    }
    const user = await userStore.findByDiscordUserId(discordUserId);
    if (!user) return reply.code(404).send({ error: "not_linked" });
    const payload: DiscordMeResponse = { user };
    return reply.send(payload);
  });

  fastify.get<{ Querystring: TeamQuery }>("/api/discord/team", async (req, reply) => {
    const discordUserId = req.query.discordUserId;
    const captainId = req.query.captainId;
    if (!isValidDiscordUserId(discordUserId)) {
      return reply.code(400).send({ error: "invalid_discord_user_id" });
    }
    if (typeof captainId !== "string" || captainId.length === 0) {
      return reply.code(400).send({ error: "invalid_captain_id" });
    }
    const user = await userStore.findByDiscordUserId(discordUserId);
    if (!user) return reply.code(404).send({ error: "not_linked" });
    const team = await userStore.getCaptainTeam(user.id, captainId);
    if (!team) return reply.code(404).send({ error: "captain_not_found" });
    const payload: DiscordTeamResponse = { captain: team };
    return reply.send(payload);
  });

  fastify.post("/api/discord/battle", async (req, reply) => {
    const body = (req.body ?? {}) as BattleStartBody;
    if (!isValidDiscordUserId(body.discordUserId)) {
      return reply.code(400).send({ error: "invalid_discord_user_id" });
    }
    if (typeof body.captainId !== "string" || body.captainId.length === 0) {
      return reply.code(400).send({ error: "invalid_captain_id" });
    }
    const opponent = typeof body.opponent === "string" ? body.opponent : "";
    if (opponent !== "ai") {
      return reply.code(400).send({ error: "unsupported_opponent" });
    }

    const user = await userStore.findByDiscordUserId(body.discordUserId);
    if (!user) return reply.code(404).send({ error: "not_linked" });

    const team = await userStore.getCaptainTeam(user.id, body.captainId);
    if (!team) return reply.code(404).send({ error: "captain_not_found" });

    const playerSnapshots = teamToSnapshots(team);
    const aiSnapshots = teamToSnapshots(buildAIOpponentTeam());
    const seed = seedFactory();
    const initialState = buildInitialBattleState(playerSnapshots, aiSnapshots, seed);

    const summary = await battleStore.create({
      ownerUserId: user.id,
      captainId: team.id,
      state: initialState,
    });

    const payload: DiscordBattleResponse = {
      id: summary.id,
      state: summary.state,
      captainName: team.name,
    };
    return reply.code(201).send(payload);
  });

  fastify.get<{ Querystring: StatsQuery }>("/api/discord/stats", async (req, reply) => {
    const discordUserId = req.query.discordUserId;
    if (!isValidDiscordUserId(discordUserId)) {
      return reply.code(400).send({ error: "invalid_discord_user_id" });
    }
    const requester = await userStore.findByDiscordUserId(discordUserId);
    if (!requester) return reply.code(404).send({ error: "not_linked" });

    const rawTarget = req.query.targetDiscordUserId;
    let targetUserId = requester.id;
    let resolvedDiscordId = discordUserId;
    if (typeof rawTarget === "string" && rawTarget.length > 0) {
      if (!isValidDiscordUserId(rawTarget)) {
        return reply.code(400).send({ error: "invalid_target_discord_user_id" });
      }
      const target = await userStore.findByDiscordUserId(rawTarget);
      if (!target) return reply.code(404).send({ error: "target_not_linked" });
      targetUserId = target.id;
      resolvedDiscordId = rawTarget;
    }

    const battles: readonly FinishedBattleStats[] =
      await battleStore.getFinishedStatsForUser(targetUserId);
    const userStats = computeUserStats(battles);
    const payload: DiscordStatsResponse = {
      user: userStats,
      discordUserId: resolvedDiscordId,
    };
    return reply.send(payload);
  });

  done();
};
