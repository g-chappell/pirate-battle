import type { BattleState } from "@pirate-battle/core";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import { buildAIOpponentTeam } from "../aiTeam.js";
import type { BattleStore } from "../battleStore.js";
import { buildInitialBattleState, teamToSnapshots } from "../crewSnapshot.js";
import { applyAuthorizedPveTurn } from "../pveTurn.js";
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

interface BattleActionBody {
  discordUserId?: unknown;
  action?: unknown;
}

interface SetBattleMessageBody {
  discordUserId?: unknown;
  channelId?: unknown;
  messageId?: unknown;
  guildId?: unknown;
  sentAtMs?: unknown;
}

interface ClearBattleMessageBody {
  discordUserId?: unknown;
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

interface DiscordActiveBattleResponse {
  id: string;
  state: BattleState;
}

interface DiscordActionResponse {
  id: string;
  state: BattleState;
}

interface DiscordStatsResponse {
  user: UserStats;
  discordUserId: string;
}

export interface DiscordBattleMessageRef {
  battleId: string;
  channelId: string;
  messageId: string;
  guildId: string | null;
  sentAtMs: number;
  discordUserId: string;
}

interface DiscordInProgressBattlesResponse {
  battles: DiscordBattleMessageRef[];
}

const DISCORD_SNOWFLAKE_RE = /^[0-9]{1,32}$/;

function isValidSnowflake(value: unknown): value is string {
  return typeof value === "string" && DISCORD_SNOWFLAKE_RE.test(value);
}

function isValidSentAtMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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

  fastify.get<{ Querystring: DiscordUserQuery }>(
    "/api/discord/battle/active",
    async (req, reply) => {
      const discordUserId = req.query.discordUserId;
      if (!isValidDiscordUserId(discordUserId)) {
        return reply.code(400).send({ error: "invalid_discord_user_id" });
      }
      const user = await userStore.findByDiscordUserId(discordUserId);
      if (!user) return reply.code(404).send({ error: "not_linked" });
      const summary = await battleStore.findActivePveForUser(user.id);
      if (!summary) return reply.code(404).send({ error: "no_active_battle" });
      const payload: DiscordActiveBattleResponse = {
        id: summary.id,
        state: summary.state,
      };
      return reply.send(payload);
    },
  );

  fastify.post("/api/discord/battle/action", async (req, reply) => {
    const body = (req.body ?? {}) as BattleActionBody;
    if (!isValidDiscordUserId(body.discordUserId)) {
      return reply.code(400).send({ error: "invalid_discord_user_id" });
    }
    const user = await userStore.findByDiscordUserId(body.discordUserId);
    if (!user) return reply.code(404).send({ error: "not_linked" });
    const summary = await battleStore.findActivePveForUser(user.id);
    if (!summary) return reply.code(404).send({ error: "no_active_battle" });

    const result = await applyAuthorizedPveTurn({
      userStore,
      battleStore,
      summary,
      rawAction: body.action,
    });
    if (!result.ok) {
      return reply.code(result.code).send({ error: result.error });
    }
    const payload: DiscordActionResponse = {
      id: result.summary.id,
      state: result.summary.state,
    };
    return reply.send(payload);
  });

  fastify.post<{ Params: { id: string } }>(
    "/api/discord/battle/:id/message",
    async (req, reply) => {
      const body = (req.body ?? {}) as SetBattleMessageBody;
      if (!isValidDiscordUserId(body.discordUserId)) {
        return reply.code(400).send({ error: "invalid_discord_user_id" });
      }
      if (!isValidSnowflake(body.channelId)) {
        return reply.code(400).send({ error: "invalid_channel_id" });
      }
      if (!isValidSnowflake(body.messageId)) {
        return reply.code(400).send({ error: "invalid_message_id" });
      }
      if (body.guildId !== null && body.guildId !== undefined && !isValidSnowflake(body.guildId)) {
        return reply.code(400).send({ error: "invalid_guild_id" });
      }
      if (!isValidSentAtMs(body.sentAtMs)) {
        return reply.code(400).send({ error: "invalid_sent_at" });
      }

      const user = await userStore.findByDiscordUserId(body.discordUserId);
      if (!user) return reply.code(404).send({ error: "not_linked" });
      const summary = await battleStore.get(req.params.id);
      if (!summary) return reply.code(404).send({ error: "battle_not_found" });
      if (summary.ownerUserId !== user.id) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const updated = await battleStore.setDiscordMessage(req.params.id, {
        channelId: body.channelId,
        messageId: body.messageId,
        guildId: typeof body.guildId === "string" ? body.guildId : null,
        sentAtMs: body.sentAtMs,
      });
      return reply.send({
        ok: true,
        id: updated.id,
        discordChannelId: updated.discordChannelId,
        discordMessageId: updated.discordMessageId,
        discordGuildId: updated.discordGuildId,
        discordMessageSentAt: updated.discordMessageSentAt,
      });
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/discord/battle/:id/message",
    async (req, reply) => {
      const body = (req.body ?? {}) as ClearBattleMessageBody;
      if (!isValidDiscordUserId(body.discordUserId)) {
        return reply.code(400).send({ error: "invalid_discord_user_id" });
      }
      const user = await userStore.findByDiscordUserId(body.discordUserId);
      if (!user) return reply.code(404).send({ error: "not_linked" });
      const summary = await battleStore.get(req.params.id);
      if (!summary) return reply.code(404).send({ error: "battle_not_found" });
      if (summary.ownerUserId !== user.id) {
        return reply.code(403).send({ error: "forbidden" });
      }
      await battleStore.clearDiscordMessage(req.params.id);
      return reply.send({ ok: true, id: req.params.id });
    },
  );

  fastify.get("/api/discord/battles/in-progress", async (_req, reply) => {
    const summaries = await battleStore.listInProgressWithDiscordMessage();
    const battles: DiscordBattleMessageRef[] = [];
    for (const s of summaries) {
      if (
        s.discordChannelId === null ||
        s.discordMessageId === null ||
        s.discordMessageSentAt === null
      ) {
        continue;
      }
      const discordUserId = await userStore.getDiscordUserIdById(s.ownerUserId);
      if (!discordUserId) continue;
      battles.push({
        battleId: s.id,
        channelId: s.discordChannelId,
        messageId: s.discordMessageId,
        guildId: s.discordGuildId,
        sentAtMs: s.discordMessageSentAt,
        discordUserId,
      });
    }
    const payload: DiscordInProgressBattlesResponse = { battles };
    return reply.send(payload);
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
