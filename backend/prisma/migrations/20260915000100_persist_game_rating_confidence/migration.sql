-- Preserve IGDB user and aggregate rating confidence independently.
ALTER TABLE "Game"
ADD COLUMN "ratingCount" INTEGER,
ADD COLUMN "totalRating" DOUBLE PRECISION,
ADD COLUMN "totalRatingCount" INTEGER;
