/** One paired source for feed quality, confidence, exposure and diagnostics. */
export interface RatingEvidenceInput {
  rating?: number | null;
  ratingCount?: number | null;
  totalRating?: number | null;
  totalRatingCount?: number | null;
}

export type ExposureBand = 'UNPROVEN' | 'EMERGING' | 'DISCOVERY' | 'MID_TAIL' | 'HEAD';

export function getExposureBand(votes: number): ExposureBand {
  if (!Number.isSafeInteger(votes) || votes < 10) return 'UNPROVEN';
  if (votes < 100) return 'EMERGING';
  if (votes < 500) return 'DISCOVERY';
  if (votes < 1000) return 'MID_TAIL';
  return 'HEAD';
}

export function resolveRatingEvidence(input: RatingEvidenceInput) {
  const valid = (rating: number | null | undefined, count: number | null | undefined) =>
    typeof rating === 'number' &&
    Number.isFinite(rating) &&
    rating >= 0 &&
    rating <= 100 &&
    typeof count === 'number' &&
    Number.isSafeInteger(count) &&
    count >= 0;
  const source = valid(input.totalRating, input.totalRatingCount)
    ? 'TOTAL_RATING'
    : valid(input.rating, input.ratingCount)
      ? 'USER_RATING'
      : 'UNKNOWN';
  const rating =
    source === 'TOTAL_RATING'
      ? input.totalRating!
      : source === 'USER_RATING'
        ? input.rating!
        : null;
  const effectiveVotes =
    source === 'TOTAL_RATING'
      ? input.totalRatingCount!
      : source === 'USER_RATING'
        ? input.ratingCount!
        : 0;
  // Domain values use 0–10; retain the existing scorer's 0–100 input compatibility.
  const rating100 = rating === null ? null : rating > 10 ? rating : rating * 10;
  return { source, rating100, effectiveVotes, exposureBand: getExposureBand(effectiveVotes) };
}
