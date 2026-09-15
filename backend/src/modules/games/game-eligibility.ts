import type { NormalizedTrailer } from './normalized-game.js';

export type RejectionReason =
  | 'MOD'
  | 'DLC'
  | 'EXPANSION'
  | 'BUNDLE'
  | 'DEMO'
  | 'PLAYTEST'
  | 'TOOL_OR_SERVER'
  | 'SOUNDTRACK'
  | 'LOW_QUALITY'
  | 'DUPLICATE'
  | 'MISSING_TITLE';

export interface EligibilityResult {
  eligible: boolean;
  reason?: RejectionReason;
  details?: string;
}

export interface CatalogCandidateInput {
  title?: string | null;
  slug?: string | null;
  gameType?: number | null;
  rating?: number | null;
  ratingCount?: number | null;
  totalRating?: number | null;
  totalRatingCount?: number | null;
  coverUrl?: string | null;
  heroUrl?: string | null;
  releaseDate?: Date | null;
  description?: string | null;
  isAvailable?: boolean | null;
}

export interface FeedCandidateInput extends CatalogCandidateInput {
  id: string;
  studio?: string | null;
  publisher?: string | null;
  genres?: string[];
  platforms?: string[];
  trailers?: string[];
  trailerDetails?: NormalizedTrailer[];
  primaryTrailer?: NormalizedTrailer | null;
}

/**
 * Configuration for discovery scoring, weights and thresholds.
 * Centralized, typed, and fully documented to prevent magic numbers.
 */
export const DISCOVERY_SCORING_CONFIG = {
  weights: {
    /** 50% max weight (up to 50 pts) */
    quality: 0.5,
    /** 25% max weight (up to 25 pts) */
    freshness: 0.25,
    /** 15% max weight (up to 15 pts) */
    discovery: 0.15,
    /** 10% max weight (up to 10 pts) */
    metadata: 0.1,
  },
  bayesian: {
    /** C: Catalog prior average (scale 0–100) */
    baselineRating: 75,
    /** m: Minimum confidence sample inertia (calibrated from 30 to 50 based on IGDB live distribution) */
    confidenceThreshold: 50,
    /** Baseline rating applied when candidate has no rating at all */
    defaultRatingIfMissing: 60,
  },
  freshness: {
    /** Releases <= 2 years receive full freshness bonus (25 pts) */
    fullBonusYears: 2,
    /** Annual decay rate for 2–5 years */
    decayPerYearRecent: 2.5,
    /** Annual decay rate for 5–10 years */
    decayPerYearMedium: 1.5,
    /** Annual decay rate for > 10 years */
    decayPerYearOld: 0.8,
    /** Minimum Bayesian rating to qualify for classic preservation floor */
    classicMinRating: 85,
    /** Floor points for high-quality classics */
    classicFloorPoints: 10,
    /** Minimum baseline freshness for ancient low-relevance titles */
    minFreshnessPoints: 2,
    /** Minimum vote confidence to receive full freshness potential without dampening */
    minConfidenceForFullFreshness: 50,
    /** Minimum confidence factor floor for freshness */
    minFreshnessConfidenceFactor: 0.7,
  },
  discovery: {
    /** Minimum Bayesian rating to be considered for hidden gem bonus */
    minRatingForGem: 80,
    /** Minimum review evidence required before hidden gem ramp begins */
    minReviewsForGemRamp: 30,
    /** Review count at which maximum hidden gem bonus is reached */
    fullReviewsForGem: 100,
    /** Upper bound for hidden gem category */
    maxReviewsForGem: 1200,
    /** Maximum bonus points for hidden gem (calibrated from 15 to 12) */
    gemMaxBonus: 12,
    /** Baseline bonus when entering hidden gem ramp */
    gemMinBonus: 5,
    /** Threshold for mainstream games */
    mainstreamReviewThreshold: 5000,
    /** Moderate stability bonus for mainstream hits */
    mainstreamBonus: 6,
    /** Intermediate bonus for established popular games (1200-5000) */
    moderatePopularityBonus: 8,
    /** Base discovery bonus for unproven / low-sample titles (< 30 reviews) */
    unprovenBonus: 4,
  },
  metadata: {
    /** DIRECT trailer verified and reproducible */
    directTrailerBonus: 10,
    /** YouTube trailer with valid videoId */
    youtubeTrailerBonus: 8,
    /** Steam video only */
    steamTrailerBonus: 3,
    /** Heavy score penalty if no playable trailer is present in feed */
    noTrailerPenalty: -15,
    /** Penalty if all available videos are disqualified (walkthrough/review) */
    disqualifiedTrailerPenalty: -12,
    /** Bonus for complete cover, hero artwork, and synopsis */
    richMetadataBonus: 2,
  },
} as const;

