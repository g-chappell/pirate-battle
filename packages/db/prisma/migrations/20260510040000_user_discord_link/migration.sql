-- AlterTable
ALTER TABLE "User" ADD COLUMN "discordUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_discordUserId_key" ON "User"("discordUserId");
