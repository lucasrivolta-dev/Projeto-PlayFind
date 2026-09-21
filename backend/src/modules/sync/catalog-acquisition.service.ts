import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BAND_CONFIGS,
  GENRE_CLUSTERS,
  EXPOSURE_BANDS,
  buildSyncQuery,
  type ExposureBand,
  type GenreCluster,
} from '../integrations/igdb/igdb-query.js';
import {
  isDisqualifiedTrailer,
  isEligibleForCatalog,
} from '../games/game-eligibility.js';
import {
  steamIdentity,
  companyMetadata,
  supportedPlatforms,
  dedupeCandidate,
  type Identity,
  type DedupeStatus,
  type MetadataStatus,
} from './catalog-hygiene.service.js';
import type { GameSyncService } from './game-sync.service.js';
import type { NormalizedGame } from '../games/normalized-game.js';
import { mapIgdbGame } from '../integrations/igdb/igdb.mapper.js';
import type { SteamReviewSummary } from '../integrations/steam/steam.types.js';

export const STEAM_QUALITY_GATE_CONFIG = {
  minReviewCount: 100,
  minPositivePercentage: 80.0,
} as const;

export type SteamEvidenceStatus =
  | 'STEAM_VERIFIED'
  | 'STEAM_EVIDENCE_UNAVAILABLE'
  | 'NON_STEAM';

export type TrailerStatus = 'PLAYABLE_TRAILER' | 'VIDEO_PRESENT_BUT_DISQUALIFIED' | 'NO_VIDEO';
export type AcquisitionBucket = 'ALREADY_EXISTS' | 'AMBIGUOUS' | 'REJECTED' | 'READY';
export type AcquisitionRejectionReason =
  | 'unsupportedPlatform'
  | 'invalidMetadata'
  | 'ineligible'
  | 'insufficientQuality'
  | 'noTrailer'
  | 'insufficientSteamReviews'
  | 'poorSteamRating'
  | 'steamEvidenceUnavailable';

export interface EvaluatedCandidate {
  igdbId: number;
  name: string;
  slug: string;
  releaseYear: number | null;
  releaseDate: Date | null;
  genres: string[];
  themes: string[];
  platforms: string[];
  studio: string | null;
  publisher: string | null;
  metadataStatus: MetadataStatus;
  platformStatus: 'SUPPORTED' | 'UNSUPPORTED_PLATFORM';
  effectiveRating: number;
  effectiveVotes: number;
  metricSource: 'TOTAL_RATING' | 'USER_RATING';
  adjustedRating: number;
  exposureBand: ExposureBand;
  clusters: GenreCluster[];
  primaryCluster: GenreCluster;
  trailerStatus: TrailerStatus;
  primaryVideoId?: string;
  primaryTrailerUrl?: string;
  disqualifiedVideoCount: number;
  validVideoCount: number;
  steamAppId?: number;
  steamAppIds: number[];
  steamReviewCount?: number;
  steamPositivePercentage?: number;
  steamQualityGatePassed?: boolean;
  steamEvidenceStatus?: SteamEvidenceStatus;
  dedupeStatus: DedupeStatus;
  dedupeReason?: string;
  passedQualityGate: boolean;
  qualityGateFailReasons: string[];
  finalEligible: boolean;
  bucket: AcquisitionBucket;
  rejectionReason?: AcquisitionRejectionReason;
  raw?: any;
}

export interface RejectionReasonCounts {
  unsupportedPlatform: number;
  invalidMetadata: number;
  ineligible: number;
  insufficientQuality: number;
  noTrailer: number;
  insufficientSteamReviews: number;
  poorSteamRating: number;
  steamEvidenceUnavailable: number;
}

export interface ClusterFunnelStats {
  found: number;
  passedGate: number;
  alreadyExists: number;
  isNew: number;
  playableTrailer: number;
  finalEligible: number;
}

export interface CatalogAcquisitionManifest {
  totals: {
    discovered: number;
    alreadyExists: number;
    ambiguous: number;
    rejected: number;
    ready: number;
  };
  rejectionReasons: RejectionReasonCounts;
  buckets: {
    alreadyExists: EvaluatedCandidate[];
    ambiguous: EvaluatedCandidate[];
    rejected: EvaluatedCandidate[];
    ready: EvaluatedCandidate[];
  };
  candidates: EvaluatedCandidate[];
  byBand: Record<ExposureBand, EvaluatedCandidate[]>;
  byCluster: Record<GenreCluster, EvaluatedCandidate[]>;
  funnelByCluster: Record<GenreCluster, ClusterFunnelStats>;
  trailerSummary: {
    playableTrailer: number;
    disqualifiedTrailer: number;
    noTrailer: number;
  };
  gateSummary: {
    passedQualityGate: number;
    failedQualityGate: number;
    unsupportedPlatform: number;
    invalidMetadata: number;
    steamQualityGatePassed?: number;
    steamQualityGateFailed?: number;
    steamEvidenceUnavailable?: number;
    nonSteam?: number;
  };
  evaluated: EvaluatedCandidate[];
}

export interface IgdbSearchClient {
  search(query: string): Promise<any[]>;
}

export type CandidateApplyStatus =
  | 'INSERTED'
  | 'SKIPPED_ALREADY_EXISTS'
  | 'SKIPPED_AMBIGUOUS'
  | 'FAILED';

export interface CandidateApplyResult {
  igdbId: number;
  name: string;
  slug: string;
  status: CandidateApplyStatus;
  reason?: string;
  error?: string;
}

export interface CatalogAcquisitionApplyResult {
  requested: number;
  processed: number;
  inserted: number;
  skippedAlreadyExists: number;
  skippedAmbiguous: number;
  failed: number;
  results: CandidateApplyResult[];
}

