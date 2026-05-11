import type { APIEmbed, ChatInputCommandInteraction, Interaction } from "discord.js";
import { MessageFlags } from "discord.js";

import {
  buildContinuationContent,
  buildContinuationLink,
  decideTransition,
  type BattleMessageTransition,
} from "./battleMessageState.js";
import type { ChannelOps } from "./channelOps.js";
import {
  handleBattleCommand,
  handleForfeitCommand,
  handleLeaderboardCommand,
  handleMoveCommand,
  handleStatsCommand,
  handleSwitchCommand,
  handleTeamCommand,
  type BattleChannelHook,
  type CommandResult,
} from "./gameCommands.js";
import { buildLinkInstructions, callLinkClaim, formatClaimReply } from "./link.js";
import type { LinkEnv } from "./link.js";
import { listInProgressBattleMessages, setBattleMessage } from "./serverClient.js";

export interface ReplyPayload {
  content?: string;
  embeds?: APIEmbed[];
}

export interface InteractionLike {
  commandName: string;
  user: { id: string; send: (content: string) => Promise<unknown> };
  getStringOption: (name: string) => string | null;
  getUserOption?: (name: string) => { id: string } | null;
  reply: (content: string | ReplyPayload) => Promise<unknown>;
  channelId?: string | null;
  guildId?: string | null;
}

export interface Logger {
  warn: (...args: unknown[]) => void;
}

export interface InteractionDeps {
  env: LinkEnv;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  channelOps?: ChannelOps;
  now?: () => number;
}

