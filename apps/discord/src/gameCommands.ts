import type { APIEmbed } from "discord.js";

import {
  buildBattleStartEmbed,
  buildCaptainListEmbed,
  buildStatsEmbed,
  buildTeamEmbed,
} from "./embeds.js";
import {
  fetchMe,
  fetchStats,
  fetchTeam,
  startBattle,
  type ApiCallEnv,
  type ApiResult,
} from "./serverClient.js";

const NOT_LINKED_MESSAGE =
  "You haven't linked your Discord account yet. Run `/link` to get started.";
const SERVER_DOWN_MESSAGE = "Couldn't reach the Pirate-Battle server. Try again in a moment.";
const UNKNOWN_ERROR_MESSAGE =
  "Something went wrong. Try again, and contact an admin if it persists.";

const ERROR_MESSAGES: Record<string, string> = {
  not_linked: NOT_LINKED_MESSAGE,
  target_not_linked:
    "That user hasn't linked their Discord account to Pirate-Battle yet — no stats to show.",
  captain_not_found: "Couldn't find that captain on your account.",
  unsupported_opponent: "PvP via Discord isn't supported yet — pass `opponent:ai` to fight the AI.",
  invalid_discord_user_id: "Couldn't read your Discord user id. Try again, or contact an admin.",
  invalid_captain_id: "Captain id was missing or invalid.",
  invalid_target_discord_user_id: "That user mention isn't a valid Discord user.",
  network_error: SERVER_DOWN_MESSAGE,
  unknown_error: UNKNOWN_ERROR_MESSAGE,
};

function friendly(reason: string): string {
  return ERROR_MESSAGES[reason] ?? UNKNOWN_ERROR_MESSAGE;
}

export interface CommandResult {
  content?: string;
  embeds?: APIEmbed[];
}

function asError<T>(result: Extract<ApiResult<T>, { ok: false }>): CommandResult {
  return { content: friendly(result.reason) };
}

export async function handleTeamCommand(
  env: ApiCallEnv,
  discordUserId: string,
): Promise<CommandResult> {
  const me = await fetchMe(env, discordUserId);
  if (!me.ok) return asError(me);
  const captains = me.data.user.captains;
  if (captains.length === 0) {
    return { embeds: [buildCaptainListEmbed(captains)] };
  }
  const firstCaptainId = captains[0]!.id;
  const team = await fetchTeam(env, discordUserId, firstCaptainId);
  if (!team.ok) return asError(team);
  const embeds: APIEmbed[] = [buildTeamEmbed(team.data.captain)];
  if (captains.length > 1) {
    embeds.push(buildCaptainListEmbed(captains));
  }
  return { embeds };
}

export async function handleBattleCommand(
  env: ApiCallEnv,
  discordUserId: string,
  opponent: string,
): Promise<CommandResult> {
  if (opponent !== "ai") {
    return { content: friendly("unsupported_opponent") };
  }
  const me = await fetchMe(env, discordUserId);
  if (!me.ok) return asError(me);
  const captains = me.data.user.captains;
  if (captains.length === 0) {
    return {
      content:
        "You don't have a captain yet — build one on the web, then come back to start a battle.",
    };
  }
  const battle = await startBattle(env, {
    discordUserId,
    captainId: captains[0]!.id,
    opponent: "ai",
  });
  if (!battle.ok) return asError(battle);
  return {
    embeds: [
      buildBattleStartEmbed({
        captainName: battle.data.captainName,
        state: battle.data.state,
        battleId: battle.data.id,
      }),
    ],
  };
}

export async function handleStatsCommand(
  env: ApiCallEnv,
  discordUserId: string,
  targetDiscordUserId: string | null,
): Promise<CommandResult> {
  const stats = await fetchStats(env, discordUserId, targetDiscordUserId ?? undefined);
  if (!stats.ok) return asError(stats);
  const isSelf = targetDiscordUserId === null || targetDiscordUserId === discordUserId;
  return { embeds: [buildStatsEmbed(stats.data, { isSelf })] };
}
