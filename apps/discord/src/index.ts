import { startBot } from "./bot.js";
import { readLinkEnv } from "./link.js";

const env = readLinkEnv();

startBot(undefined, { env }).catch((err) => {
  console.error("[discord] fatal:", err);
  process.exit(1);
});
