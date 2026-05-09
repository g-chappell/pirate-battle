import type { CaptainTeam } from "./userStore.js";

export const AI_OPPONENT_ID = "ai_captain_salt_tongue";
export const AI_OPPONENT_NAME = "Captain Salt-Tongue";
export const AI_OPPONENT_FACTION = "kraken";

export function buildAIOpponentTeam(): CaptainTeam {
  return {
    id: AI_OPPONENT_ID,
    name: AI_OPPONENT_NAME,
    factionId: AI_OPPONENT_FACTION,
    crews: [
      {
        templateKey: "tide_brawler",
        moveKeys: ["tide_surge", "tentacle_lash", "ink_cloud", "maelstrom"],
      },
      {
        templateKey: "cannon_master",
        moveKeys: ["cannonade", "rivet_salvo", "hull_plate", "iron_will"],
      },
      {
        templateKey: "wraith_corsair",
        moveKeys: ["phantom_strike", "blood_fade", "vanish", "mirage"],
      },
      {
        templateKey: "cutlass_reaver",
        moveKeys: ["boarding_charge", "cutlass_combo", "berserk", "last_stand"],
      },
      {
        templateKey: "deep_warden",
        moveKeys: ["tide_surge", "tentacle_lash", "ink_cloud", "maelstrom"],
      },
      {
        templateKey: "crimson_berserker",
        moveKeys: ["boarding_charge", "cutlass_combo", "berserk", "last_stand"],
      },
    ],
  };
}
