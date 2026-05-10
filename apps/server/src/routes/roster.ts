import { CREWS, type CrewTemplate } from "@pirate-battle/content";
import type { CrewSnapshot } from "@pirate-battle/core";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";

import type { BlockfrostNftService } from "../cardano/blockfrost.js";
import type { RosterDerivationService } from "../rosterDerivation.js";
import type { UserStore } from "../userStore.js";

import { getUserIdFromCookie } from "./session.js";

export interface RosterPluginOptions {
  userStore: UserStore;
  nftService?: BlockfrostNftService;
  derivationService?: RosterDerivationService;
}

export interface StarterCrewView {
  templateKey: string;
  name: string;
  affinity: string;
  baseStats: { hp: number; atk: number; def: number; spd: number };
  moveKeys: string[];
  lore: string;
}

export interface NftCrewView {
  policyId: string;
  assetName: string;
  unit: string;
  quantity: string;
  collectionName: string | null;
  derived: CrewSnapshot | null;
}

export interface RosterResponse {
  starter: StarterCrewView[];
  nft: NftCrewView[];
}

function toStarterView(c: CrewTemplate): StarterCrewView {
  return {
    templateKey: c.templateKey,
    name: c.name,
    affinity: c.affinity,
    baseStats: { ...c.baseStats },
    moveKeys: [...c.moveKeys],
    lore: c.lore,
  };
}

const STARTER_VIEW: readonly StarterCrewView[] = CREWS.map(toStarterView);

export const rosterRoutes: FastifyPluginCallback<RosterPluginOptions> = (
  fastify: FastifyInstance,
  opts: RosterPluginOptions,
  done: () => void,
): void => {
  fastify.get("/api/roster", async (req, reply) => {
    const userId = getUserIdFromCookie(req);
    if (!userId) return reply.code(401).send({ error: "no_session" });

    const user = await opts.userStore.findById(userId);
    if (!user) return reply.code(401).send({ error: "user_not_found" });

    const starter = STARTER_VIEW.map((c) => ({
      ...c,
      baseStats: { ...c.baseStats },
      moveKeys: [...c.moveKeys],
    }));

    let nft: NftCrewView[] = [];
    if (user.stakeAddr && opts.nftService) {
      const result = await opts.nftService.fetchUserNfts({
        userId: user.id,
        stakeAddr: user.stakeAddr,
      });
      if (opts.derivationService) {
        nft = opts.derivationService.derive(result.nfts);
      } else {
        nft = result.nfts.map((n) => ({
          policyId: n.policyId,
          assetName: n.assetName,
          unit: n.unit,
          quantity: n.quantity,
          collectionName: null,
          derived: null,
        }));
      }
    }

    const response: RosterResponse = { starter, nft };
    return reply.send(response);
  });

  done();
};
