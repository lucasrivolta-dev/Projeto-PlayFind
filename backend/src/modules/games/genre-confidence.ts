import { TASTE_SIGNAL_WEIGHTS, type UserTasteProfile } from '../recommendation/recommendation.service.js';

const normalize = (name: string) => name.trim().toLowerCase();
const clampTaste = (value: number) => Math.max(-10, Math.min(25, value));
const round = (value: number) => Number(value.toFixed(2));

/** Ranking confidence, not a claim about IGDB primary/secondary genres.
 * Preserve V1's aggregate affinity for corroborated matches. One match in a
 * mixed list stays weak unless the user's actual game history supports the mix.
 * No title, publisher, genre order, exposure or quality enters this calculation. */
export function calculateGenreConfidence(names: string[], profile?: UserTasteProfile) {
  const genres = [...new Set(names.map(normalize).filter(Boolean))].sort();
  if (!profile || !genres.length)
    return { score: 0, genreScore: 0, behaviorScore: 0, corroboration: 0 };
  const affinities = genres.map((g) => {
    const value = profile.genreAffinity.get(g) ?? 0;
    return Number.isFinite(value) ? value : 0;
  });
  const positive = affinities.filter((a) => a > 0).sort((a, b) => b - a);
  const [first = 0, second = 0] = positive;
  // Preserve V1's mean and x3 scale. Confidence interpolates from half to full
  // strength as a second affinity approaches one onboarding-positive weight.
  // A tiny second affinity cannot make one incidental match strongly supported.
  const corroboration = Math.min(1, second / TASTE_SIGNAL_WEIGHTS.ONBOARDING_POSITIVE);
  const supported = positive.reduce((a, b) => a + b, 0) * 3 / genres.length;
  const isolated = Math.min(TASTE_SIGNAL_WEIGHTS.ONBOARDING_POSITIVE * 3, supported / 2);
  const positiveScore = genres.length === 1
    ? first * 3
    : isolated + corroboration * (supported - isolated);
  const negativeScore = affinities.filter((a) => a < 0).reduce((a, b) => a + b, 0) * 3 / genres.length;

  // Reuse the SAME event/library weights already computed by Personalization V1.
  // Only examples sharing the full single genre or at least two genres count.
  // Jaccard squared limits weak overlaps; no additional query or event ingestion.
  const behavior = (profile.genreEvidence ?? []).map((example) => {
    if (!Number.isFinite(example.weight) || example.weight <= 0) return 0;
    const other = new Set(example.genres.map(normalize).filter(Boolean));
    const shared = genres.filter((g) => other.has(g)).length;
    if (shared < Math.min(2, genres.length)) return 0;
    const union = new Set([...genres, ...other]).size;
    return example.weight * (shared / union) ** 2 * 3;
  }).sort((a, b) => a - b).reduce((a, b) => a + b, 0);
  const genreScore = clampTaste(positiveScore + negativeScore);
  const behaviorScore = clampTaste(behavior + negativeScore);
  // Do not add the same behavioral evidence twice (it already feeds affinities).
  return {
    score: round(clampTaste(Math.max(positiveScore, behavior) + negativeScore)),
    genreScore: round(genreScore),
    behaviorScore: round(behaviorScore),
    corroboration: round(corroboration),
  };
}
