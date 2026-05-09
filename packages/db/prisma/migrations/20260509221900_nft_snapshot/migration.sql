-- CreateTable
CREATE TABLE "NftSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nftsJson" JSONB NOT NULL,

    CONSTRAINT "NftSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NftSnapshot_userId_fetchedAt_idx" ON "NftSnapshot"("userId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "NftSnapshot" ADD CONSTRAINT "NftSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
