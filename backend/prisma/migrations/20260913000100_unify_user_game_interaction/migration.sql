-- Preserve every existing library row and merge likes into the same user/game key.
-- The transaction aborts before dropping GameLike if the copied counts differ.
BEGIN;

ALTER TABLE "UserGameLibrary" ALTER COLUMN "status" DROP NOT NULL;
ALTER TABLE "UserGameLibrary" ADD COLUMN "liked" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "UserGameLibrary" ("userId", "gameId", "status", "liked", "createdAt", "updatedAt")
SELECT "userId", "gameId", NULL, true, "createdAt", "createdAt"
FROM "GameLike"
ON CONFLICT ("userId", "gameId") DO UPDATE SET "liked" = true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "GameLike" l
    LEFT JOIN "UserGameLibrary" i
      ON i."userId" = l."userId" AND i."gameId" = l."gameId"
    WHERE i."userId" IS NULL OR NOT i."liked"
  ) THEN
    RAISE EXCEPTION 'GameLike backfill incomplete; migration rolled back';
  END IF;
END $$;

CREATE INDEX "UserGameLibrary_userId_liked_idx" ON "UserGameLibrary"("userId", "liked");

-- Rating remains valid only for PLAYED, including when status is nullable.
DROP TABLE "GameLike";

COMMIT;
