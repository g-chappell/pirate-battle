-- CreateEnum
CREATE TYPE "BattleMode" AS ENUM ('PVE', 'PVP', 'AI');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "stakeAddr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Captain" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Captain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crew" (
    "id" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "attrs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewMove" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "moveKey" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "isLearned" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CrewMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battle" (
    "id" TEXT NOT NULL,
    "mode" "BattleMode" NOT NULL,
    "participantAId" TEXT NOT NULL,
    "participantBId" TEXT,
    "resultJson" JSONB,
    "seed" BYTEA NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleEvent" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "kindStr" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,

    CONSTRAINT "BattleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_stakeAddr_key" ON "User"("stakeAddr");

-- CreateIndex
CREATE INDEX "Captain_userId_idx" ON "Captain"("userId");

-- CreateIndex
CREATE INDEX "Crew_captainId_idx" ON "Crew"("captainId");

-- CreateIndex
CREATE INDEX "CrewMove_crewId_idx" ON "CrewMove"("crewId");

-- CreateIndex
CREATE UNIQUE INDEX "CrewMove_crewId_slot_key" ON "CrewMove"("crewId", "slot");

-- CreateIndex
CREATE INDEX "Item_ownerUserId_idx" ON "Item"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_ownerUserId_templateKey_key" ON "Item"("ownerUserId", "templateKey");

-- CreateIndex
CREATE INDEX "Battle_participantAId_idx" ON "Battle"("participantAId");

-- CreateIndex
CREATE INDEX "Battle_participantBId_idx" ON "Battle"("participantBId");

-- CreateIndex
CREATE UNIQUE INDEX "BattleEvent_battleId_idx_key" ON "BattleEvent"("battleId", "idx");

-- AddForeignKey
ALTER TABLE "Captain" ADD CONSTRAINT "Captain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "Captain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMove" ADD CONSTRAINT "CrewMove_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_participantAId_fkey" FOREIGN KEY ("participantAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_participantBId_fkey" FOREIGN KEY ("participantBId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleEvent" ADD CONSTRAINT "BattleEvent_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
