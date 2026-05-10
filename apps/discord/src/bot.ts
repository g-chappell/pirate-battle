import { Client, Events, GatewayIntentBits } from "discord.js";

import { dispatchInteraction } from "./interactions.js";
import type { InteractionDeps } from "./interactions.js";

export interface BotEnv {
  token: string;
}

export function readBotEnv(env: NodeJS.ProcessEnv = process.env): BotEnv {
  const token = env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN is required to start the Discord bot");
  }
  return { token };
}

export function createBot(deps?: InteractionDeps): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, (ready) => {
    console.info(`[discord] logged in as ${ready.user.tag}`);
  });
  if (deps) {
    client.on(Events.InteractionCreate, (interaction) => {
      dispatchInteraction(interaction, deps).catch((err) => {
        console.error("[discord] interaction handler failed:", err);
      });
    });
  }
  return client;
}

export async function startBot(
  env: BotEnv = readBotEnv(),
  deps?: InteractionDeps,
): Promise<Client> {
  const client = createBot(deps);
  await client.login(env.token);
  return client;
}
