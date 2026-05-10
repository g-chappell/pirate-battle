-- AlterTable
ALTER TABLE "Battle" ADD COLUMN "captainBId" TEXT;
ALTER TABLE "Battle" ADD COLUMN "pendingActionA" JSONB;
ALTER TABLE "Battle" ADD COLUMN "pendingActionB" JSONB;
ALTER TABLE "Battle" ADD COLUMN "pendingSubmitAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PvpChallenge" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "challengerUserId" TEXT NOT NULL,
    "challengerCaptainId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedBattleId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PvpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PvpQueueEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "matchedBattleId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PvpQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PvpChallenge_token_key" ON "PvpChallenge"("token");

-- CreateIndex
CREATE INDEX "PvpChallenge_challengerUserId_idx" ON "PvpChallenge"("challengerUserId");

-- CreateIndex
CREATE INDEX "PvpChallenge_expiresAt_idx" ON "PvpChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PvpQueueEntry_userId_key" ON "PvpQueueEntry"("userId");

-- CreateIndex
CREATE INDEX "PvpQueueEntry_joinedAt_idx" ON "PvpQueueEntry"("joinedAt");

-- AddForeignKey
ALTER TABLE "PvpChallenge" ADD CONSTRAINT "PvpChallenge_challengerUserId_fkey" FOREIGN KEY ("challengerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvpQueueEntry" ADD CONSTRAINT "PvpQueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
