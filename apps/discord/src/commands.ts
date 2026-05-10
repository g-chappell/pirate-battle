import { SlashCommandBuilder } from "discord.js";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";

export const commandDefinitions: SlashCommandBuilder[] = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Pirate-Battle bot heartbeat — replies with pong"),
];

export function buildCommandsPayload(): RESTPostAPIApplicationCommandsJSONBody[] {
  return commandDefinitions.map((command) => command.toJSON());
}
