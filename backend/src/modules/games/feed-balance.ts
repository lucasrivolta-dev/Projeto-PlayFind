import {
  canonicalGameTitle,
  type FeedCandidateInput,
  type calculateDiscoveryScore,
} from './game-eligibility.js';
import type { ExposureBand, resolveRatingEvidence } from './game-exposure.js';
import type { calculateGenreConfidence } from './genre-confidence.js';

export const FEED_BALANCE_CONFIG = {
  shares: { DISCOVERY: 0.4, MID_TAIL: 0.2, EMERGING: 0.2, HEAD: 0.2, UNPROVEN: 0 },
  relevanceSlack: 18,
  tasteSlack: 18,
  maxConsecutiveHead: 2,
  explorationEvery: 5,
  explorationMaxBonus: 4,
  studioPenalty: 5,
  publisherPenalty: 3,
  familyPenalty: 8,
  genrePenalty: 2,
} as const;

export interface BalanceCandidate extends FeedCandidateInput {
  title: string;
  discoveryScore: number;
  exposure: ReturnType<typeof resolveRatingEvidence>;
  scoreBreakdown: ReturnType<typeof calculateDiscoveryScore>['breakdown'] & {
    platformPreference: number;
    tasteAffinity: number;
    alreadyInteracted: number;
    tasteEvidence?: ReturnType<typeof calculateGenreConfidence>;
  };
  seenBucket: number;
}

