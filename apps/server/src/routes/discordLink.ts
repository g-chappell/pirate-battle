import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import type { DiscordLinkTokenStore } from "../discordLinkStore.js";
import type { UserStore } from "../userStore.js";
import { getUserIdFromCookie } from "./session.js";

export interface DiscordLinkPluginOptions {
  userStore: UserStore;
  tokenStore: DiscordLinkTokenStore;
}

export const MAX_DISCORD_USER_ID_LENGTH = 64;

interface ClaimRequestBody {
  token?: unknown;
  discordUserId?: unknown;
}

export const discordLinkRoutes: FastifyPluginCallback<
  DiscordLinkPluginOptions
> = (
  fastify: FastifyInstance,
  opts: DiscordLinkPluginOptions,
  done: () => void,
): void => {
  const { userStore, tokenStore } = opts;

  fastify.post("/api/discord/link-token", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const user = await userStore.findById(userId);
    if (!user) return reply.code(401).send({ error: "user_not_found" });
    if (!user.stakeAddr) {
      return reply.code(401).send({ error: "wallet_required" });
    }

    const record = await tokenStore.issue(userId);
    return reply
      .code(201)
      .send({ token: record.token, expiresAt: record.expiresAt });
  });

  fastify.post("/api/discord/link-claim", async (req, reply) => {
    const parsed = parseClaimBody(req.body);
    if ("error" in parsed) {
      return reply.code(400).send({ error: parsed.error });
    }

    const consumed = await tokenStore.consume(parsed.token);
    if (!consumed.ok) {
      return reply.code(401).send({ error: `token_${consumed.reason}` });
    }

    const result = await userStore.setDiscordUserId(
      consumed.userId,
      parsed.discordUserId,
    );
    if (!result.ok) {
      const status = result.reason === "conflict" ? 409 : 401;
      return reply.code(status).send({ error: result.reason });
    }

    return reply.code(200).send({
      ok: true,
      userId: consumed.userId,
      discordUserId: parsed.discordUserId,
    });
  });

  done();
};

interface ParsedClaimBody {
  token: string;
  discordUserId: string;
}

function parseClaimBody(raw: unknown): ParsedClaimBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "invalid_body" };
  const body = raw as ClaimRequestBody;

  if (typeof body.token !== "string" || body.token.length === 0) {
    return { error: "invalid_token" };
  }
  if (
    typeof body.discordUserId !== "string" ||
    body.discordUserId.length === 0 ||
    body.discordUserId.length > MAX_DISCORD_USER_ID_LENGTH ||
    !/^[0-9]+$/.test(body.discordUserId)
  ) {
    return { error: "invalid_discord_user_id" };
  }
  return { token: body.token, discordUserId: body.discordUserId };
}