export async function handleInteraction(
  interaction: InteractionLike,
  deps: InteractionDeps,
): Promise<void> {
  if (interaction.commandName === "link") {
    const { channelReply } = buildLinkInstructions(deps.env);
    await interaction.reply(channelReply);
    return;
  }
  if (interaction.commandName === "link-claim") {
    const token = interaction.getStringOption("token");
    if (!token) {
      await interaction.reply("Link failed: token is required.");
      return;
    }
    const outcome = await callLinkClaim({
      serverUrl: deps.env.serverUrl,
      token,
      discordUserId: interaction.user.id,
      fetchImpl: deps.fetchImpl,
    });
    const { channelReply, dm } = formatClaimReply(outcome);
    await interaction.reply(channelReply);
    if (dm) {
      try {
        await interaction.user.send(dm);
      } catch (err) {
        (deps.logger ?? console).warn("[discord] failed to DM user", interaction.user.id, err);
      }
    }
    return;
  }
  if (interaction.commandName === "team") {
    const result = await handleTeamCommand(
      { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
      interaction.user.id,
    );
    await interaction.reply(toPayload(result));
    return;
  }
  if (interaction.commandName === "battle") {
    const opponent = (interaction.getStringOption("opponent") ?? "ai").trim().toLowerCase();
    const result = await handleBattleCommand(
      { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
      interaction.user.id,
      opponent,
    );
    await interaction.reply(toPayload(result));
    await maybePublishBattleMessage(interaction, deps, result.battleHook);
    return;
  }
  if (interaction.commandName === "stats") {
    const target = interaction.getUserOption?.("user") ?? null;
    const targetDiscordUserId = target ? target.id : null;
    const result = await handleStatsCommand(
      { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
      interaction.user.id,
      targetDiscordUserId,
    );
    await interaction.reply(toPayload(result));
    return;
  }
  if (interaction.commandName === "move") {
    const name = interaction.getStringOption("name") ?? "";
    const result = await handleMoveCommand(
      { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
      interaction.user.id,
      name,
    );
    await interaction.reply(toPayload(result));
    await maybeUpdateBattleMessage(interaction, deps, result.battleHook);
    return;
  }
  if (interaction.commandName === "switch") {
    const crew = interaction.getStringOption("crew") ?? "";
    const result = await handleSwitchCommand(
      { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
      interaction.user.id,
      crew,
    );
    await interaction.reply(toPayload(result));
    await maybeUpdateBattleMessage(interaction, deps, result.battleHook);
    return;
  }
  if (interaction.commandName === "forfeit") {
    const result = await handleForfeitCommand(
      { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
      interaction.user.id,
    );
    await interaction.reply(toPayload(result));
    await maybeUpdateBattleMessage(interaction, deps, result.battleHook);
    return;
  }
  if (interaction.commandName === "leaderboard") {
    const season = interaction.getStringOption("season");
    const result = await handleLeaderboardCommand(
      { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
      season,
    );
    await interaction.reply(toPayload(result));
    return;
  }
}

async function maybePublishBattleMessage(
  interaction: InteractionLike,
  deps: InteractionDeps,
  hook: BattleChannelHook | undefined,
): Promise<void> {
  if (!hook || hook.transition !== "create") return;
  const channelId = interaction.channelId;
  if (!channelId || !deps.channelOps) return;
  const logger = deps.logger ?? console;
  const send = await deps.channelOps.sendEmbed({ channelId, embed: hook.embed });
  if (!send.ok) {
    logger.warn("[battle-msg] sendEmbed failed", hook.battleId, send.reason);
    return;
  }
  const persist = await setBattleMessage(
    { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
    {
      battleId: hook.battleId,
      discordUserId: interaction.user.id,
      channelId,
      messageId: send.messageId,
      guildId: interaction.guildId ?? null,
      sentAtMs: send.sentAtMs,
    },
  );
  if (!persist.ok) {
    logger.warn("[battle-msg] setBattleMessage failed", hook.battleId, persist.reason);
  }
}

async function maybeUpdateBattleMessage(
  interaction: InteractionLike,
  deps: InteractionDeps,
  hook: BattleChannelHook | undefined,
): Promise<void> {
  if (!hook || hook.transition !== "update") return;
  const channelId = interaction.channelId;
  if (!channelId || !deps.channelOps) return;
  const logger = deps.logger ?? console;
  const list = await listInProgressBattleMessages({
    serverUrl: deps.env.serverUrl,
    fetchImpl: deps.fetchImpl,
  });
  const existing = list.ok ? list.data.battles.find((b) => b.battleId === hook.battleId) : null;
  const now = (deps.now ?? Date.now)();
  const transition: BattleMessageTransition = decideTransition({
    hasMessage: existing !== null && existing !== undefined,
    sentAtMs: existing?.sentAtMs ?? null,
    nowMs: now,
  });
  if (transition === "create") {
    await publishFreshBattleMessage(interaction, deps, hook, channelId);
    return;
  }
  if (!existing) return;
  if (transition === "edit") {
    const edit = await deps.channelOps.editEmbed({
      channelId: existing.channelId,
      messageId: existing.messageId,
      embed: hook.embed,
    });
    if (!edit.ok) {
      logger.warn("[battle-msg] editEmbed failed", hook.battleId, edit.reason);
    }
    return;
  }
  // rotate: send a new message in the current channel, mark old as continuation
  const send = await deps.channelOps.sendEmbed({ channelId, embed: hook.embed });
  if (!send.ok) {
    logger.warn("[battle-msg] rotate send failed", hook.battleId, send.reason);
    return;
  }
  const continuationLink = buildContinuationLink({
    guildId: interaction.guildId ?? null,
    channelId,
    messageId: send.messageId,
  });
  const setOld = await deps.channelOps.setMessageContent({
    channelId: existing.channelId,
    messageId: existing.messageId,
    content: buildContinuationContent(continuationLink),
  });
  if (!setOld.ok) {
    logger.warn("[battle-msg] rotate old-content edit failed", hook.battleId, setOld.reason);
  }
  const persist = await setBattleMessage(
    { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
    {
      battleId: hook.battleId,
      discordUserId: interaction.user.id,
      channelId,
      messageId: send.messageId,
      guildId: interaction.guildId ?? null,
      sentAtMs: send.sentAtMs,
    },
  );
  if (!persist.ok) {
    logger.warn("[battle-msg] rotate setBattleMessage failed", hook.battleId, persist.reason);
  }
}

async function publishFreshBattleMessage(
  interaction: InteractionLike,
  deps: InteractionDeps,
  hook: BattleChannelHook,
  channelId: string,
): Promise<void> {
  if (!deps.channelOps) return;
  const logger = deps.logger ?? console;
  const send = await deps.channelOps.sendEmbed({ channelId, embed: hook.embed });
  if (!send.ok) {
    logger.warn("[battle-msg] fresh send failed", hook.battleId, send.reason);
    return;
  }
  const persist = await setBattleMessage(
    { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl },
    {
      battleId: hook.battleId,
      discordUserId: interaction.user.id,
      channelId,
      messageId: send.messageId,
      guildId: interaction.guildId ?? null,
      sentAtMs: send.sentAtMs,
    },
  );
  if (!persist.ok) {
    logger.warn("[battle-msg] fresh setBattleMessage failed", hook.battleId, persist.reason);
  }
}

function toPayload(result: CommandResult): ReplyPayload | string {
  if (result.embeds && result.embeds.length > 0) {
    return { content: result.content, embeds: result.embeds };
  }
  return result.content ?? "";
}

export function adaptChatInputInteraction(
  interaction: ChatInputCommandInteraction,
): InteractionLike {
  return {
    commandName: interaction.commandName,
    user: {
      id: interaction.user.id,
      send: async (content) => interaction.user.send(content),
    },
    getStringOption: (name) => interaction.options.getString(name),
    getUserOption: (name) => {
      const user = interaction.options.getUser(name);
      return user ? { id: user.id } : null;
    },
    reply: async (payload) => {
      if (typeof payload === "string") {
        return interaction.reply({ content: payload, flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: payload.content,
        embeds: payload.embeds,
        flags: MessageFlags.Ephemeral,
      });
    },
    channelId: interaction.channelId,
    guildId: interaction.guildId,
  };
}

export async function dispatchInteraction(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  await handleInteraction(adaptChatInputInteraction(interaction), deps);
}
