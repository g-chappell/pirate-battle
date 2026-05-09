import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyRequest,
} from "fastify";

import type { UserStore, UserSummary } from "../userStore.js";

export const SESSION_COOKIE_NAME = "pb_session";

export interface SessionPluginOptions {
  userStore: UserStore;
}

const COOKIE_OPTIONS = {
  signed: true,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

export function getUserIdFromCookie(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE_NAME];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;
  return unsigned.value;
}

export const sessionRoutes: FastifyPluginCallback<SessionPluginOptions> = (
  fastify: FastifyInstance,
  opts: SessionPluginOptions,
  done: () => void,
): void => {
  const { userStore } = opts;

  fastify.post("/api/session/anonymous", async (_req, reply) => {
    const user = await userStore.createAnonymous();
    reply.setCookie(SESSION_COOKIE_NAME, user.id, COOKIE_OPTIONS);
    return reply.code(201).send(serializeUser(user));
  });

  fastify.get("/me", async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE_NAME];
    if (!raw) return reply.code(401).send({ error: "no_session" });

    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || unsigned.value === null) {
      return reply.code(401).send({ error: "invalid_session" });
    }

    const user = await userStore.findById(unsigned.value);
    if (!user) return reply.code(401).send({ error: "user_not_found" });

    return reply.send(serializeUser(user));
  });

  done();
};

function serializeUser(user: UserSummary): UserSummary {
  return {
    id: user.id,
    stakeAddr: user.stakeAddr,
    captains: user.captains,
  };
}
