import { Client, Events, GatewayIntentBits } from "discord.js";

import { createDiscordJsChannelOps } from "./channelOps.js";
import { dispatchInteraction } from "./interactions.js";
import type { InteractionDeps } from "./interactions.js";
import {
  reconcileBattleMessages,
  type ReconcileBattleSnapshot,
} from "./reconcileBattleMessages.js";
import {
  clearBattleMessage,
  listInProgressBattleMessages,
  setBattleMessage,
} from "./serverClient.js";

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
    if (deps) {
      runReconcileAtStartup(client, deps).catch((err) => {
        console.error("[discord] reconcile at startup failed:", err);
      });
    }
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

async function runReconcileAtStartup(client: Client, deps: InteractionDeps): Promise<void> {
  const channelOps = deps.channelOps ?? createDiscordJsChannelOps(client);
  const apiEnv = { serverUrl: deps.env.serverUrl, fetchImpl: deps.fetchImpl };
  const list = await listInProgressBattleMessages(apiEnv);
  if (!list.ok) {
    console.warn("[reconcile] listInProgressBattleMessages failed:", list.reason);
    return;
  }
  const snapshots: ReconcileBattleSnapshot[] = list.data.battles.map((b) => ({
    battleId: b.battleId,
    channelId: b.channelId,
    messageId: b.messageId,
    guildId: b.guildId,
    sentAtMs: b.sentAtMs,
    discordUserId: b.discordUserId,
  }));
  const report = await reconcileBattleMessages({
    channelOps,
    listSnapshots: async () => snapshots,
    onResynced: async ({ battleId, channelId, messageId, guildId, sentAtMs, discordUserId }) => {
      await setBattleMessage(apiEnv, {
        battleId,
        discordUserId,
        channelId,
        messageId,
        guildId,
        sentAtMs,
      });
    },
    onCleared: async ({ battleId, discordUserId }) => {
      await clearBattleMessage(apiEnv, { battleId, discordUserId });
    },
  });
  console.info(
    `[reconcile] checked=${report.checked} resynced=${report.resynced} cleared=${report.cleared} failed=${report.failed}`,
  );
}

export async function startBot(
  env: BotEnv = readBotEnv(),
  deps?: InteractionDeps,
): Promise<Client> {
  const client = createBot(deps);
  await client.login(env.token);
  return client;
}
