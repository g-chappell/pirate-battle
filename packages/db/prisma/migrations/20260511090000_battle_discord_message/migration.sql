-- AlterTable
ALTER TABLE "Battle" ADD COLUMN "discordChannelId" TEXT;
ALTER TABLE "Battle" ADD COLUMN "discordMessageId" TEXT;
ALTER TABLE "Battle" ADD COLUMN "discordGuildId" TEXT;
ALTER TABLE "Battle" ADD COLUMN "discordMessageSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Battle_endedAt_discordMessageId_idx" ON "Battle"("endedAt", "discordMessageId");
