import { CREWS_BY_KEY, MOVES_BY_KEY } from "@pirate-battle/content";
import type { Action, BattleState, CrewSnapshot } from "@pirate-battle/core";
import type { APIEmbed } from "discord.js";

import {
  buildAvailableActionsHint,
  buildBattleStartEmbed,
  buildBattleTurnEmbed,
  buildCaptainListEmbed,
  buildStatsEmbed,
  buildTeamEmbed,
} from "./embeds.js";
import {
  fetchActiveBattle,
  fetchMe,
  fetchStats,
  fetchTeam,
  startBattle,
  submitBattleAction,
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
  no_active_battle: "You don't have a battle in progress. Run `/battle opponent:ai` to start one.",
  battle_ended: "That battle has already ended. Start a new one with `/battle opponent:ai`.",
  swap_required: "Your active crew has fainted — you must `/switch` before any other action.",
  unknown_move: "Your active crew doesn't know that move.",
  switch_out_of_range: "That bench slot doesn't exist.",
  switch_to_fainted: "That crew has fainted and can't be switched in.",
  invalid_action: "Invalid action.",
  invalid_action_type: "Invalid action type.",
  invalid_move_key: "Move name was missing or invalid.",
  invalid_target_index: "Bench index was missing or invalid.",
  network_error: SERVER_DOWN_MESSAGE,
  unknown_error: UNKNOWN_ERROR_MESSAGE,
};

function friendly(reason: string): string {
  return ERROR_MESSAGES[reason] ?? UNKNOWN_ERROR_MESSAGE;
}

export interface BattleChannelHook {
  battleId: string;
  embed: APIEmbed;
  transition: "create" | "update";
}

export interface CommandResult {
  content?: string;
  embeds?: APIEmbed[];
  battleHook?: BattleChannelHook;
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
  const embed = buildBattleStartEmbed({
    captainName: battle.data.captainName,
    state: battle.data.state,
    battleId: battle.data.id,
  });
  return {
    embeds: [embed],
    battleHook: {
      battleId: battle.data.id,
      embed,
      transition: "create",
    },
  };
}

function findMoveKey(active: CrewSnapshot, input: string): string | null {
  const normalised = input.trim().toLowerCase();
  if (normalised.length === 0) return null;
  const byKey = active.moves.find((m) => m.key.toLowerCase() === normalised);
  if (byKey) return byKey.key;
  const byName = active.moves.find((m) => m.name.toLowerCase() === normalised);
  if (byName) return byName.key;
  const globalByName = Object.values(MOVES_BY_KEY).find((m) => m.name.toLowerCase() === normalised);
  if (globalByName && active.moves.some((m) => m.key === globalByName.key)) {
    return globalByName.key;
  }
  return null;
}

function findBenchIndex(state: BattleState, input: string): number | null {
  const normalised = input.trim().toLowerCase();
  if (normalised.length === 0) return null;
  const matchIndex = state.benchA.findIndex((c) => {
    if (c.templateKey.toLowerCase() === normalised) return true;
    const def = CREWS_BY_KEY[c.templateKey];
    if (def && def.name.toLowerCase() === normalised) return true;
    return false;
  });
  return matchIndex >= 0 ? matchIndex : null;
}

type LoadedBattle =
  | { ok: true; battle: { id: string; state: BattleState }; captainName: string }
  | { ok: false; result: CommandResult };

async function loadActiveBattle(env: ApiCallEnv, discordUserId: string): Promise<LoadedBattle> {
  const me = await fetchMe(env, discordUserId);
  if (!me.ok) return { ok: false, result: asError(me) };
  const captainName = me.data.user.captains[0]?.name ?? "Captain";
  const active = await fetchActiveBattle(env, discordUserId);
  if (!active.ok) {
    if (active.reason === "no_active_battle") {
      return { ok: false, result: { content: friendly("no_active_battle") } };
    }
    return { ok: false, result: asError(active) };
  }
  return { ok: true, battle: active.data, captainName };
}

async function submitAndRender(
  env: ApiCallEnv,
  discordUserId: string,
  captainName: string,
  beforeLogLen: number,
  action: Action,
): Promise<CommandResult> {
  const result = await submitBattleAction(env, { discordUserId, action });
  if (!result.ok) return asError(result);
  const recentEvents = result.data.state.log.slice(beforeLogLen);
  const embed = buildBattleTurnEmbed({
    captainName,
    state: result.data.state,
    battleId: result.data.id,
    recentEvents,
  });
  return {
    embeds: [embed],
    battleHook: {
      battleId: result.data.id,
      embed,
      transition: "update",
    },
  };
}

export async function handleMoveCommand(
  env: ApiCallEnv,
  discordUserId: string,
  rawMoveName: string,
): Promise<CommandResult> {
  const loaded = await loadActiveBattle(env, discordUserId);
  if (!loaded.ok) return loaded.result;
  const { battle, captainName } = loaded;
  const moveKey = findMoveKey(battle.state.activeA, rawMoveName);
  if (!moveKey) {
    return {
      content: `Couldn't find a move named \`${rawMoveName}\` on your active crew.\n${buildAvailableActionsHint(battle.state)}`,
    };
  }
  return submitAndRender(env, discordUserId, captainName, battle.state.log.length, {
    type: "move",
    moveKey,
  });
}

export async function handleSwitchCommand(
  env: ApiCallEnv,
  discordUserId: string,
  rawCrewName: string,
): Promise<CommandResult> {
  const loaded = await loadActiveBattle(env, discordUserId);
  if (!loaded.ok) return loaded.result;
  const { battle, captainName } = loaded;
  const targetIndex = findBenchIndex(battle.state, rawCrewName);
  if (targetIndex === null) {
    return {
      content: `Couldn't find a benched crew named \`${rawCrewName}\`.\n${buildAvailableActionsHint(battle.state)}`,
    };
  }
  return submitAndRender(env, discordUserId, captainName, battle.state.log.length, {
    type: "switch",
    targetIndex,
  });
}

export async function handleForfeitCommand(
  env: ApiCallEnv,
  discordUserId: string,
): Promise<CommandResult> {
  const loaded = await loadActiveBattle(env, discordUserId);
  if (!loaded.ok) return loaded.result;
  const { battle, captainName } = loaded;
  return submitAndRender(env, discordUserId, captainName, battle.state.log.length, {
    type: "forfeit",
  });
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
