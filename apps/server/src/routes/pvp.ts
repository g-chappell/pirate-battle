import {
  createRng,
  resolveTurn,
  type Action,
  type BattleState,
  type Side,
} from "@pirate-battle/core";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import { parseAction, validateAction } from "../battleAction.js";
import type { BattleStore, BattleSummary } from "../battleStore.js";
import { buildInitialBattleState, teamToSnapshots } from "../crewSnapshot.js";
import type { PvpChallengeStore, PvpChallengeAcceptFailure } from "../pvpChallengeStore.js";
import type { PvpQueueStore } from "../pvpQueueStore.js";
import type { CaptainTeam, UserStore } from "../userStore.js";

import { getUserIdFromCookie } from "./session.js";

export const PVP_ACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export interface PvpPluginOptions {
  userStore: UserStore;
  battleStore: BattleStore;
  challengeStore: PvpChallengeStore;
  queueStore: PvpQueueStore;
  seedFactory?: () => number;
  nowFn?: () => number;
}

interface ChallengeRequestBody {
  captainId?: unknown;
}

interface AcceptRequestBody {
  captainId?: unknown;
}

interface QueueRequestBody {
  captainId?: unknown;
}

interface ActionRequestBody {
  action?: unknown;
}

function defaultSeedFactory(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function getSide(summary: BattleSummary, userId: string): Side | null {
  if (summary.ownerUserId === userId) return "A";
  if (summary.participantBId === userId) return "B";
  return null;
}

function pendingForSide(summary: BattleSummary, side: Side): Action | null {
  return side === "A" ? summary.pendingActionA : summary.pendingActionB;
}

function pendingResponse(summary: BattleSummary, side: Side) {
  return {
    id: summary.id,
    state: summary.state,
    yourSide: side,
    pendingYou: pendingForSide(summary, side) !== null,
    pendingOpponent: (side === "A" ? summary.pendingActionB : summary.pendingActionA) !== null,
    pendingSubmitAt: summary.pendingSubmitAt,
  };
}

const acceptFailureStatus: Record<PvpChallengeAcceptFailure, number> = {
  unknown: 404,
  expired: 410,
  already_accepted: 409,
  self_accept: 400,
};

export const pvpRoutes: FastifyPluginCallback<PvpPluginOptions> = (
  fastify: FastifyInstance,
  opts: PvpPluginOptions,
  done: () => void,
): void => {
  const { userStore, battleStore, challengeStore, queueStore } = opts;
  const seedFactory = opts.seedFactory ?? defaultSeedFactory;
  const nowFn = opts.nowFn ?? Date.now;

  fastify.post("/api/pvp/challenge", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const body = (req.body ?? {}) as ChallengeRequestBody;
    if (typeof body.captainId !== "string" || body.captainId.length === 0) {
      return reply.code(400).send({ error: "invalid_captain_id" });
    }
    const team = await userStore.getCaptainTeam(userId, body.captainId);
    if (!team) return reply.code(404).send({ error: "captain_not_found" });

    const record = await challengeStore.issue({
      challengerUserId: userId,
      challengerCaptainId: body.captainId,
    });
    return reply.code(201).send({
      token: record.token,
      expiresAt: record.expiresAt,
    });
  });

  fastify.post<{ Params: { token: string } }>(
    "/api/pvp/challenge/:token/accept",
    async (req, reply) => {
      const userId = getUserIdFromCookie(req);
      if (!userId) return reply.code(401).send({ error: "no_session" });

      const body = (req.body ?? {}) as AcceptRequestBody;
      if (typeof body.captainId !== "string" || body.captainId.length === 0) {
        return reply.code(400).send({ error: "invalid_captain_id" });
      }
      const accepterTeam = await userStore.getCaptainTeam(userId, body.captainId);
      if (!accepterTeam) {
        return reply.code(404).send({ error: "captain_not_found" });
      }

      const challenge = await challengeStore.findByToken(req.params.token);
      if (!challenge) {
        return reply.code(404).send({ error: "challenge_not_found" });
      }
      if (challenge.acceptedBattleId !== null) {
        return reply.code(409).send({ error: "already_accepted" });
      }
      if (challenge.expiresAt < nowFn()) {
        return reply.code(410).send({ error: "expired" });
      }
      if (challenge.challengerUserId === userId) {
        return reply.code(400).send({ error: "self_accept" });
      }

      const challengerTeam = await userStore.getCaptainTeam(
        challenge.challengerUserId,
        challenge.challengerCaptainId,
      );
      if (!challengerTeam) {
        return reply.code(409).send({ error: "challenger_team_unavailable" });
      }

      const battle = await createPvpBattle({
        battleStore,
        seedFactory,
        participantAId: challenge.challengerUserId,
        participantBId: userId,
        teamA: challengerTeam,
        teamB: accepterTeam,
      });

      const accept = await challengeStore.markAccepted(challenge.token, userId, battle.id);
      if (!accept.ok) {
        return reply.code(acceptFailureStatus[accept.reason]).send({ error: accept.reason });
      }

      return reply.code(201).send({
        id: battle.id,
        state: battle.state,
        yourSide: "B",
      });
    },
  );

  fastify.get<{ Params: { id: string } }>("/api/pvp/battle/:id", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const summary = await battleStore.get(req.params.id);
    if (!summary) return reply.code(404).send({ error: "battle_not_found" });
    const side = getSide(summary, userId);
    if (!side) return reply.code(403).send({ error: "forbidden" });
    if (summary.mode !== "PVP") {
      return reply.code(400).send({ error: "not_pvp" });
    }

    const resolved = await maybeTimeoutResolve({
      battleStore,
      summary,
      nowFn,
    });
    return reply.send(pendingResponse(resolved, side));
  });

  fastify.post<{ Params: { id: string } }>("/api/pvp/battle/:id/action", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    let summary = await battleStore.get(req.params.id);
    if (!summary) return reply.code(404).send({ error: "battle_not_found" });
    const side = getSide(summary, userId);
    if (!side) return reply.code(403).send({ error: "forbidden" });
    if (summary.mode !== "PVP") {
      return reply.code(400).send({ error: "not_pvp" });
    }
    summary = await maybeTimeoutResolve({
      battleStore,
      summary,
      nowFn,
    });
    if (summary.state.winner !== null) {
      return reply.code(409).send({ error: "battle_ended" });
    }

    const body = (req.body ?? {}) as ActionRequestBody;
    const parsed = parseAction(body.action);
    if ("error" in parsed) {
      return reply.code(400).send({ error: parsed.error });
    }
    const validation = validateAction(parsed, summary.state, side);
    if (!validation.ok) {
      return reply.code(400).send({ error: validation.error });
    }

    const submitAt = summary.pendingSubmitAt ?? nowFn();
    summary = await battleStore.setPendingAction(summary.id, side, parsed, submitAt);

    summary = await maybeResolve({ battleStore, summary, nowFn });
    const status =
      summary.pendingActionA === null && summary.pendingActionB === null
        ? "resolved"
        : "waiting_opponent";
    return reply.send({
      ...pendingResponse(summary, side),
      status,
    });
  });

  fastify.post("/api/pvp/queue", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const body = (req.body ?? {}) as QueueRequestBody;
    if (typeof body.captainId !== "string" || body.captainId.length === 0) {
      return reply.code(400).send({ error: "invalid_captain_id" });
    }
    const team = await userStore.getCaptainTeam(userId, body.captainId);
    if (!team) return reply.code(404).send({ error: "captain_not_found" });

    const existing = await queueStore.findByUser(userId);
    if (existing && existing.matchedBattleId) {
      await queueStore.remove(userId);
      return reply.code(200).send({
        status: "matched",
        battleId: existing.matchedBattleId,
      });
    }

    const opponent = await queueStore.findOldestUnmatchedOther(userId);
    if (opponent) {
      const opponentTeam = await userStore.getCaptainTeam(opponent.userId, opponent.captainId);
      if (!opponentTeam) {
        await queueStore.remove(opponent.userId);
        const enq = await queueStore.enqueue(userId, body.captainId);
        return reply.code(enq.created ? 201 : 200).send({
          status: "queued",
          joinedAt: enq.entry.joinedAt,
        });
      }
      const battle = await createPvpBattle({
        battleStore,
        seedFactory,
        participantAId: opponent.userId,
        participantBId: userId,
        teamA: opponentTeam,
        teamB: team,
      });
      await queueStore.enqueue(userId, body.captainId);
      await queueStore.markMatched([opponent.userId, userId], battle.id);
      await queueStore.remove(userId);
      return reply.code(201).send({
        status: "matched",
        battleId: battle.id,
        state: battle.state,
        yourSide: "B",
      });
    }

    const enq = await queueStore.enqueue(userId, body.captainId);
    return reply.code(enq.created ? 201 : 200).send({
      status: "queued",
      joinedAt: enq.entry.joinedAt,
    });
  });

  fastify.get("/api/pvp/queue/status", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const entry = await queueStore.findByUser(userId);
    if (!entry) return reply.send({ status: "idle" });
    if (entry.matchedBattleId) {
      await queueStore.remove(userId);
      return reply.send({
        status: "matched",
        battleId: entry.matchedBattleId,
      });
    }
    return reply.send({ status: "queued", joinedAt: entry.joinedAt });
  });

  done();
};

