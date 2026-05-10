import { TRAINABLE_STATS, type TrainableStat } from "@pirate-battle/core";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import type { CaptainTeam, InventoryEntry, UserStore } from "../userStore.js";

import { getUserIdFromCookie } from "./session.js";

export interface CrewPluginOptions {
  userStore: UserStore;
}

export interface CaptainTeamResponse {
  captainId: string;
  name: string;
  factionId: string;
  crews: Array<{
    id: string;
    templateKey: string;
    level: number;
    xp: number;
    moveKeys: string[];
    attrs: { hp?: number; atk?: number; def?: number; spd?: number } | null;
  }>;
  inventory: InventoryEntry[];
}

export interface TrainCrewResponse {
  crew: CaptainTeamResponse["crews"][number];
  remainingChips: number;
}

function isTrainableStat(value: unknown): value is TrainableStat {
  return typeof value === "string" && (TRAINABLE_STATS as readonly string[]).includes(value);
}

function teamToResponse(team: CaptainTeam, inventory: InventoryEntry[]): CaptainTeamResponse {
  return {
    captainId: team.id,
    name: team.name,
    factionId: team.factionId,
    crews: team.crews.map((c) => ({
      id: c.id ?? "",
      templateKey: c.templateKey,
      level: c.level ?? 0,
      xp: c.xp ?? 0,
      moveKeys: [...c.moveKeys],
      attrs: c.attrs ?? null,
    })),
    inventory,
  };
}

export const crewRoutes: FastifyPluginCallback<CrewPluginOptions> = (
  fastify: FastifyInstance,
  opts: CrewPluginOptions,
  done: () => void,
): void => {
  const { userStore } = opts;

  fastify.get<{ Params: { captainId: string } }>(
    "/api/captain/:captainId/team",
    async (req, reply) => {
      const userId = getUserIdFromCookie(req);
      if (!userId) return reply.code(401).send({ error: "no_session" });

      const team = await userStore.getCaptainTeam(userId, req.params.captainId);
      if (!team) return reply.code(404).send({ error: "captain_not_found" });

      const inventory = await userStore.getInventory(userId);
      return reply.send(teamToResponse(team, inventory));
    },
  );

  fastify.post<{
    Params: { captainId: string; crewId: string };
    Body: { stat?: unknown };
  }>("/api/captain/:captainId/crew/:crewId/train", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const body = req.body;
    if (!body || typeof body !== "object" || !isTrainableStat(body.stat)) {
      return reply.code(400).send({ error: "invalid_stat" });
    }

    const result = await userStore.trainCrewAttribute({
      userId,
      captainId: req.params.captainId,
      crewId: req.params.crewId,
      stat: body.stat,
    });

    if (!result.ok) {
      const code =
        result.reason === "not_found"
          ? 404
          : result.reason === "no_chips" || result.reason === "at_cap"
            ? 409
            : 400;
      return reply.code(code).send({ error: result.reason });
    }

    const response: TrainCrewResponse = {
      crew: {
        id: result.crew.id ?? "",
        templateKey: result.crew.templateKey,
        level: result.crew.level ?? 0,
        xp: result.crew.xp ?? 0,
        moveKeys: [...result.crew.moveKeys],
        attrs: result.crew.attrs ?? null,
      },
      remainingChips: result.remainingChips,
    };
    return reply.send(response);
  });

  done();
};
