import type { Affinity } from "@pirate-battle/core";

export type ItemKind = "training-chip" | "potion" | "rune" | "token";

export interface ItemTemplate {
  templateKey: string;
  name: string;
  description: string;
  kind: ItemKind;
  affinity?: Affinity;
}

export const TRAINING_CHIP_KEY = "training-chip";
export const MINOR_POTION_KEY = "minor-potion";
export const RARE_TOKEN_KEY = "rare-token";

export const AFFINITY_RUNE_KEYS: Readonly<Record<Affinity, string>> = Object.freeze({
  kraken: "affinity-rune-kraken",
  ironclad: "affinity-rune-ironclad",
  phantom: "affinity-rune-phantom",
  bloodborne: "affinity-rune-bloodborne",
});

export const ITEMS: readonly ItemTemplate[] = [
  {
    templateKey: TRAINING_CHIP_KEY,
    kind: "training-chip",
    name: "Training Chip",
    description:
      "[DRAFT] A weather-bleached chit etched with crew sigils. Spend one to push a crew member one notch sharper in atk, def, or spd.",
  },
  {
    templateKey: MINOR_POTION_KEY,
    kind: "potion",
    name: "Minor Potion",
    description:
      "[DRAFT] A clouded vial of brine-tonic. Applied between battles to mend a crew's wounds before the next sortie.",
  },
  {
    templateKey: AFFINITY_RUNE_KEYS.kraken,
    kind: "rune",
    affinity: "kraken",
    name: "Kraken Rune",
    description:
      "[DRAFT] A barnacle-pitted disc that hums with deep-ocean menace. Applied to a crew to deepen their kraken affinity.",
  },
  {
    templateKey: AFFINITY_RUNE_KEYS.ironclad,
    kind: "rune",
    affinity: "ironclad",
    name: "Ironclad Rune",
    description:
      "[DRAFT] A cold rivet-stamped plate. Applied to a crew to fortify their ironclad affinity.",
  },
  {
    templateKey: AFFINITY_RUNE_KEYS.phantom,
    kind: "rune",
    affinity: "phantom",
    name: "Phantom Rune",
    description:
      "[DRAFT] A glass shard that does not quite catch the light. Applied to a crew to sharpen their phantom affinity.",
  },
  {
    templateKey: AFFINITY_RUNE_KEYS.bloodborne,
    kind: "rune",
    affinity: "bloodborne",
    name: "Bloodborne Rune",
    description:
      "[DRAFT] A warm sliver of cured bone. Applied to a crew to inflame their bloodborne affinity.",
  },
  {
    templateKey: RARE_TOKEN_KEY,
    kind: "token",
    name: "Rare Token",
    description:
      "[DRAFT] A scrimshaw token bearing the captain's mark. Reserved for trade-in once the quartermaster's wares come online.",
  },
];

export const ITEMS_BY_KEY: Readonly<Record<string, ItemTemplate>> = Object.freeze(
  Object.fromEntries(ITEMS.map((i) => [i.templateKey, i])),
);
