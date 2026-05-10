import { SlashCommandBuilder } from "discord.js";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";

export const commandDefinitions: SlashCommandBuilder[] = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Pirate-Battle bot heartbeat — replies with pong"),
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Begin linking your Discord account to a Pirate-Battle captain"),
  new SlashCommandBuilder()
    .setName("link-claim")
    .setDescription("Finish linking by submitting your one-time token from the web app")
    .addStringOption((opt) =>
      opt.setName("token").setDescription("One-time link token from the web app").setRequired(true),
    ) as SlashCommandBuilder,
];

export function buildCommandsPayload(): RESTPostAPIApplicationCommandsJSONBody[] {
  return commandDefinitions.map((command) => command.toJSON());
}