export type SteamReviewProvider = (
  appId: number,
) => Promise<SteamReviewSummary | undefined> | SteamReviewSummary | undefined;

export interface CatalogAcquisitionApplyOptions {
  limit: number;
  existingCatalog?: Identity[];
  loadExistingCatalog?: () => Promise<Identity[]>;
  gameSyncService?: GameSyncService;
  steamEnricher?: (game: NormalizedGame) => Promise<NormalizedGame | undefined>;
  candidates?: EvaluatedCandidate[];
  steamReviews?: Map<number, SteamReviewSummary> | Record<number, SteamReviewSummary>;
  steamReviewProvider?: SteamReviewProvider;
}

export interface CatalogAcquisitionDependencies {
  igdbClient?: IgdbSearchClient;
  steamClient?: { reviews(appId: number): Promise<SteamReviewSummary | undefined> };
  steamReviewProvider?: SteamReviewProvider;
  loadExistingCatalog?: () => Promise<Identity[]>;
  gameSyncService?: GameSyncService;
  steamEnricher?: (game: NormalizedGame) => Promise<NormalizedGame | undefined>;
  log?: (message: string) => void;
}

export interface CatalogAcquisitionPlanOptions {
  snapshotPath?: string;
  snapshot?: {
    raw: any[];
    queries?: Array<{ cluster: string; band: string; query?: string; ids: number[] }>;
  };
  rawCandidates?: any[];
  existingCatalog?: Identity[];
  referenceTime?: Date;
  limitPerBand?: number;
  throttleMs?: number;
  clusters?: GenreCluster[];
  bands?: ExposureBand[];
  steamReviews?: Map<number, SteamReviewSummary> | Record<number, SteamReviewSummary>;
  steamReviewProvider?: SteamReviewProvider;
  steamReviewsCachePath?: string;
}

/**
 * Maps an EvaluatedCandidate to a NormalizedGame suitable for GameSyncService.
 * Uses raw IGDB data if available, or constructs a typed normalized representation.
 */
export function candidateToNormalizedGame(candidate: EvaluatedCandidate): NormalizedGame {
  if (candidate.raw) {
    return mapIgdbGame(candidate.raw);
  }

  const trailerDetails = candidate.primaryVideoId
    ? [
        {
          provider: 'YOUTUBE' as const,
          videoId: candidate.primaryVideoId,
          url:
            candidate.primaryTrailerUrl ??
            `https://www.youtube.com/watch?v=${encodeURIComponent(candidate.primaryVideoId)}`,
          isOfficial: true,
        },
      ]
    : [];

  return {
    title: candidate.name,
    slug: candidate.slug,
    description: candidate.name,
    rating:
      candidate.effectiveRating > 10
        ? candidate.effectiveRating / 10
        : candidate.effectiveRating,
    ratingCount: candidate.effectiveVotes,
    totalRating:
      candidate.effectiveRating > 10
        ? candidate.effectiveRating / 10
        : candidate.effectiveRating,
    totalRatingCount: candidate.effectiveVotes,
    igdbId: candidate.igdbId,
    steamAppId: candidate.steamAppId,
    ...(candidate.steamAppIds?.length ? { steamAppIds: candidate.steamAppIds } : {}),
    screenshots: [],
    trailers: trailerDetails.map((t) => t.url),
    trailerDetails,
    genres: candidate.genres,
    platforms: candidate.platforms as any,
    releaseDate: candidate.releaseDate ?? undefined,
    developer: candidate.studio ?? undefined,
    publisher: candidate.publisher ?? undefined,
  };
}

export class CatalogAcquisitionService {
  constructor(private readonly dependencies: CatalogAcquisitionDependencies = {}) {}

