import { REST, Routes } from "discord.js";

import { buildCommandsPayload } from "./commands.js";

export interface RegistrationEnv {
  clientId: string;
  token: string;
  devGuildId?: string;
}

export type RegistrationRoute =
  | `/applications/${string}/commands`
  | `/applications/${string}/guilds/${string}/commands`;

export function pickRegistrationRoute(args: {
  clientId: string;
  devGuildId?: string;
}): RegistrationRoute {
  if (args.devGuildId) {
    return Routes.applicationGuildCommands(args.clientId, args.devGuildId);
  }
  return Routes.applicationCommands(args.clientId);
}

export async function registerCommands(env: RegistrationEnv): Promise<unknown> {
  const rest = new REST({ version: "10" }).setToken(env.token);
  const route = pickRegistrationRoute({
    clientId: env.clientId,
    devGuildId: env.devGuildId,
  });
  return rest.put(route, { body: buildCommandsPayload() });
}
