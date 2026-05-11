import { ITEMS_BY_KEY } from "@pirate-battle/content";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import type { InventoryEntry, UserStore } from "../userStore.js";

import { getUserIdFromCookie } from "./session.js";

export interface InventoryPluginOptions {
  userStore: UserStore;
}

export interface InventoryResponse {
  inventory: InventoryEntry[];
}

export interface ApplyItemResponse {
  templateKey: string;
  applied: boolean;
  remaining: number;
}

interface ApplyBody {
  templateKey?: unknown;
}

export const inventoryRoutes: FastifyPluginCallback<InventoryPluginOptions> = (
  fastify: FastifyInstance,
  opts: InventoryPluginOptions,
  done: () => void,
): void => {
  const { userStore } = opts;

  fastify.get("/api/inventory", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const inventory = await userStore.getInventory(userId);
    const response: InventoryResponse = { inventory };
    return reply.send(response);
  });

  fastify.post<{ Body: ApplyBody }>("/api/item/apply", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const body = req.body ?? {};
    if (typeof body.templateKey !== "string" || body.templateKey.length === 0) {
      return reply.code(400).send({ error: "invalid_template_key" });
    }
    const template = ITEMS_BY_KEY[body.templateKey];
    if (!template) {
      return reply.code(400).send({ error: "unknown_item" });
    }
    if (template.kind === "training-chip") {
      return reply.code(400).send({ error: "use_training_endpoint" });
    }

    const result = await userStore.consumeItem(userId, body.templateKey, 1);
    if (!result.ok) {
      const code = result.reason === "not_found" ? 404 : 409;
      return reply.code(code).send({ error: result.reason });
    }

    const response: ApplyItemResponse = {
      templateKey: body.templateKey,
      applied: true,
      remaining: result.remaining,
    };
    return reply.send(response);
  });

  done();
};