  /**
   * Plans catalog auto acquisition:
   * 1. Discovers or loads raw candidates
   * 2. Evaluates eligibility, hygiene, platforms, and trailers
   * 3. Partitions into mutually exclusive disjoint buckets: ALREADY_EXISTS, AMBIGUOUS, REJECTED, READY
   * 4. Ranks READY candidates deterministically
   * 5. Returns a structured acquisition manifest
   */
  async plan(options: CatalogAcquisitionPlanOptions = {}): Promise<CatalogAcquisitionManifest> {
    const referenceTime = options.referenceTime ?? new Date();

    // 1. Resolve existing catalog identities
    const existingCatalog: Identity[] =
      options.existingCatalog ??
      (this.dependencies.loadExistingCatalog
        ? await this.dependencies.loadExistingCatalog()
        : []);

    // 2. Resolve raw pool
    const rawPool = await this.resolveRawPool(options, referenceTime);

    // 3. Resolve Steam review lookup map
    let steamReviewMap = new Map<number, SteamReviewSummary>();
    if (options.steamReviews instanceof Map) {
      steamReviewMap = options.steamReviews;
    } else if (options.steamReviews && typeof options.steamReviews === 'object') {
      for (const [k, v] of Object.entries(options.steamReviews)) {
        steamReviewMap.set(Number(k), v as SteamReviewSummary);
      }
    } else {
      const candidateCachePaths: string[] = [];
      if (options.steamReviewsCachePath) {
        candidateCachePaths.push(options.steamReviewsCachePath);
      }
      if (options.snapshotPath) {
        const dir = path.dirname(options.snapshotPath);
        candidateCachePaths.push(path.resolve(dir, 'steam-reviews-cache.json'));
        candidateCachePaths.push(
          path.resolve(process.cwd(), 'reports/catalog-acquisition-v1/steam-reviews-cache.json'),
        );
        candidateCachePaths.push(
          path.resolve(process.cwd(), 'backend/reports/catalog-acquisition-v1/steam-reviews-cache.json'),
        );
      }
      for (const p of candidateCachePaths) {
        try {
          const content = await readFile(p, 'utf8');
          const parsed = JSON.parse(content);
          for (const [k, v] of Object.entries(parsed)) {
            steamReviewMap.set(Number(k), v as SteamReviewSummary);
          }
          break;
        } catch {
          // Continue to next potential cache location
        }
      }
    }

    // 4. Evaluate each unique candidate
    const evaluatedList: EvaluatedCandidate[] = [];
    const buckets: CatalogAcquisitionManifest['buckets'] = {
      alreadyExists: [],
      ambiguous: [],
      rejected: [],
      ready: [],
    };
    const rejectionReasons: RejectionReasonCounts = {
      unsupportedPlatform: 0,
      invalidMetadata: 0,
      ineligible: 0,
      insufficientQuality: 0,
      noTrailer: 0,
      insufficientSteamReviews: 0,
      poorSteamRating: 0,
      steamEvidenceUnavailable: 0,
    };

    for (const [, { raw, foundClusters, foundBands }] of rawPool) {
      const { steamAppId, steamAppIds } = steamIdentity(raw.external_games);
      const allAppIds = [
        ...new Set([
          ...(steamAppId ? [steamAppId] : []),
          ...(steamAppIds ?? []),
        ]),
      ];
      const hasSteam = allAppIds.length > 0;

      let steamReview: SteamReviewSummary | undefined =
        raw.steamReview ?? raw.steam_review;
      let resolvedSteamAppId: number | undefined = steamAppId;

      if (!steamReview && hasSteam) {
        const candidateReviews: Array<{ appId: number; review: SteamReviewSummary }> = [];

        for (const appId of allAppIds) {
          let rev: SteamReviewSummary | undefined;
          if (steamReviewMap.has(appId)) {
            rev = steamReviewMap.get(appId);
          } else if (options.steamReviewProvider) {
            try {
              rev = await options.steamReviewProvider(appId);
            } catch {
              rev = undefined;
            }
          } else if (this.dependencies.steamReviewProvider) {
            try {
              rev = await this.dependencies.steamReviewProvider(appId);
            } catch {
              rev = undefined;
            }
          } else if (this.dependencies.steamClient?.reviews) {
            try {
              rev = await this.dependencies.steamClient.reviews(appId);
            } catch {
              rev = undefined;
            }
          }

          if (
            rev &&
            typeof rev.totalReviews === 'number' &&
            Number.isFinite(rev.totalReviews) &&
            rev.totalReviews >= 0
          ) {
            candidateReviews.push({ appId, review: rev });
          }
        }

        if (candidateReviews.length > 0) {
          candidateReviews.sort((a, b) => b.review.totalReviews - a.review.totalReviews);
          steamReview = candidateReviews[0].review;
          resolvedSteamAppId = candidateReviews[0].appId;
        } else {
          steamReview = undefined;
          resolvedSteamAppId = allAppIds[0];
        }
      } else if (steamReview && !resolvedSteamAppId && allAppIds.length > 0) {
        resolvedSteamAppId = allAppIds[0];
      }

      const candidate = this.evaluateCandidate(
        raw,
        foundClusters,
        foundBands,
        existingCatalog,
        referenceTime,
        steamReview,
        resolvedSteamAppId,
      );
      evaluatedList.push(candidate);

      // Disjoint assignment to exactly one bucket
      switch (candidate.bucket) {
        case 'ALREADY_EXISTS':
          buckets.alreadyExists.push(candidate);
          break;
        case 'AMBIGUOUS':
          buckets.ambiguous.push(candidate);
          break;
        case 'READY':
          buckets.ready.push(candidate);
          break;
        case 'REJECTED':
          buckets.rejected.push(candidate);
          if (candidate.rejectionReason) {
            rejectionReasons[candidate.rejectionReason]++;
          }
          break;
      }
    }

    // Mathematical invariant verification
    const totalDiscovered = evaluatedList.length;
    const bucketSum =
      buckets.alreadyExists.length +
      buckets.ambiguous.length +
      buckets.rejected.length +
      buckets.ready.length;
    assert.equal(
      bucketSum,
      totalDiscovered,
      `Bucket sum (${bucketSum}) must equal total discovered (${totalDiscovered})`,
    );

    const totalRejectionCount = Object.values(rejectionReasons).reduce((sum, n) => sum + n, 0);
    assert.equal(
      totalRejectionCount,
      buckets.rejected.length,
      `Sum of rejection reason counts (${totalRejectionCount}) must equal total rejected candidates (${buckets.rejected.length})`,
    );

    // Deterministic ranking of READY candidates
    const readyCandidates = [...buckets.ready].sort(
      (a, b) =>
        b.adjustedRating - a.adjustedRating ||
        b.effectiveVotes - a.effectiveVotes ||
        a.igdbId - b.igdbId,
    );

    // Grouping by band and cluster for READY candidates
    const byBand: Record<ExposureBand, EvaluatedCandidate[]> = {
      emerging: [],
      discovery: [],
      mid_tail: [],
      older_gems: [],
    };
    for (const c of readyCandidates) {
      byBand[c.exposureBand].push(c);
    }

    const byCluster: Record<GenreCluster, EvaluatedCandidate[]> = {
      strategy_tactical: [],
      simulation: [],
      racing: [],
      horror: [],
      puzzle_point_click: [],
      niche_rpg: [],
      platform_action_indie: [],
    };
    for (const c of readyCandidates) {
      byCluster[c.primaryCluster].push(c);
    }

    // Cluster funnel stats across all evaluated candidates
    const funnelByCluster: Record<GenreCluster, ClusterFunnelStats> = {
      strategy_tactical: { found: 0, passedGate: 0, alreadyExists: 0, isNew: 0, playableTrailer: 0, finalEligible: 0 },
      simulation: { found: 0, passedGate: 0, alreadyExists: 0, isNew: 0, playableTrailer: 0, finalEligible: 0 },
      racing: { found: 0, passedGate: 0, alreadyExists: 0, isNew: 0, playableTrailer: 0, finalEligible: 0 },
      horror: { found: 0, passedGate: 0, alreadyExists: 0, isNew: 0, playableTrailer: 0, finalEligible: 0 },
      puzzle_point_click: { found: 0, passedGate: 0, alreadyExists: 0, isNew: 0, playableTrailer: 0, finalEligible: 0 },
      niche_rpg: { found: 0, passedGate: 0, alreadyExists: 0, isNew: 0, playableTrailer: 0, finalEligible: 0 },
      platform_action_indie: { found: 0, passedGate: 0, alreadyExists: 0, isNew: 0, playableTrailer: 0, finalEligible: 0 },
    };

    for (const c of evaluatedList) {
      for (const cl of c.clusters) {
        const f = funnelByCluster[cl];
        if (!f) continue;
        f.found++;
        if (c.passedQualityGate) f.passedGate++;
        if (c.dedupeStatus === 'ALREADY_EXISTS') f.alreadyExists++;
        if (c.dedupeStatus === 'NEW') f.isNew++;
        if (c.trailerStatus === 'PLAYABLE_TRAILER') f.playableTrailer++;
      }
    }
    for (const c of readyCandidates) {
      for (const cl of c.clusters) {
        const f = funnelByCluster[cl];
        if (f) f.finalEligible++;
      }
    }

    const trailerSummary = {
      playableTrailer: evaluatedList.filter((c) => c.trailerStatus === 'PLAYABLE_TRAILER').length,
      disqualifiedTrailer: evaluatedList.filter(
        (c) => c.trailerStatus === 'VIDEO_PRESENT_BUT_DISQUALIFIED',
      ).length,
      noTrailer: evaluatedList.filter((c) => c.trailerStatus === 'NO_VIDEO').length,
    };

    const gateSummary = {
      passedQualityGate: evaluatedList.filter((c) => c.passedQualityGate).length,
      failedQualityGate: evaluatedList.filter((c) => !c.passedQualityGate).length,
      unsupportedPlatform: evaluatedList.filter((c) => c.platformStatus === 'UNSUPPORTED_PLATFORM').length,
      invalidMetadata: evaluatedList.filter((c) => c.metadataStatus === 'INVALID_METADATA').length,
      steamQualityGatePassed: evaluatedList.filter((c) => c.steamQualityGatePassed === true).length,
      steamQualityGateFailed: evaluatedList.filter((c) => c.steamQualityGatePassed === false).length,
      steamEvidenceUnavailable: evaluatedList.filter((c) => c.steamEvidenceStatus === 'STEAM_EVIDENCE_UNAVAILABLE').length,
      nonSteam: evaluatedList.filter((c) => c.steamEvidenceStatus === 'NON_STEAM').length,
    };

    return {
      totals: {
        discovered: totalDiscovered,
        alreadyExists: buckets.alreadyExists.length,
        ambiguous: buckets.ambiguous.length,
        rejected: buckets.rejected.length,
        ready: buckets.ready.length,
      },
      rejectionReasons,
      buckets,
      candidates: readyCandidates,
      byBand,
      byCluster,
      funnelByCluster,
      trailerSummary,
      gateSummary,
      evaluated: evaluatedList,
    };
  }

