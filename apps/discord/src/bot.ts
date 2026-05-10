import { Client, Events, GatewayIntentBits } from "discord.js";

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

export function createBot(): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, (ready) => {
    console.info(`[discord] logged in as ${ready.user.tag}`);
  });
  return client;
}

export async function startBot(env: BotEnv = readBotEnv()): Promise<Client> {
  const client = createBot();
  await client.login(env.token);
  return client;
}
