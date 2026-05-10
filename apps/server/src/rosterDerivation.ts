import type { CrewSnapshot } from "@pirate-battle/core";
import { deriveCrewStats, type NftMetadata } from "@pirate-battle/shared";

import type { UserNft } from "./cardano/blockfrost.js";
import type { CollectionRecord } from "./cardano/collectionStore.js";

export interface DerivedNft {
  policyId: string;
  assetName: string;
  unit: string;
  quantity: string;
  collectionName: string | null;
  derived: CrewSnapshot | null;
}

export class RosterDerivationService {
  private readonly byPolicyId: Map<string, CollectionRecord>;

  constructor(records: readonly CollectionRecord[]) {
    this.byPolicyId = new Map(records.map((r) => [r.policyId.toLowerCase(), r]));
  }

  derive(nfts: readonly UserNft[]): DerivedNft[] {
    return nfts.map((n) => this.deriveOne(n));
  }

  private deriveOne(nft: UserNft): DerivedNft {
    const collection = this.byPolicyId.get(nft.policyId.toLowerCase());
    if (!collection) {
      return {
        policyId: nft.policyId,
        assetName: nft.assetName,
        unit: nft.unit,
        quantity: nft.quantity,
        collectionName: null,
        derived: null,
      };
    }
    const metadata: NftMetadata = {
      policyId: nft.policyId,
      assetName: nft.assetName,
      traits: {},
    };
    const stats = deriveCrewStats(metadata, collection.rules);
    return {
      policyId: nft.policyId,
      assetName: nft.assetName,
      unit: nft.unit,
      quantity: nft.quantity,
      collectionName: collection.name,
      derived: stats,
    };
  }
}
