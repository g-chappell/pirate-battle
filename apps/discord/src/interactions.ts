import type { APIEmbed, ChatInputCommandInteraction, Interaction } from "discord.js";
import { MessageFlags } from "discord.js";

import {
  handleBattleCommand,
  handleStatsCommand,
  handleTeamCommand,
  type CommandResult,
} from "./gameCommands.js";
import { buildLinkInstructions, callLinkClaim, formatClaimReply } from "./link.js";
import type { LinkEnv } from "./link.js";

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
}

export interface Logger {
  warn: (...args: unknown[]) => void;
}

export interface InteractionDeps {
  env: LinkEnv;
  fetchImpl?: typeof fetch;
  logger?: Logger;
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
  };
}

export async function dispatchInteraction(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  await handleInteraction(adaptChatInputInteraction(interaction), deps);
}
