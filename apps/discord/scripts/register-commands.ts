import { registerCommands } from "../src/registration.js";

interface ScriptEnv {
  clientId: string;
  token: string;
  devGuildId?: string;
}

function readScriptEnv(env: NodeJS.ProcessEnv = process.env): ScriptEnv {
  const token = env.DISCORD_TOKEN;
  const clientId = env.DISCORD_CLIENT_ID;
  if (!token) {
    throw new Error("DISCORD_TOKEN is required to register slash commands");
  }
  if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID is required to register slash commands");
  }
  return { token, clientId, devGuildId: env.DISCORD_DEV_GUILD_ID || undefined };
}

async function main(): Promise<void> {
  const env = readScriptEnv();
  const scope = env.devGuildId ? `guild ${env.devGuildId}` : "global";
  console.info(`[discord] registering slash commands (${scope})`);
  await registerCommands(env);
  console.info("[discord] slash commands registered");
}

main().catch((err) => {
  console.error("[discord] register-commands failed:", err);
  process.exit(1);
});
