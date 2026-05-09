import type { Affinity } from "@pirate-battle/core";

export interface CrewTemplate {
  templateKey: string;
  name: string;
  affinity: Affinity;
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spd: number;
  };
  moveKeys: readonly string[];
  lore: string;
}

export const CREWS: readonly CrewTemplate[] = [
  {
    templateKey: "tide_brawler",
    name: "Tide Brawler",
    affinity: "kraken",
    baseStats: { hp: 70, atk: 60, def: 60, spd: 60 },
    moveKeys: ["tide_surge", "tentacle_lash", "ink_cloud", "maelstrom"],
    lore: "[DRAFT] Order of the Kraken initiates trained in the breakers off Drowned Reach; even-tempered fighters who ride the swell instead of breaking on it.",
  },
  {
    templateKey: "deep_warden",
    name: "Deep Warden",
    affinity: "kraken",
    baseStats: { hp: 90, atk: 50, def: 80, spd: 30 },
    moveKeys: ["tide_surge", "ink_cloud", "tentacle_lash", "maelstrom"],
    lore: "[DRAFT] Veteran tide-keepers who anchor a line and refuse to yield. Slow off the mark, but pulling one off a position is its own ordeal.",
  },

  {
    templateKey: "cannon_master",
    name: "Cannon Master",
    affinity: "ironclad",
    baseStats: { hp: 65, atk: 65, def: 65, spd: 55 },
    moveKeys: ["cannonade", "hull_plate", "rivet_salvo", "iron_will"],
    lore: "[DRAFT] Gun-deck chiefs of the Ironclad fleet. Equally at home laying down a salvo or shoring up the bulkhead when return fire comes back.",
  },
  {
    templateKey: "bulwark_guard",
    name: "Bulwark Guard",
    affinity: "ironclad",
    baseStats: { hp: 95, atk: 45, def: 90, spd: 20 },
    moveKeys: ["hull_plate", "rivet_salvo", "cannonade", "iron_will"],
    lore: "[DRAFT] Plate-armoured boarding-blockers. They are the reason an Ironclad deck is taken inch by inch, never yard by yard.",
  },

  {
    templateKey: "wraith_corsair",
    name: "Wraith Corsair",
    affinity: "phantom",
    baseStats: { hp: 60, atk: 70, def: 50, spd: 70 },
    moveKeys: ["vanish", "phantom_strike", "mirage", "blood_fade"],
    lore: "[DRAFT] Phantom-touched raiders who slip between watches. Strike the manifest before the captain knows the hold has been opened.",
  },
  {
    templateKey: "mist_dancer",
    name: "Mist Dancer",
    affinity: "phantom",
    baseStats: { hp: 50, atk: 75, def: 35, spd: 90 },
    moveKeys: ["vanish", "phantom_strike", "blood_fade", "mirage"],
    lore: "[DRAFT] Specialists in fog-fight skirmishes. Fragile if pinned, but pinning one is the trick that has never been mastered.",
  },

  {
    templateKey: "cutlass_reaver",
    name: "Cutlass Reaver",
    affinity: "bloodborne",
    baseStats: { hp: 65, atk: 70, def: 55, spd: 60 },
    moveKeys: ["cutlass_combo", "boarding_charge", "berserk", "last_stand"],
    lore: "[DRAFT] Front-rank boarding crew. Trained to keep swinging through the second wound and the third — a Bloodborne tradition.",
  },
  {
    templateKey: "crimson_berserker",
    name: "Crimson Berserker",
    affinity: "bloodborne",
    baseStats: { hp: 55, atk: 95, def: 30, spd: 70 },
    moveKeys: ["cutlass_combo", "boarding_charge", "berserk", "last_stand"],
    lore: "[DRAFT] Glass-cannon shock troops who lead the breach. Plan the second wave before the first one lands; the berserker will not be there to ask.",
  },
];

export const CREWS_BY_KEY: Readonly<Record<string, CrewTemplate>> =
  Object.freeze(Object.fromEntries(CREWS.map((c) => [c.templateKey, c])));
