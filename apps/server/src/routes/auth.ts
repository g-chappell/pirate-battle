import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import type { NonceStore } from "../nonceStore.js";
import type { UserStore, UserSummary } from "../userStore.js";
import type { WalletAuthVerifier } from "../walletAuth.js";
import { SESSION_COOKIE_NAME, getUserIdFromCookie } from "./session.js";

export interface AuthPluginOptions {
  userStore: UserStore;
  nonceStore: NonceStore;
  verifier: WalletAuthVerifier;
}

const COOKIE_OPTIONS = {
  signed: true,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

interface WalletRequestBody {
  stakeAddr?: unknown;
  payloadHex?: unknown;
  signature?: unknown;
  key?: unknown;
}

export const authRoutes: FastifyPluginCallback<AuthPluginOptions> = (
  fastify: FastifyInstance,
  opts: AuthPluginOptions,
  done: () => void,
): void => {
  const { userStore, nonceStore, verifier } = opts;

  fastify.post("/api/auth/nonce", async (_req, reply) => {
    const record = await nonceStore.issue();
    return reply.code(201).send({
      nonce: record.nonce,
      expiresAt: record.expiresAt,
    });
  });

  fastify.post("/api/auth/wallet", async (req, reply) => {
    const parsed = parseWalletBody(req.body);
    if ("error" in parsed) {
      return reply.code(400).send({ error: parsed.error });
    }

    const verifyResult = verifier.verify(parsed);
    if (!verifyResult.ok) {
      return reply.code(401).send({ error: verifyResult.reason });
    }

    const payloadText = Buffer.from(verifyResult.payload).toString("utf8");
    const nonceKey = extractNonceKey(payloadText);
    const consumed = await nonceStore.consume(nonceKey);
    if (!consumed.ok) {
      return reply.code(401).send({ error: `nonce_${consumed.reason}` });
    }

    const cookieUserId = getUserIdFromCookie(req);
    const target = await resolveAuthTarget(
      userStore,
      cookieUserId,
      parsed.stakeAddr,
    );
    if (!target) {
      return reply.code(500).send({ error: "auth_target_unresolvable" });
    }

    reply.setCookie(SESSION_COOKIE_NAME, target.id, COOKIE_OPTIONS);
    return reply.code(200).send(serializeUser(target));
  });

  done();
};

interface ParsedWalletBody {
  stakeAddr: string;
  payloadHex: string;
  signature: string;
  key: string;
}

function parseWalletBody(raw: unknown): ParsedWalletBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "invalid_body" };
  const body = raw as WalletRequestBody;

  if (typeof body.stakeAddr !== "string" || body.stakeAddr.length === 0) {
    return { error: "invalid_stake_addr" };
  }
  if (
    typeof body.payloadHex !== "string" ||
    !/^[0-9a-f]*$/i.test(body.payloadHex)
  ) {
    return { error: "invalid_payload_hex" };
  }
  if (
    typeof body.signature !== "string" ||
    !/^[0-9a-f]+$/i.test(body.signature)
  ) {
    return { error: "invalid_signature" };
  }
  if (typeof body.key !== "string" || !/^[0-9a-f]+$/i.test(body.key)) {
    return { error: "invalid_key" };
  }
  return {
    stakeAddr: body.stakeAddr,
    payloadHex: body.payloadHex,
    signature: body.signature,
    key: body.key,
  };
}

// Web clients sign a structured human-readable message containing the nonce
// (`Nonce: <32 hex>`). Older callers may sign the bare nonce string — fall back
// to the whole payload to keep that contract working.
function extractNonceKey(payloadText: string): string {
  const match = payloadText.match(/Nonce:\s*([0-9a-f]{32})/i);
  return match ? match[1]!.toLowerCase() : payloadText;
}

async function resolveAuthTarget(
  userStore: UserStore,
  cookieUserId: string | null,
  stakeAddr: string,
): Promise<UserSummary | null> {
  const existingByAddr = await userStore.findByStakeAddr(stakeAddr);
  const cookieUser = cookieUserId
    ? await userStore.findById(cookieUserId)
    : null;

  if (cookieUser && cookieUser.stakeAddr === null) {
    if (existingByAddr) {
      return userStore.mergeAnonymousIntoWallet(
        cookieUser.id,
        existingByAddr.id,
      );
    }
    return userStore.attachStakeAddrToUser(cookieUser.id, stakeAddr);
  }

  if (existingByAddr) return existingByAddr;
  return userStore.createWithStakeAddr(stakeAddr);
}

function serializeUser(user: UserSummary): UserSummary {
  return {
    id: user.id,
    stakeAddr: user.stakeAddr,
    captains: user.captains,
  };
}