  /**
   * Applies controlled ingestion of READY candidates:
   * 1. Requires explicit positive integer limit (fails closed if omitted or invalid)
   * 2. Accepts exclusively candidates from READY bucket
   * 3. Revalidates each candidate against the latest catalog before writing
   * 4. Skips already existing or ambiguous candidates safely
   * 5. Delegates persistence to GameSyncService
   * 6. Isolates single-candidate failures without corrupting other batch candidates
   * 7. Preserves deterministic order and guarantees idempotency
   */
  async apply(
    manifest: CatalogAcquisitionManifest,
    options: CatalogAcquisitionApplyOptions,
  ): Promise<CatalogAcquisitionApplyResult> {
    if (
      !options ||
      typeof options.limit !== 'number' ||
      !Number.isSafeInteger(options.limit) ||
      options.limit <= 0
    ) {
      throw new Error(
        'CatalogAcquisitionService.apply: an explicit positive integer "limit" is required.',
      );
    }

    // Candidate selection: accept strictly READY candidates
    let candidatesToProcess: EvaluatedCandidate[];
    if (options.candidates) {
      for (const c of options.candidates) {
        if (c.bucket !== 'READY' || !c.finalEligible) {
          throw new Error(
            `CatalogAcquisitionService.apply: candidate "${c.name}" (igdbId: ${c.igdbId}) is not in READY bucket (bucket: ${c.bucket}). Only READY candidates can be ingested.`,
          );
        }
      }
      candidatesToProcess = options.candidates.slice(0, options.limit);
    } else {
      for (const c of manifest.candidates) {
        if (c.bucket !== 'READY' || !c.finalEligible) {
          throw new Error(
            `CatalogAcquisitionService.apply: candidate "${c.name}" is not in READY bucket. Only READY candidates can be ingested.`,
          );
        }
      }
      candidatesToProcess = manifest.candidates.slice(0, options.limit);
    }

    const gameSyncService = options.gameSyncService ?? this.dependencies.gameSyncService;
    if (!gameSyncService) {
      throw new Error(
        'CatalogAcquisitionService.apply: GameSyncService must be provided in dependencies or options.',
      );
    }
    const steamEnricher = options.steamEnricher ?? this.dependencies.steamEnricher;

    const loadCatalog = options.loadExistingCatalog ?? this.dependencies.loadExistingCatalog;
    let workingCatalog: Identity[] = options.existingCatalog
      ? [...options.existingCatalog]
      : loadCatalog
        ? await loadCatalog()
        : [];

    const results: CandidateApplyResult[] = [];
    let inserted = 0;
    let skippedAlreadyExists = 0;
    let skippedAmbiguous = 0;
    let failed = 0;

    for (const candidate of candidatesToProcess) {
      // Refresh catalog dynamically if a loader function is supplied and no static catalog was passed
      if (loadCatalog && !options.existingCatalog) {
        try {
          workingCatalog = await loadCatalog();
        } catch {
          // Keep current in-memory workingCatalog if dynamic load fails
        }
      }

      // Revalidation against current catalog immediately before write
      const { dedupeStatus, dedupeReason } = dedupeCandidate(
        {
          igdbId: candidate.igdbId,
          steamAppId: candidate.steamAppId,
          steamAppIds: candidate.steamAppIds,
          name: candidate.name,
          slug: candidate.slug,
        },
        workingCatalog,
      );

      if (dedupeStatus === 'ALREADY_EXISTS') {
        skippedAlreadyExists++;
        results.push({
          igdbId: candidate.igdbId,
          name: candidate.name,
          slug: candidate.slug,
          status: 'SKIPPED_ALREADY_EXISTS',
          reason: dedupeReason,
        });
        continue;
      }

      if (dedupeStatus === 'AMBIGUOUS') {
        skippedAmbiguous++;
        results.push({
          igdbId: candidate.igdbId,
          name: candidate.name,
          slug: candidate.slug,
          status: 'SKIPPED_AMBIGUOUS',
          reason: dedupeReason,
        });
        continue;
      }

      // Candidate is confirmed NEW: check defense-in-depth Steam quality gate
      const isSteam = Boolean(
        candidate.steamAppId || (candidate.steamAppIds && candidate.steamAppIds.length > 0),
      );
      if (isSteam) {
        let reviewCount = candidate.steamReviewCount;
        let positivePercentage = candidate.steamPositivePercentage;
        let qualityPassed = candidate.steamQualityGatePassed;

        if (qualityPassed === undefined) {
          const allAppIds = [
            ...new Set([
              ...(candidate.steamAppId ? [candidate.steamAppId] : []),
              ...(candidate.steamAppIds ?? []),
            ]),
          ];
          let bestReview: SteamReviewSummary | undefined;
          for (const appId of allAppIds) {
            let rev: SteamReviewSummary | undefined;
            if (options.steamReviews instanceof Map) {
              rev = options.steamReviews.get(appId);
            } else if (options.steamReviews && typeof options.steamReviews === 'object') {
              rev = options.steamReviews[appId];
            } else if (options.steamReviewProvider) {
              try {
                rev = await options.steamReviewProvider(appId);
              } catch {
                rev = undefined;
              }
            } else if (this.dependencies.steamReviewProvider) {
              try {
                rev = await this.dependencies.steamReviewProvider(appId);
              } catch {
                rev = undefined;
              }
            } else if (this.dependencies.steamClient?.reviews) {
              try {
                rev = await this.dependencies.steamClient.reviews(appId);
              } catch {
                rev = undefined;
              }
            }
            if (
              rev &&
              typeof rev.totalReviews === 'number' &&
              Number.isFinite(rev.totalReviews) &&
              rev.totalReviews >= 0
            ) {
              if (!bestReview || rev.totalReviews > bestReview.totalReviews) {
                bestReview = rev;
              }
            }
          }
          if (bestReview) {
            reviewCount = bestReview.totalReviews;
            positivePercentage = bestReview.positivePercentage;
            qualityPassed =
              reviewCount >= STEAM_QUALITY_GATE_CONFIG.minReviewCount &&
              positivePercentage >= STEAM_QUALITY_GATE_CONFIG.minPositivePercentage;
          } else {
            qualityPassed = false;
          }
        }

        const failsSteamGate =
          qualityPassed !== true ||
          candidate.steamEvidenceStatus === 'STEAM_EVIDENCE_UNAVAILABLE' ||
          reviewCount === undefined ||
          reviewCount < STEAM_QUALITY_GATE_CONFIG.minReviewCount ||
          positivePercentage === undefined ||
          positivePercentage < STEAM_QUALITY_GATE_CONFIG.minPositivePercentage;

        if (failsSteamGate) {
          failed++;
          results.push({
            igdbId: candidate.igdbId,
            name: candidate.name,
            slug: candidate.slug,
            status: 'FAILED',
            error: `Candidate "${candidate.name}" failed Steam quality gate (reviews: ${reviewCount ?? 'N/A'}, positive: ${positivePercentage ?? 'N/A'}%). Ingestion blocked.`,
          });
          continue;
        }
      }

      // Candidate is confirmed NEW: delegate persistence to GameSyncService
      const normalized = candidateToNormalizedGame(candidate);

      try {
        const syncResult = await gameSyncService.sync([normalized], steamEnricher);
        if (syncResult.rejected && syncResult.rejected > 0) {
          failed++;
          results.push({
            igdbId: candidate.igdbId,
            name: candidate.name,
            slug: candidate.slug,
            status: 'FAILED',
            error: `GameSync rejected: ${JSON.stringify(syncResult.rejections)}`,
          });
        } else {
          inserted++;
          results.push({
            igdbId: candidate.igdbId,
            name: candidate.name,
            slug: candidate.slug,
            status: 'INSERTED',
          });
          // Update working catalog so subsequent items in the batch see the newly added game
          workingCatalog.push({
            igdbId: candidate.igdbId,
            steamAppId: candidate.steamAppId,
            steamAppIds: candidate.steamAppIds,
            title: candidate.name,
            name: candidate.name,
            slug: candidate.slug,
          });
        }
      } catch (err: any) {
        failed++;
        results.push({
          igdbId: candidate.igdbId,
          name: candidate.name,
          slug: candidate.slug,
          status: 'FAILED',
          error: err.message,
        });
      }
    }

    const totalProcessed = results.length;
    assert.equal(
      inserted + skippedAlreadyExists + skippedAmbiguous + failed,
      totalProcessed,
      'Sum of apply statuses must equal processed candidate count',
    );

    return {
      requested: options.limit,
      processed: totalProcessed,
      inserted,
      skippedAlreadyExists,
      skippedAmbiguous,
      failed,
      results,
    };
  }

