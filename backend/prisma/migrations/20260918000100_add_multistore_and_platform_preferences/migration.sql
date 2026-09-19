-- CreateEnum
CREATE TYPE "StoreName" AS ENUM ('STEAM', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'OTHER');

-- AlterTable
ALTER TABLE "SteamOffer" ADD COLUMN "originalPriceCents" INTEGER;

-- CreateTable
CREATE TABLE "StoreOffer" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "store" "StoreName" NOT NULL,
    "externalProductId" TEXT,
    "edition" TEXT,
    "storeUrl" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'BR',
    "currency" TEXT DEFAULT 'BRL',
    "originalPriceCents" INTEGER,
    "finalPriceCents" INTEGER,
    "discountPercent" INTEGER DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "StoreOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlatformPreference" (
    "userId" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPlatformPreference_pkey" PRIMARY KEY ("userId","platformId")
);

-- CreateIndex
CREATE INDEX "StoreOffer_gameId_store_observedAt_idx" ON "StoreOffer"("gameId", "store", "observedAt");

-- CreateIndex
CREATE INDEX "UserPlatformPreference_userId_idx" ON "UserPlatformPreference"("userId");

-- CreateIndex
CREATE INDEX "UserPlatformPreference_platformId_idx" ON "UserPlatformPreference"("platformId");

-- AddForeignKey
ALTER TABLE "StoreOffer" ADD CONSTRAINT "StoreOffer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlatformPreference" ADD CONSTRAINT "UserPlatformPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlatformPreference" ADD CONSTRAINT "UserPlatformPreference_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
