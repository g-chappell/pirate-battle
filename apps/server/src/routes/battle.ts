import { aiPickAction, createRng, DEFAULT_LEVEL, resolveTurn, xpReward } from "@pirate-battle/core";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import { buildAIOpponentTeam } from "../aiTeam.js";
import { parseAction, validateAction } from "../battleAction.js";
import type { BattleStore } from "../battleStore.js";
import { buildInitialBattleState, teamToSnapshots } from "../crewSnapshot.js";
import type { CaptainTeam, UserStore, XpAward } from "../userStore.js";

import { getUserIdFromCookie } from "./session.js";

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
    if (summary.state.winner !== null) {
      return reply.code(409).send({ error: "battle_ended" });
    }

    const body = (req.body ?? {}) as ActionRequestBody;
    const parsed = parseAction(body.action);
    if ("error" in parsed) {
      return reply.code(400).send({ error: parsed.error });
    }

    const validation = validateAction(parsed, summary.state, "A");
    if (!validation.ok) {
      return reply.code(400).send({ error: validation.error });
    }

    const aiAction = aiPickAction(summary.state, "B");
    const rng = createRng(summary.state.rngState);
    const newState = resolveTurn(summary.state, parsed, aiAction, rng);
    const newEvents = newState.log.slice(summary.state.log.length);

    const updated = await battleStore.recordTurn(summary.id, newState, newEvents);

    const justEnded = summary.state.winner === null && newState.winner !== null;
    if (justEnded && summary.captainId) {
      await grantXpForBattleEnd({
        userStore,
        userId,
        captainId: summary.captainId,
        playerWon: newState.winner === "A",
      });
    }

    return reply.send({ id: updated.id, state: updated.state });
  });

  done();
};

interface GrantXpInput {
  userStore: UserStore;
  userId: string;
  captainId: string;
  playerWon: boolean;
}

async function grantXpForBattleEnd(input: GrantXpInput): Promise<void> {
  const team = await input.userStore.getCaptainTeam(input.userId, input.captainId);
  if (!team) return;
  const awards = computeXpAwards({ team, playerWon: input.playerWon });
  if (awards.length === 0) return;
  await input.userStore.applyXpRewards(awards);
}

interface ComputeAwardsInput {
  team: CaptainTeam;
  playerWon: boolean;
  opponentLevel?: number;
}

export function computeXpAwards(input: ComputeAwardsInput): XpAward[] {
  const opponentLevel = input.opponentLevel ?? DEFAULT_LEVEL;
  const xpGain = xpReward({ won: input.playerWon, opponentLevel });
  if (xpGain <= 0) return [];
  const awards: XpAward[] = [];
  for (const crew of input.team.crews) {
    if (typeof crew.id === "string") {
      awards.push({ crewId: crew.id, xpGain });
    }
  }
  return awards;
}