  /**
   * Resolves raw candidates from snapshot path, snapshot object, raw candidate list,
   * or by performing IGDB discovery queries.
   * Fails closed: any query failure aborts immediately without partial results.
   */
  private async resolveRawPool(
    options: CatalogAcquisitionPlanOptions,
    referenceTime: Date,
  ): Promise<Map<number, { raw: any; foundClusters: Set<GenreCluster>; foundBands: Set<ExposureBand> }>> {
    let rawList: any[] = [];
    const queryMeta: Array<{ cluster: string; band: string; ids: number[] }> = [];

    if (options.snapshotPath) {
      const parsed = JSON.parse(await readFile(options.snapshotPath, 'utf8'));
      assert(Array.isArray(parsed.raw), 'Snapshot missing raw game array');
      rawList = parsed.raw;
      if (Array.isArray(parsed.queries)) {
        queryMeta.push(...parsed.queries);
      }
    } else if (options.snapshot) {
      assert(Array.isArray(options.snapshot.raw), 'Snapshot object missing raw array');
      rawList = options.snapshot.raw;
      if (Array.isArray(options.snapshot.queries)) {
        queryMeta.push(...options.snapshot.queries);
      }
    } else if (options.rawCandidates) {
      assert(Array.isArray(options.rawCandidates), 'rawCandidates must be an array');
      rawList = options.rawCandidates;
    } else {
      // Live discovery queries via IGDB Client
      if (!this.dependencies.igdbClient) {
        throw new Error(
          'CatalogAcquisitionService: Neither snapshot, rawCandidates, nor igdbClient was provided.',
        );
      }

      const client = this.dependencies.igdbClient;
      const clusters = options.clusters ?? GENRE_CLUSTERS;
      const bands = options.bands ?? EXPOSURE_BANDS;
      const limit = options.limitPerBand ?? 20;
      const throttleMs = options.throttleMs ?? 280;
      const rawMap = new Map<number, any>();

      for (const cluster of clusters) {
        for (const band of bands) {
          const query = buildSyncQuery(
            { mode: 'discover', band, genre: cluster, limit, dryRun: true },
            referenceTime,
          );

          let result: any[];
          try {
            const rawResult = await client.search(query);
            if (!Array.isArray(rawResult)) {
              throw new Error(
                `IGDB discovery returned non-array result for cluster "${cluster}", band "${band}".`,
              );
            }
            result = rawResult;
          } catch (err: any) {
            // Fail closed: an incomplete discovery run must never produce a partial manifest.
            throw new Error(
              `Catalog acquisition failed closed on cluster "${cluster}", band "${band}": ${err.message}`,
            );
          }

          const ids: number[] = [];
          for (const item of result) {
            assert(
              Number.isSafeInteger(item.id) &&
                item.id > 0 &&
                typeof item.name === 'string' &&
                item.name.trim(),
              `Invalid IGDB game identity in response for cluster "${cluster}", band "${band}".`,
            );
            ids.push(item.id);
            if (!rawMap.has(item.id)) {
              rawMap.set(item.id, item);
            }
          }

          queryMeta.push({ cluster, band, ids });

          if (throttleMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, throttleMs));
          }
        }
      }

