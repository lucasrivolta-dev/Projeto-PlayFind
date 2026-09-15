-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('YOUTUBE', 'DIRECT', 'STEAM', 'OTHER');

-- AlterTable: add provider, mimeType, origin, authorizationRef (all nullable, no backfill)
ALTER TABLE "GameMedia"
  ADD COLUMN "provider"         "MediaProvider",
  ADD COLUMN "mimeType"         TEXT,
  ADD COLUMN "origin"           TEXT,
  ADD COLUMN "authorizationRef" TEXT;

-- Integrity constraint: DIRECT requires non-null, non-empty authorizationRef
-- NULL provider is allowed (legacy rows remain compatible)
ALTER TABLE "GameMedia"
  ADD CONSTRAINT "GameMedia_direct_requires_auth"
    CHECK (
      "provider" IS DISTINCT FROM 'DIRECT'
      OR (
        "authorizationRef" IS NOT NULL
        AND btrim("authorizationRef") <> ''
      )
    );