export interface FeedRankingRow {
  position: number;
  id: string;
  title: string;
  genres: string[];
  exposureBand: ExposureBand;
  rating: number | null;
  effectiveVotes: number;
  ratingSource: string;
  qualityScore: number;
  adjustedRating: number;
  tasteScore: number;
  tasteEvidence?: ReturnType<typeof calculateGenreConfidence>;
  platformScore: number;
  discoveryValue: number;
  freshnessScore: number;
  metadataScore: number;
  repetitionScore: number;
  seenBucket: number;
  scoreBeforeComposition: number;
  diversityPenalty: number;
  explorationBonus: number;
  selectionScore: number;
  reason: string;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
const companies = (s?: string | null) =>
  new Set(
    (s ?? '')
      .split(',')
      .map(normalize)
      .filter((name) => Boolean(name) && !/^(inc\.?|ltd\.?|llc|co\.?|corp\.?)$/.test(name)),
  );
const intersects = (a: Set<string>, b: Set<string>) => [...a].some((v) => b.has(v));
const genres = (c: FeedCandidateInput) => new Set((c.genres ?? []).map(normalize));
function similarity(a: FeedCandidateInput, b: FeedCandidateInput) {
  const ga = genres(a),
    gb = genres(b);
  const union = new Set([...ga, ...gb]);
  return union.size ? [...ga].filter((g) => gb.has(g)).length / union.size : 0;
}

/** Only explicit edition/remaster/sequel suffixes or colon-delimited series names.
 * Never infer a franchise from an arbitrary first-two-words prefix. This is a
 * soft repetition hint, requires a shared company, and never merges identities. */
export function semanticFamilyKey(title: string): string {
  const prefix = title.includes(':') ? title.slice(0, title.indexOf(':')).trim() : title;
  const safePrefix = prefix.split(/\s+/).length >= 2 ? prefix : title;
  return canonicalGameTitle(safePrefix)
    .replace(/\b(remake|remaster|remastered)\b/g, '')
    .replace(/\s+(?:(?:part|chapter)\s+)?(?:\d+|ii|iii|iv|v|vi|vii|viii|ix)$/, '')
    .trim();
}

function diversityPenalty(candidate: BalanceCandidate, picked: BalanceCandidate[]) {
  const config = FEED_BALANCE_CONFIG;
  let penalty = 0;
  for (const prior of picked.slice(-4)) {
    const studio = intersects(companies(candidate.studio), companies(prior.studio));
    const publisher = intersects(companies(candidate.publisher), companies(prior.publisher));
    if (studio) penalty += config.studioPenalty;
    if (publisher) penalty += config.publisherPenalty;
    if (
      (studio || publisher) &&
      semanticFamilyKey(candidate.title) === semanticFamilyKey(prior.title)
    )
      penalty += config.familyPenalty;
  }
  for (const prior of picked.slice(-3))
    penalty += similarity(candidate, prior) * config.genrePenalty;
  return penalty;
}

function fallbackTier(c: BalanceCandidate) {
  // Established interactions remain a last-resort pool, never pulled forward by quotas.
  if (c.scoreBreakdown.alreadyInteracted < 0) return 6;
  if (c.seenBucket > 0) return 4 + c.seenBucket; // 5 for seen long ago, 6 for recently seen
  if (c.exposure.exposureBand === 'UNPROVEN') return 2;
  return c.scoreBreakdown.discoveryPoints > 0 ? 0 : 1;
}

export function balanceFeed<T extends BalanceCandidate>(
  candidates: T[],
  limit: number,
  personalized: boolean,
) {
  const config = FEED_BALANCE_CONFIG;
  const bands = Object.keys(config.shares) as ExposureBand[];
  const target = Object.fromEntries(
    bands.map((b) => [b, Math.floor(limit * config.shares[b])]),
  ) as Record<ExposureBand, number>;
  const remainderOrder = [...bands].sort(
    (a, b) =>
      ((limit * config.shares[b]) % 1) - ((limit * config.shares[a]) % 1) ||
      bands.indexOf(a) - bands.indexOf(b),
  );
  let remainder = limit - Object.values(target).reduce((a, b) => a + b, 0);
  for (const b of remainderOrder)
    if (remainder > 0 && config.shares[b] > 0) {
      target[b]++;
      remainder--;
    }
  const counts = Object.fromEntries(bands.map((b) => [b, 0])) as Record<ExposureBand, number>;
  const pool = [...candidates];
  const selected: T[] = [];
  const diagnostics: FeedRankingRow[] = [];

  while (selected.length < limit && pool.length) {
    const tier = Math.min(...pool.map(fallbackTier));
    const eligible = pool.filter((c) => fallbackTier(c) === tier);
    const bestScore = Math.max(...eligible.map((c) => c.discoveryScore));
    const bestTaste = Math.max(...eligible.map((c) => c.scoreBreakdown.tasteAffinity));
    // Personal relevance first. A missing band cannot pull an unrelated game
    // across this window; the target is relaxed instead.
    let relevant = eligible.filter(
      (c) =>
        c.discoveryScore >= bestScore - config.relevanceSlack &&
        (!personalized || c.scoreBreakdown.tasteAffinity >= bestTaste - config.tasteSlack),
    );
    if (!relevant.length) relevant = eligible.filter((c) => c.discoveryScore === bestScore);
    const recent = selected.slice(-config.maxConsecutiveHead);
    const headStreak =
      recent.length === config.maxConsecutiveHead &&
      recent.every((c) => c.exposure.exposureBand === 'HEAD');
    const alternatives = relevant.filter((c) => c.exposure.exposureBand !== 'HEAD');
    if (headStreak && alternatives.length) relevant = alternatives;

    // Choose a band by its accumulated deficit, then rank within that band.
    // Diversity and exploration participate here, not in a later reorder.
    const underTarget = relevant.filter(
      (c) => counts[c.exposure.exposureBand] < target[c.exposure.exposureBand],
    );
    const fallback = !underTarget.length;
    if (underTarget.length) {
      const deficit = (b: ExposureBand) => (target[b] * (selected.length + 1)) / limit - counts[b];
      const maxDeficit = Math.max(...underTarget.map((c) => deficit(c.exposure.exposureBand)));
      relevant = underTarget.filter(
        (c) => Math.abs(deficit(c.exposure.exposureBand) - maxDeficit) < 1e-9,
      );
    }
    const explorationSlot = (selected.length + 1) % config.explorationEvery === 0;
    const scored = relevant
      .map((candidate) => {
        const penalty = diversityPenalty(candidate, selected);
        const novelty = selected.length
          ? 1 - Math.max(...selected.slice(-5).map((p) => similarity(candidate, p)))
          : 0;
        // Adjacency comes from the full weighted taste vector, novelty from the
        // recent genre mix. Quality/exposure gate this opportunity, not extra scores.
        const adjacent = !personalized || candidate.scoreBreakdown.tasteAffinity > 0;
        const explorationBonus =
          explorationSlot && adjacent && tier === 0 && candidate.exposure.exposureBand !== 'HEAD'
            ? config.explorationMaxBonus * novelty
            : 0;
        return {
          candidate,
          penalty,
          explorationBonus,
          score: candidate.discoveryScore - penalty + explorationBonus,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.candidate.discoveryScore - a.candidate.discoveryScore ||
          b.candidate.scoreBreakdown.adjustedRating - a.candidate.scoreBreakdown.adjustedRating ||
          a.candidate.id.localeCompare(b.candidate.id),
      );
    const pick = scored[0];
    const c = pick.candidate;
    selected.push(c);
    pool.splice(pool.indexOf(c), 1);
    counts[c.exposure.exposureBand]++;
    diagnostics.push({
      position: selected.length,
      id: c.id,
      title: c.title,
      genres: c.genres ?? [],
      exposureBand: c.exposure.exposureBand,
      rating: c.exposure.rating100 === null ? null : c.exposure.rating100 / 10,
      effectiveVotes: c.exposure.effectiveVotes,
      ratingSource: c.exposure.source,
      qualityScore: c.scoreBreakdown.qualityPoints,
      adjustedRating: c.scoreBreakdown.adjustedRating,
      tasteScore: c.scoreBreakdown.tasteAffinity,
      tasteEvidence: c.scoreBreakdown.tasteEvidence,
      platformScore: c.scoreBreakdown.platformPreference,
      discoveryValue: c.scoreBreakdown.discoveryPoints,
      freshnessScore: c.scoreBreakdown.freshnessPoints,
      metadataScore: c.scoreBreakdown.metadataPoints,
      repetitionScore: c.scoreBreakdown.alreadyInteracted,
      seenBucket: c.seenBucket,
      scoreBeforeComposition: c.discoveryScore,
      diversityPenalty: Number(pick.penalty.toFixed(2)),
      explorationBonus: Number(pick.explorationBonus.toFixed(2)),
      selectionScore: Number(pick.score.toFixed(2)),
      reason: [
        fallback
          ? 'fallback: target unavailable within relevance window'
          : `soft balance: ${c.exposure.exposureBand}`,
        tier ? `fallback tier ${tier}` : 'quality qualified',
        headStreak && alternatives.length ? 'break HEAD streak' : '',
        pick.penalty ? 'soft repetition penalty' : '',
        pick.explorationBonus ? 'adjacent novelty' : '',
      ]
        .filter(Boolean)
        .join('; '),
    });
  }
  return { selected, diagnostics, counts, target };
}