      rawList = [...rawMap.values()];
    }

    const pool = new Map<
      number,
      { raw: any; foundClusters: Set<GenreCluster>; foundBands: Set<ExposureBand> }
    >();

    for (const raw of rawList) {
      assert(
        raw && Number.isSafeInteger(raw.id) && raw.id > 0,
        'Each raw candidate must have a positive integer id',
      );
      const foundClusters = new Set<GenreCluster>(
        queryMeta
          .filter((q) => q.ids.includes(raw.id))
          .map((q) => q.cluster as GenreCluster),
      );
      const foundBands = new Set<ExposureBand>(
        queryMeta
          .filter((q) => q.ids.includes(raw.id))
          .map((q) => q.band as ExposureBand),
      );
      pool.set(raw.id, { raw, foundClusters, foundBands });
    }

    return pool;
  }

  /**
   * Evaluates a single candidate through:
   * 1. Metrics and Bayesian rating
   * 2. Exposure band determination
   * 3. Catalog eligibility (DLCs, mods, expansions, etc.)
   * 4. Platform support gate
   * 5. Company metadata gate
   * 6. YouTube trailer gate
   * 7. Deduplication against existing catalog
   * 8. Disjoint bucket classification and structured rejection reason
   */
  public evaluateCandidate(
    raw: any,
    foundClusters: Set<GenreCluster>,
    foundBands: Set<ExposureBand>,
    existingCatalog: Identity[],
    referenceTime: Date,
    steamReview?: SteamReviewSummary,
    resolvedSteamAppId?: number,
  ): EvaluatedCandidate {
    const name: string = raw.name ?? '';
    const slug: string = raw.slug ?? '';
    const igdbId: number = raw.id;

    // Metrics resolution
    const hasTotalRating =
      raw.total_rating !== undefined &&
      raw.total_rating !== null &&
      raw.total_rating_count !== undefined &&
      raw.total_rating_count !== null &&
      raw.total_rating_count >= 0;

    const hasUserRating =
      raw.rating !== undefined &&
      raw.rating !== null &&
      raw.rating_count !== undefined &&
      raw.rating_count !== null &&
      raw.rating_count >= 0;

    let effectiveRating = 0;
    let effectiveVotes = 0;
    let metricSource: 'TOTAL_RATING' | 'USER_RATING' = 'TOTAL_RATING';

    if (hasTotalRating) {
      effectiveRating = raw.total_rating;
      effectiveVotes = raw.total_rating_count;
      metricSource = 'TOTAL_RATING';
    } else if (hasUserRating) {
      effectiveRating = raw.rating;
      effectiveVotes = raw.rating_count;
      metricSource = 'USER_RATING';
    }

    const releaseDate = raw.first_release_date ? new Date(raw.first_release_date * 1000) : null;
    const releaseYear = releaseDate ? releaseDate.getUTCFullYear() : null;

    // Determine exposure band based on vote volume and age
    const nowYears = referenceTime.getUTCFullYear();
    const ageYears = releaseYear ? nowYears - releaseYear : 0;

    let exposureBand: ExposureBand = 'emerging';
    if (ageYears >= 6 && ageYears <= 12 && effectiveVotes >= 20 && effectiveRating >= 80) {
      exposureBand = 'older_gems';
    } else if (effectiveVotes >= 500 && effectiveVotes <= 1500) {
      exposureBand = 'mid_tail';
    } else if (effectiveVotes >= 100 && effectiveVotes <= 499) {
      exposureBand = 'discovery';
    } else if (effectiveVotes >= 10 && effectiveVotes <= 99) {
      exposureBand = 'emerging';
    } else if (effectiveVotes > 1500) {
      exposureBand = 'mid_tail';
    } else {
      exposureBand = 'emerging';
    }

    // Prioritize discovered band if candidate votes fall within configured bounds
    for (const b of foundBands) {
      const cfg = BAND_CONFIGS[b];
      if (effectiveVotes >= cfg.minVotes && effectiveVotes <= cfg.maxVotes) {
        exposureBand = b;
        break;
      }
    }

    // Bayesian adjusted rating
    const bandCfg = BAND_CONFIGS[exposureBand];
    const M = bandCfg.confidenceM;
    const C = bandCfg.baselineC;
    const adjustedRating =
      (effectiveVotes / (effectiveVotes + M)) * effectiveRating + (M / (effectiveVotes + M)) * C;

    // Quality gate validation
    const qualityGateFailReasons: string[] = [];
    if (effectiveVotes < 10) {
      qualityGateFailReasons.push(`Votos insuficientes (<10: ${effectiveVotes})`);
    }
    if (effectiveRating < bandCfg.minRating) {
      qualityGateFailReasons.push(
        `Rating inferior ao piso da faixa ${exposureBand} (${effectiveRating.toFixed(1)} < ${bandCfg.minRating})`,
      );
    }
    if (adjustedRating < 72.0) {
      qualityGateFailReasons.push(
        `Bayesian adjustedRating muito baixo (${adjustedRating.toFixed(1)} < 72.0)`,
      );
    }

    // Catalog eligibility check (excludes DLCs, mods, expansions, etc.)
    const eligibility = isEligibleForCatalog({
      title: name,
      slug,
      gameType: raw.game_type,
      rating: effectiveRating,
      ratingCount: effectiveVotes,
      totalRating: effectiveRating,
      totalRatingCount: effectiveVotes,
      releaseDate,
    });
    if (!eligibility.eligible) {
      qualityGateFailReasons.push(
        `Catálogo inelegível: ${eligibility.reason} (${eligibility.details})`,
      );
    }

    const passedQualityGate = qualityGateFailReasons.length === 0;

    // Metadata & platforms
    const genres = (raw.genres ?? []).map((g: any) => g.name);
    const themes = (raw.themes ?? []).map((t: any) => t.name);
    const platforms = (raw.platforms ?? []).map((p: any) => p.name);

    const metadata = companyMetadata(raw.involved_companies);
    const studio = metadata.developer;
    const publisher = metadata.publisher;
    const metadataStatus = metadata.metadataStatus;
    const platformStatus = supportedPlatforms(platforms).length
      ? 'SUPPORTED'
      : 'UNSUPPORTED_PLATFORM';

    // Steam identities from external_games
    const { steamAppId, steamAppIds } = steamIdentity(raw.external_games);
    const effectiveSteamAppId = steamAppId ?? resolvedSteamAppId ?? (steamAppIds?.length ? steamAppIds[0] : undefined);
    const hasSteam = Boolean(effectiveSteamAppId || (steamAppIds && steamAppIds.length > 0));

    // Video & trailer evaluation
    const rawVideos = (raw.videos ?? []) as Array<{ video_id?: string; name?: string }>;
    let validVideoCount = 0;
    let disqualifiedVideoCount = 0;
    let primaryVideoId: string | undefined;

    for (const v of rawVideos) {
      const vid = v.video_id?.trim();
      if (!vid || !/^[A-Za-z0-9_-]{11}$/.test(vid)) continue;
      const vname = v.name ?? '';
      if (isDisqualifiedTrailer(vname)) {
        disqualifiedVideoCount++;
      } else {
        validVideoCount++;
        if (!primaryVideoId) primaryVideoId = vid;
      }
    }

    let trailerStatus: TrailerStatus = 'NO_VIDEO';
    if (validVideoCount > 0 && primaryVideoId) {
      trailerStatus = 'PLAYABLE_TRAILER';
    } else if (rawVideos.length > 0 && disqualifiedVideoCount > 0) {
      trailerStatus = 'VIDEO_PRESENT_BUT_DISQUALIFIED';
    } else {
      trailerStatus = 'NO_VIDEO';
    }

    // Deduplication check
    const { dedupeStatus, dedupeReason } = dedupeCandidate(
      { igdbId, steamAppId: effectiveSteamAppId, steamAppIds, name, slug },
      existingCatalog,
    );

    // Steam Quality Gate evaluation
    let steamEvidenceStatus: SteamEvidenceStatus;
    let steamReviewCount: number | undefined;
    let steamPositivePercentage: number | undefined;
    let steamQualityGatePassed: boolean | undefined;

    if (!hasSteam) {
      steamEvidenceStatus = 'NON_STEAM';
      steamReviewCount = undefined;
      steamPositivePercentage = undefined;
      steamQualityGatePassed = undefined;
    } else if (
      !steamReview ||
      typeof steamReview.totalReviews !== 'number' ||
      !Number.isFinite(steamReview.totalReviews) ||
      steamReview.totalReviews < 0
    ) {
      // Missing value or unpopulated review MUST NOT be coerced to 0!
      steamEvidenceStatus = 'STEAM_EVIDENCE_UNAVAILABLE';
      steamQualityGatePassed = false;
      steamReviewCount = undefined;
      steamPositivePercentage = undefined;
    } else {
      steamReviewCount = steamReview.totalReviews;
      steamPositivePercentage =
        typeof steamReview.positivePercentage === 'number' && Number.isFinite(steamReview.positivePercentage)
          ? steamReview.positivePercentage
          : 0;

      if (steamReview.totalReviews < STEAM_QUALITY_GATE_CONFIG.minReviewCount) {
        steamEvidenceStatus = 'STEAM_VERIFIED';
        steamQualityGatePassed = false;
      } else if (steamPositivePercentage < STEAM_QUALITY_GATE_CONFIG.minPositivePercentage) {
        steamEvidenceStatus = 'STEAM_VERIFIED';
        steamQualityGatePassed = false;
      } else {
        steamEvidenceStatus = 'STEAM_VERIFIED';
        steamQualityGatePassed = true;
      }
    }

    const finalEligible =
      passedQualityGate &&
      metadataStatus === 'VALID' &&
      platformStatus === 'SUPPORTED' &&
      dedupeStatus === 'NEW' &&
      trailerStatus === 'PLAYABLE_TRAILER' &&
      (!hasSteam || steamQualityGatePassed === true);

    // Disjoint bucket classification
    let bucket: AcquisitionBucket;
    let rejectionReason: AcquisitionRejectionReason | undefined;

    if (dedupeStatus === 'ALREADY_EXISTS') {
      bucket = 'ALREADY_EXISTS';
    } else if (dedupeStatus === 'AMBIGUOUS') {
      bucket = 'AMBIGUOUS';
    } else if (finalEligible) {
      bucket = 'READY';
    } else {
      bucket = 'REJECTED';
      // Determine primary rejection reason mutually exclusively
      if (platformStatus === 'UNSUPPORTED_PLATFORM') {
        rejectionReason = 'unsupportedPlatform';
      } else if (metadataStatus === 'INVALID_METADATA') {
        rejectionReason = 'invalidMetadata';
      } else if (!eligibility.eligible) {
        rejectionReason = 'ineligible';
      } else if (!passedQualityGate) {
        rejectionReason = 'insufficientQuality';
      } else if (trailerStatus !== 'PLAYABLE_TRAILER') {
        rejectionReason = 'noTrailer';
      } else if (hasSteam) {
        if (steamEvidenceStatus === 'STEAM_EVIDENCE_UNAVAILABLE') {
          rejectionReason = 'steamEvidenceUnavailable';
        } else if (
          steamReviewCount !== undefined &&
          steamReviewCount < STEAM_QUALITY_GATE_CONFIG.minReviewCount
        ) {
          rejectionReason = 'insufficientSteamReviews';
        } else if (
          steamPositivePercentage !== undefined &&
          steamPositivePercentage < STEAM_QUALITY_GATE_CONFIG.minPositivePercentage
        ) {
          rejectionReason = 'poorSteamRating';
        }
      }
      rejectionReason = rejectionReason ?? 'insufficientQuality';
    }

    const clusterList = Array.from(foundClusters);
    const primaryCluster = clusterList[0] ?? 'strategy_tactical';

    return {
      igdbId,
      name,
      slug,
      releaseYear,
      releaseDate,
      genres,
      themes,
      platforms,
      studio,
      publisher,
      metadataStatus,
      platformStatus,
      effectiveRating: Number(effectiveRating.toFixed(1)),
      effectiveVotes,
      metricSource,
      adjustedRating: Number(adjustedRating.toFixed(2)),
      exposureBand,
      clusters: clusterList,
      primaryCluster,
      trailerStatus,
      primaryVideoId,
      primaryTrailerUrl: primaryVideoId
        ? `https://www.youtube.com/watch?v=${primaryVideoId}`
        : undefined,
      disqualifiedVideoCount,
      validVideoCount,
      steamAppId: effectiveSteamAppId,
      steamAppIds,
      steamReviewCount,
      steamPositivePercentage,
      steamQualityGatePassed,
      steamEvidenceStatus,
      dedupeStatus,
      dedupeReason,
      passedQualityGate,
      qualityGateFailReasons,
      finalEligible,
      bucket,
      rejectionReason,
      raw,
    };
  }
}