interface CreatePvpBattleArgs {
  battleStore: BattleStore;
  seedFactory: () => number;
  participantAId: string;
  participantBId: string;
  teamA: CaptainTeam;
  teamB: CaptainTeam;
}

async function createPvpBattle(args: CreatePvpBattleArgs) {
  const snapshotsA = teamToSnapshots(args.teamA);
  const snapshotsB = teamToSnapshots(args.teamB);
  const seed = args.seedFactory();
  const initialState = buildInitialBattleState(snapshotsA, snapshotsB, seed);
  return args.battleStore.createPvp({
    participantAId: args.participantAId,
    participantBId: args.participantBId,
    captainAId: args.teamA.id,
    captainBId: args.teamB.id,
    state: initialState,
  });
}

interface MaybeResolveArgs {
  battleStore: BattleStore;
  summary: BattleSummary;
  nowFn: () => number;
}

async function maybeResolve(args: MaybeResolveArgs): Promise<BattleSummary> {
  const { battleStore, summary } = args;
  if (summary.pendingActionA === null || summary.pendingActionB === null) {
    return summary;
  }
  return runResolve(battleStore, summary, summary.pendingActionA, summary.pendingActionB);
}

async function maybeTimeoutResolve(args: MaybeResolveArgs): Promise<BattleSummary> {
  const { battleStore, summary, nowFn } = args;
  if (summary.state.winner !== null) return summary;
  if (!summary.pendingSubmitAt) return summary;
  if (nowFn() - summary.pendingSubmitAt < PVP_ACTION_TIMEOUT_MS) return summary;
  if (summary.pendingActionA && summary.pendingActionB) {
    return runResolve(battleStore, summary, summary.pendingActionA, summary.pendingActionB);
  }
  const actionA: Action = summary.pendingActionA ?? ({ type: "forfeit" } as Action);
  const actionB: Action = summary.pendingActionB ?? ({ type: "forfeit" } as Action);
  return runResolve(battleStore, summary, actionA, actionB);
}

async function runResolve(
  battleStore: BattleStore,
  summary: BattleSummary,
  actionA: Action,
  actionB: Action,
): Promise<BattleSummary> {
  const rng = createRng(summary.state.rngState);
  const newState: BattleState = resolveTurn(summary.state, actionA, actionB, rng);
  const newEvents = newState.log.slice(summary.state.log.length);
  return battleStore.recordTurn(summary.id, newState, newEvents);
}
