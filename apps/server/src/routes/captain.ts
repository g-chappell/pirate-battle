import { CREWS_BY_KEY } from "@pirate-battle/content";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import type { CreateCaptainCrewInput, UserStore } from "../userStore.js";
import { getUserIdFromCookie } from "./session.js";

export interface CaptainPluginOptions {
  userStore: UserStore;
}

export const TEAM_SIZE = 6;
export const MAX_NAME_LENGTH = 50;
export const MAX_FACTION_LENGTH = 50;

interface CaptainRequestBody {
  name?: unknown;
  factionId?: unknown;
  crewTemplateKeys?: unknown;
}

export const captainRoutes: FastifyPluginCallback<CaptainPluginOptions> = (
  fastify: FastifyInstance,
  opts: CaptainPluginOptions,
  done: () => void,
): void => {
  const { userStore } = opts;

  fastify.post("/api/captain", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const parsed = parseBody(req.body);
    if ("error" in parsed) {
      return reply.code(400).send({ error: parsed.error });
    }

    const captain = await userStore.createCaptain(userId, {
      name: parsed.name,
      factionId: parsed.factionId,
      crews: parsed.crews,
    });
    if (!captain) return reply.code(401).send({ error: "user_not_found" });

    return reply.code(201).send(captain);
  });

  done();
};

interface ParsedBody {
  name: string;
  factionId: string;
  crews: CreateCaptainCrewInput[];
}

function parseBody(raw: unknown): ParsedBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "invalid_body" };
  const body = raw as CaptainRequestBody;

  if (typeof body.name !== "string") return { error: "invalid_name" };
  const name = body.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return { error: "invalid_name" };
  }

  if (typeof body.factionId !== "string") return { error: "invalid_faction" };
  const factionId = body.factionId.trim();
  if (factionId.length === 0 || factionId.length > MAX_FACTION_LENGTH) {
    return { error: "invalid_faction" };
  }

  if (!Array.isArray(body.crewTemplateKeys)) {
    return { error: "invalid_team" };
  }
  if (body.crewTemplateKeys.length !== TEAM_SIZE) {
    return { error: "invalid_team_size" };
  }

  const crews: CreateCaptainCrewInput[] = [];
  for (const key of body.crewTemplateKeys) {
    if (typeof key !== "string") return { error: "invalid_template_key" };
    const template = CREWS_BY_KEY[key];
    if (!template) return { error: "unknown_template_key" };
    crews.push({
      templateKey: template.templateKey,
      moveKeys: template.moveKeys,
    });
  }

  return { name, factionId, crews };
}