/**
 * Regular expressions identifying disqualified video titles (not real trailers).
 */
const DISQUALIFIED_VIDEO_REGEX =
  /\b(guide|walkthrough|tutorial|tips|how to|review|let's play|playthrough|gameplay walkthrough|full gameplay|benchmark|comparison|reaction|dev diary|developer diary|making of|interview|unboxing|soundtrack|ost)\b/i;

/**
 * Checks if a video title indicates non-trailer content.
 */
export function isDisqualifiedTrailer(videoName?: string): boolean {
  if (!videoName || !videoName.trim()) return false;
  return DISQUALIFIED_VIDEO_REGEX.test(videoName.trim());
}

/**
 * Regular expressions identifying junk / auxiliary content in game titles.
 */
const MOD_TITLE_REGEX = /\b(mod|modification|overhaul mod|community mod)\b/i;
const DLC_TITLE_REGEX =
  /\b(dlc|expansion pack|content pack|season pass|expansion|addon|add-on)\b/i;
const DEMO_TITLE_REGEX = /\b(demo|prologue|playable teaser)\b/i;
const PLAYTEST_TITLE_REGEX =
  /\b(playtest|closed beta|open beta|alpha test|technical test|server test)\b/i;
const BUNDLE_TITLE_REGEX = /\b(bundle|collection bundle|trilogy pack|anthology pack)\b/i;
const TOOL_OR_SERVER_REGEX =
  /\b(dedicated server|benchmark|sdk|toolkit|tool|editor|soundtrack|ost|artbook)\b/i;
const SOUNDTRACK_TITLE_REGEX = /\b(soundtrack|original soundtrack|ost)\b/i;

/**
 * Validates whether a candidate game is eligible for catalog inclusion.
 * Excludes mods, DLCs, expansions, bundles, demos, playtests, tools, and soundtracks.
 * Preserves remakes, remasters, indie discoveries, and high-quality classics.
 */
export function isEligibleForCatalog(candidate: CatalogCandidateInput): EligibilityResult {
  const title = candidate.title?.trim();
  if (!title) {
    return { eligible: false, reason: 'MISSING_TITLE', details: 'Game has no title.' };
  }

  // Check IGDB game_type when present
  // 0: Main Game, 1: DLC, 2: Expansion, 3: Bundle, 4: Standalone Expansion,
  // 5: Mod, 6: Episode, 7: Season, 8: Remake, 9: Remaster, 10: Expanded Game,
  // 11: Port, 12: Fork, 13: Pack, 14: Update
  if (candidate.gameType !== undefined && candidate.gameType !== null) {
    if (candidate.gameType === 5) {
      return { eligible: false, reason: 'MOD', details: 'IGDB game_type is Mod (5).' };
    }
    if (candidate.gameType === 1) {
      return { eligible: false, reason: 'DLC', details: 'IGDB game_type is DLC (1).' };
    }
    if (candidate.gameType === 2 || candidate.gameType === 4) {
      return {
        eligible: false,
        reason: 'EXPANSION',
        details: `IGDB game_type is Expansion (${candidate.gameType}).`,
      };
    }
    if (candidate.gameType === 3 || candidate.gameType === 13) {
      return {
        eligible: false,
        reason: 'BUNDLE',
        details: `IGDB game_type is Bundle/Pack (${candidate.gameType}).`,
      };
    }
    if (candidate.gameType === 10) {
      return {
        eligible: false,
        reason: 'EXPANSION',
        details: 'IGDB game_type is Expanded Game (10).',
      };
    }
    if (candidate.gameType === 11 || candidate.gameType === 12 || candidate.gameType === 14) {
      return {
        eligible: false,
        reason: 'LOW_QUALITY',
        details: `IGDB game_type is Port/Fork/Update (${candidate.gameType}).`,
      };
    }
  }

  // Pattern checks on title
  if (SOUNDTRACK_TITLE_REGEX.test(title)) {
    return { eligible: false, reason: 'SOUNDTRACK', details: 'Title indicates soundtrack/OST.' };
  }
  if (MOD_TITLE_REGEX.test(title)) {
    return { eligible: false, reason: 'MOD', details: 'Title indicates mod or overhaul.' };
  }
  if (DLC_TITLE_REGEX.test(title)) {
    return { eligible: false, reason: 'DLC', details: 'Title indicates DLC or expansion pack.' };
  }
  if (DEMO_TITLE_REGEX.test(title)) {
    return { eligible: false, reason: 'DEMO', details: 'Title indicates demo or prologue.' };
  }
  if (PLAYTEST_TITLE_REGEX.test(title)) {
    return { eligible: false, reason: 'PLAYTEST', details: 'Title indicates playtest or beta.' };
  }
  if (BUNDLE_TITLE_REGEX.test(title)) {
    return { eligible: false, reason: 'BUNDLE', details: 'Title indicates bundle or compilation pack.' };
  }
  if (TOOL_OR_SERVER_REGEX.test(title)) {
    return { eligible: false, reason: 'TOOL_OR_SERVER', details: 'Title indicates tool, server, or SDK.' };
  }

  // Quality validation when ratings exist
  if (candidate.rating !== undefined && candidate.rating !== null) {
    const normalizedRating = candidate.rating > 10 ? candidate.rating : candidate.rating * 10;
    // Extremely poor ratings (< 40) with confirmed review count indicate low-quality spam
    if (normalizedRating < 40 && (candidate.ratingCount ?? 0) >= 10) {
      return {
        eligible: false,
        reason: 'LOW_QUALITY',
        details: `Rating too low (${normalizedRating.toFixed(1)}) with substantial votes.`,
      };
    }
  }

  return { eligible: true };
}

/**
 * Normalizes title for canonical comparison (removing common edition tags).
 * Leaves remake/remaster designations intact so they are NOT confused with the original.
 */
export function canonicalGameTitle(rawTitle?: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove edition suffixes (case-insensitive)
    .replace(
      /[-:]?\s*\b(digital\s+deluxe|deluxe|definitive|collector's|collectors|enhanced|anniversary|special|goty|game of the year|standard|day one|launch|gold|ultimate|premium)\s+(edition|version|cut|pack)\b/gi,
      '',
    )
    .replace(
      /[-:]?\s*\b(nintendo\s+switch|switch|ps5|ps4|xbox|pc)\s+(2\s+)?(edition|version)\b/gi,
      '',
    )
    .replace(/[-:]?\s*\b(director's cut|directors cut)\b/gi, '')
    .replace(/\s*\(windows\)|\s*\(pc\)|\s*\(mac\)|\s*\(ps4\)|\s*\(ps5\)/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Checks if a title explicitly denotes a remake or remaster.
 */
export function isRemakeOrRemaster(title?: string): boolean {
  if (!title) return false;
  return /\b(remake|remaster|remastered|re-master|re-mastered)\b/i.test(title);
}

/**
 * Conservatively checks whether game B is a redundant duplicate edition of game A.
 * Guaranteed NOT to merge:
 * - Remakes vs originals
 * - Remasters vs originals
 * - Games separated by more than 2 years of release distance
 * - Games with different developers
 */
export function areDuplicateEditions(
  a: { title: string; releaseDate?: Date | null; developer?: string | null },
  b: { title: string; releaseDate?: Date | null; developer?: string | null },
): boolean {
  // Never merge if either is a remake or remaster
  if (isRemakeOrRemaster(a.title) !== isRemakeOrRemaster(b.title)) {
    return false;
  }
  if (isRemakeOrRemaster(a.title) && isRemakeOrRemaster(b.title)) {
    // Both are remakes/remasters; don't merge without exact title match
    return false;
  }

  const canonA = canonicalGameTitle(a.title);
  const canonB = canonicalGameTitle(b.title);
  if (!canonA || !canonB || canonA !== canonB) {
    return false;
  }

  // If release dates are available and separated by > 2 years (730 days), keep them separate
  if (a.releaseDate && b.releaseDate) {
    const diffMs = Math.abs(a.releaseDate.getTime() - b.releaseDate.getTime());
    const twoYearsMs = 730 * 24 * 60 * 60 * 1000;
    if (diffMs > twoYearsMs) {
      return false;
    }
  }

  // If both developers are specified and differ, keep them separate
  if (a.developer && b.developer) {
    const devA = a.developer.trim().toLowerCase();
    const devB = b.developer.trim().toLowerCase();
    if (devA && devB && devA !== devB) {
      return false;
    }
  }

  return true;
}

/**
 * IGDB Game Category / game_type semantics:
 * 0: Main Game
 * 1: DLC
 * 2: Expansion
 * 3: Bundle
 * 4: Standalone Expansion
 * 5: Mod
 * 6: Episode
 * 7: Season
 * 8: Remake
 * 9: Remaster
 * 10: Expanded Game (excluded from feed discovery)
 * 11: Port
 * 12: Fork
 * 13: Pack
 * 14: Update
 */
export const ELIGIBLE_IGDB_GAME_TYPES = [0, 8, 9] as const;

/**
 * Calculates Bayesian adjusted rating:
 * Radj = (v / (v + m)) * R + (m / (v + m)) * C
 *
 * where:
 * - v: review / rating count
 * - R: raw rating (0–100 scale)
 * - m: minVotesConfidence threshold (default: 30)
 * - C: catalogPriorMean (default: 75)
 *
 * Mathematical properties:
 * - v = 0: Radj = C (prior mean)
 * - v << m: Radj pulled towards C
 * - v = m: Radj is exactly the arithmetic mean of R and C: (R + C) / 2
 * - v >> m: Radj converges asymptotically to R
 */
export function calculateBayesianRating(
  R: number,
  v: number,
  m: number = DISCOVERY_SCORING_CONFIG.bayesian.confidenceThreshold,
  C: number = DISCOVERY_SCORING_CONFIG.bayesian.baselineRating,
): number {
  if (v <= 0) return C;
  return (v / (v + m)) * R + (m / (v + m)) * C;
}

/**
 * Calculates a deterministic Discovery Score (0–100) for candidate games.
 */
export function calculateDiscoveryScore(
  candidate: FeedCandidateInput,
  now = new Date(),
): {
  score: number;
  breakdown: {
    qualityPoints: number;
    freshnessPoints: number;
    discoveryPoints: number;
    metadataPoints: number;
    adjustedRating: number;
  };
} {
  const { bayesian, freshness, discovery, metadata, weights } = DISCOVERY_SCORING_CONFIG;

  // 1. Bayesian Rating Calculation. Prefer the IGDB aggregate pair when both
  // values are valid, then the user-rating pair. A rating without a real count
  // has unknown confidence (v=0); it must not be presented as invented votes.
  const validPair = (rating: number | null | undefined, count: number | null | undefined) =>
    rating !== undefined &&
    rating !== null &&
    Number.isFinite(rating) &&
    count !== undefined &&
    count !== null &&
    Number.isSafeInteger(count) &&
    count >= 0;
  const selectedRating = validPair(candidate.totalRating, candidate.totalRatingCount)
    ? { rating: candidate.totalRating!, count: candidate.totalRatingCount! }
    : validPair(candidate.rating, candidate.ratingCount)
      ? { rating: candidate.rating!, count: candidate.ratingCount! }
      : null;
  const rawRating = selectedRating
    ? selectedRating.rating > 10
      ? selectedRating.rating
      : selectedRating.rating * 10
    : bayesian.defaultRatingIfMissing;
  const v = selectedRating?.count ?? 0;

  const m = bayesian.confidenceThreshold;
  const C = bayesian.baselineRating;
  const adjustedRating = calculateBayesianRating(rawRating, v, m, C);

  // Quality points (0–50)
  const qualityPoints = (adjustedRating / 100) * (weights.quality * 100);

  // 2. Freshness & Age Curve (0–25)
  let rawFreshnessPoints: number = freshness.minFreshnessPoints;
  if (candidate.releaseDate) {
    const ageYears = Math.max(
      0,
      (now.getTime() - candidate.releaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );

    if (ageYears <= freshness.fullBonusYears) {
      rawFreshnessPoints = weights.freshness * 100; // 25 pts
    } else if (ageYears <= 5) {
      rawFreshnessPoints = Math.max(
        17.5,
        weights.freshness * 100 - (ageYears - freshness.fullBonusYears) * freshness.decayPerYearRecent,
      );
    } else if (ageYears <= 10) {
      rawFreshnessPoints = Math.max(
        10,
        17.5 - (ageYears - 5) * freshness.decayPerYearMedium,
      );
    } else {
      // Older than 10 years
      if (adjustedRating >= freshness.classicMinRating) {
        // High quality classic floor
        rawFreshnessPoints = freshness.classicFloorPoints;
      } else {
        rawFreshnessPoints = Math.max(
          freshness.minFreshnessPoints,
          freshness.classicFloorPoints - (ageYears - 10) * freshness.decayPerYearOld,
        );
      }
    }
  } else {
    rawFreshnessPoints = 12.5; // neutral middle if release date unknown
  }

  // Confidence factor for freshness: games with low vote evidence (< minConfidenceForFullFreshness)
  // have their freshness moderated so that an unvetted release doesn't overwhelm proven titles.
  const freshnessConfidenceFactor = Math.min(
    1,
    Math.max(
      freshness.minFreshnessConfidenceFactor,
      v / freshness.minConfidenceForFullFreshness,
    ),
  );
  const freshnessPoints = rawFreshnessPoints * freshnessConfidenceFactor;

  // 3. Discovery & Hidden Gem Bonus (0–15)
  let discoveryPoints: number = discovery.unprovenBonus;
  if (adjustedRating >= discovery.minRatingForGem) {
    if (v < discovery.minReviewsForGemRamp) {
      // Very low reviews (< 30): unproven, modest baseline
      discoveryPoints = discovery.unprovenBonus;
    } else if (v <= discovery.fullReviewsForGem) {
      // Smooth linear ramp between 30 and 100 reviews (5 to 12 points)
      const progress =
        (v - discovery.minReviewsForGemRamp) /
        (discovery.fullReviewsForGem - discovery.minReviewsForGemRamp);
      discoveryPoints =
        discovery.gemMinBonus + progress * (discovery.gemMaxBonus - discovery.gemMinBonus);
    } else if (v <= discovery.maxReviewsForGem) {
      // Verified sweet spot for legitimate hidden gems (100–1200 reviews)
      discoveryPoints = discovery.gemMaxBonus;
    } else if (v <= discovery.mainstreamReviewThreshold) {
      // Well-known quality title (1200–5000 reviews)
      discoveryPoints = discovery.moderatePopularityBonus;
    } else {
      // Hyper-popular AAA (> 5000 reviews)
      discoveryPoints = discovery.mainstreamBonus;
    }
  }

  // 4. Metadata & Media Points (up to 10, or negative penalties)
  let metadataPoints: number = 0;
  const hasDirect = candidate.trailerDetails?.some((t) => t.provider === 'DIRECT');
  const validYoutube = candidate.trailerDetails?.some(
    (t) => t.provider === 'YOUTUBE' && t.videoId && !isDisqualifiedTrailer(t.videoId),
  );
  const steamTrailer = candidate.trailerDetails?.some((t) => t.provider === 'STEAM');

  if (hasDirect) {
    metadataPoints += metadata.directTrailerBonus;
  } else if (validYoutube) {
    metadataPoints += metadata.youtubeTrailerBonus;
  } else if (steamTrailer) {
    metadataPoints += metadata.steamTrailerBonus;
  } else {
    // No trailer: strong penalty, but not an absolute rejection
    metadataPoints += metadata.noTrailerPenalty;
  }

  // Rich metadata bonus
  if (candidate.coverUrl && candidate.description && candidate.description.length > 30) {
    metadataPoints += metadata.richMetadataBonus;
  }

  const rawTotal = qualityPoints + freshnessPoints + discoveryPoints + metadataPoints;
  const finalScore = Math.max(1, Math.min(100, Math.round(rawTotal)));

  return {
    score: finalScore,
    breakdown: {
      qualityPoints: Number(qualityPoints.toFixed(2)),
      freshnessPoints: Number(freshnessPoints.toFixed(2)),
      discoveryPoints: Number(discoveryPoints.toFixed(2)),
      metadataPoints: Number(metadataPoints.toFixed(2)),
      adjustedRating: Number(adjustedRating.toFixed(2)),
    },
  };
}

/**
 * Applies a lightweight, deterministic diversity re-ranking to a scored feed list.
 * Ensures the feed doesn't bunch 3+ consecutive games with the same primary genre
 * or the same exact release year, while keeping overall top quality intact.
 */
export function applyFeedDiversity<T extends FeedCandidateInput & { discoveryScore: number }>(
  candidates: T[],
  limit: number,
): T[] {
  if (candidates.length <= 2) return candidates.slice(0, limit);

  const result: T[] = [];
  const pool = [...candidates];

  while (result.length < limit && pool.length > 0) {
    let pickIndex = 0;

    if (result.length >= 2) {
      const prev1 = result[result.length - 1];
      const prev2 = result[result.length - 2];

      const prev1Genre = prev1.genres?.[0]?.toLowerCase();
      const prev2Genre = prev2.genres?.[0]?.toLowerCase();
      const sameGenreStreak = prev1Genre && prev2Genre && prev1Genre === prev2Genre;

      const prev1Year = prev1.releaseDate?.getFullYear();
      const prev2Year = prev2.releaseDate?.getFullYear();
      const sameYearStreak = prev1Year && prev2Year && prev1Year === prev2Year;

      if (sameGenreStreak || sameYearStreak) {
        // Look ahead for the next best candidate that breaks the streak (within top 5 in pool)
        const lookAhead = Math.min(pool.length, 5);
        for (let i = 1; i < lookAhead; i++) {
          const c = pool[i];
          const cGenre = c.genres?.[0]?.toLowerCase();
          const cYear = c.releaseDate?.getFullYear();

          const breaksGenre = !sameGenreStreak || cGenre !== prev1Genre;
          const breaksYear = !sameYearStreak || cYear !== prev1Year;

          if (breaksGenre && breaksYear) {
            pickIndex = i;
            break;
          }
        }
      }
    }

    result.push(pool.splice(pickIndex, 1)[0]);
  }

  return result;
}
