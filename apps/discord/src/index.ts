import { startBot } from "./bot.js";

startBot().catch((err) => {
  console.error("[discord] fatal:", err);
  process.exit(1);
});
