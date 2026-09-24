import { randomUUID } from 'node:crypto';
import type { PrismaDbClient } from '../games/prisma-game.repository.js';
import { describeTrailer } from '../games/normalized-game.js';
import { isDisqualifiedTrailer } from '../games/game-eligibility.js';
import { rankedIgdbVideos } from '../integrations/igdb/igdb.mapper.js';
import type { SteamAppDetailsDto, SteamReviewSummary } from '../integrations/steam/steam.types.js';

export const CATALOG_REFRESH_MAX_LIMIT = 50;
export const CATALOG_REFRESH_MIN_LIMIT = 1;

export type RefreshCandidateStatus =
  | 'ELIGIBLE'
  | 'NO_CHANGE'
  | 'FAILED_IDENTITY_CONFLICT'
  | 'FAILED_PROVIDER_UNAVAILABLE'
  | 'FAILED_INVALID_DATA';

export interface CatalogRefreshGameRecord {
  id: string;
  title: string;
  slug: string;
  igdbId: number | null;
  steamAppId: number | null;
  description: string | null;
  studio: string | null;
  publisher: string | null;
  coverUrl: string | null;
  heroUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  totalRating: number | null;
  totalRatingCount: number | null;
  releaseDate: Date | null;
  isFree: boolean;
  media?: Array<{
    id?: string;
    type: 'TRAILER' | 'GAMEPLAY' | 'SCREENSHOT';
    url: string;
    sortOrder: number;
    provider?: string | null;
  }>;
  steamOffers?: Array<{
    id?: string;
    priceCents?: number | null;
    originalPriceCents?: number | null;
    discountPercent?: number | null;
    currency?: string | null;
    isAvailable?: boolean;
    storeUrl?: string;
    capturedAt?: Date;
  }>;
  storeOffers?: Array<{
    id?: string;
    store: string;
    finalPriceCents?: number | null;
    originalPriceCents?: number | null;
    discountPercent?: number | null;
    currency?: string | null;
    isAvailable?: boolean;
    storeUrl?: string;
    observedAt?: Date;
  }>;
}

export interface CatalogRefreshGamePayload {
  gameId: string;
  title: string;
  updates: {
    description?: string;
    studio?: string;
    publisher?: string;
    coverUrl?: string;
    heroUrl?: string;
    rating?: number;
    ratingCount?: number;
    totalRating?: number;
    totalRatingCount?: number;
    isFree?: boolean;
    releaseDate?: Date;
  };
  steamOffer?: {
    priceCents?: number | null;
    originalPriceCents?: number | null;
    discountPercent?: number | null;
    currency?: string | null;
    isAvailable: boolean;
    storeUrl: string;
  };
  newTrailer?: {
    url: string;
    provider: 'YOUTUBE' | 'STEAM' | 'DIRECT' | 'OTHER';
    sortOrder: number;
  };
}

export interface RefreshCandidatePlan {
  position: number;
  gameId: string;
  title: string;
  igdbId?: number | null;
  steamAppId?: number | null;
  fieldsChanged: string[];
  diffs: Record<string, { before: unknown; after: unknown }>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason?: string;
  refreshEligible: boolean;
  status: RefreshCandidateStatus;
  steamQualityWarning?: string;
  error?: string;
  payload?: CatalogRefreshGamePayload;
}

export interface CatalogRefreshManifest {
  sessionId: string;
  catalogCount: number;
  requested: number;
  processed: number;
  eligibleForRefresh: number;
  noChangeCount: number;
  failedCount: number;
  candidates: RefreshCandidatePlan[];
}

export interface CatalogRefreshItemResult {
  position: number;
  game: string;
  gameId: string;
  igdbId?: number | null;
  steamAppId?: number | null;
  fieldsChanged: string[];
  result: 'UPDATED' | 'NO_CHANGE' | 'FAILED';
  error?: string;
}

export interface CatalogRefreshResult {
  sessionId: string;
  catalogCount: number;
  requested: number;
  processed: number;
  updated: number;
  noChange: number;
  failed: number;
  results: CatalogRefreshItemResult[];
}

export interface CatalogRefreshDependencies {
  prisma?: PrismaDbClient;
  loadCatalogGames?: (limit: number) => Promise<CatalogRefreshGameRecord[]>;
  totalCatalogCount?: () => Promise<number>;
  fetchSteamDetails?: (appId: number) => Promise<SteamAppDetailsDto | undefined>;
  fetchSteamReviews?: (appId: number) => Promise<SteamReviewSummary | undefined>;
  fetchIgdbGame?: (igdbId: number) => Promise<any | undefined>;
  applyUpdate?: (payload: CatalogRefreshGamePayload) => Promise<void>;
  log?: (message: string) => void;
}

export interface CatalogRefreshPlanOptions {
  limit: number;
  gameId?: string;
  igdbId?: number;
  steamAppId?: number;
  catalogGames?: CatalogRefreshGameRecord[];
}

export interface CatalogRefreshApplyOptions {
  limit?: number;
  dryRun?: boolean;
}

export function validateCatalogRefreshLimit(limit: number): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit < CATALOG_REFRESH_MIN_LIMIT ||
    limit > CATALOG_REFRESH_MAX_LIMIT
  ) {
    throw new Error(
      `Catalog refresh limit must be an integer between ${CATALOG_REFRESH_MIN_LIMIT} and ${CATALOG_REFRESH_MAX_LIMIT}. Received: ${limit}`,
    );
  }
}

export class CatalogRefreshService {
  constructor(private readonly dependencies: CatalogRefreshDependencies = {}) {}

  /**
   * Strictly read-only planning of catalog updates.
   * Compares existing stable records against fresh external data from Steam and IGDB.
   * Returns a plan manifest with exact diffs without performing any database writes.
   */
  async plan(options: CatalogRefreshPlanOptions): Promise<CatalogRefreshManifest> {
    validateCatalogRefreshLimit(options.limit);

    const sessionId = randomUUID();
    let catalogCount = 0;
    if (this.dependencies.totalCatalogCount) {
      catalogCount = await this.dependencies.totalCatalogCount();
    } else if (this.dependencies.prisma) {
      catalogCount = await this.dependencies.prisma.game.count();
    }

    let records: CatalogRefreshGameRecord[] = [];
    if (options.catalogGames) {
      records = options.catalogGames.slice(0, options.limit);
      if (catalogCount === 0) catalogCount = options.catalogGames.length;
    } else if (this.dependencies.loadCatalogGames) {
      records = await this.dependencies.loadCatalogGames(options.limit);
    } else if (this.dependencies.prisma) {
      records = (await this.dependencies.prisma.game.findMany({
        take: options.limit,
        orderBy: [{ lastSyncedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        include: {
          media: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
          steamOffers: { orderBy: { capturedAt: 'desc' }, take: 1 },
          storeOffers: {
            where: { store: 'STEAM' },
            orderBy: { observedAt: 'desc' },
            take: 1,
          },
        },
      })) as unknown as CatalogRefreshGameRecord[];
    }

    // Optional filters if specified
    if (options.gameId) {
      records = records.filter((r) => r.id === options.gameId);
    }
    if (options.igdbId) {
      records = records.filter((r) => r.igdbId === options.igdbId);
    }
    if (options.steamAppId) {
      records = records.filter((r) => r.steamAppId === options.steamAppId);
    }

    const candidates: RefreshCandidatePlan[] = [];
    let position = 1;

    for (const record of records) {
      const candidatePlan = await this.evaluateRecord(record, position++);
      candidates.push(candidatePlan);
    }

    const eligibleForRefresh = candidates.filter((c) => c.status === 'ELIGIBLE').length;
    const noChangeCount = candidates.filter((c) => c.status === 'NO_CHANGE').length;
    const failedCount = candidates.filter((c) => c.status.startsWith('FAILED')).length;

    return {
      sessionId,
      catalogCount,
      requested: options.limit,
      processed: candidates.length,
      eligibleForRefresh,
      noChangeCount,
      failedCount,
      candidates,
    };
  }

  /**
   * Applies planned non-destructive updates to the catalog.
   * Isolated: if updating one game fails, subsequent games continue.
   */
  async apply(
    manifest: CatalogRefreshManifest,
    options: CatalogRefreshApplyOptions = {},
  ): Promise<CatalogRefreshResult> {
    if (options.dryRun) {
      return {
        sessionId: manifest.sessionId,
        catalogCount: manifest.catalogCount,
        requested: manifest.requested,
        processed: manifest.processed,
        updated: 0,
        noChange: manifest.noChangeCount,
        failed: manifest.failedCount,
        results: manifest.candidates.map((c) => ({
          position: c.position,
          game: c.title,
          gameId: c.gameId,
          igdbId: c.igdbId,
          steamAppId: c.steamAppId,
          fieldsChanged: c.fieldsChanged,
          result: c.status === 'ELIGIBLE' ? 'NO_CHANGE' : c.status === 'NO_CHANGE' ? 'NO_CHANGE' : 'FAILED',
          error: c.error,
        })),
      };
    }

    const applyLimit = options.limit ?? manifest.requested;
    validateCatalogRefreshLimit(applyLimit);

    const candidatesToApply = manifest.candidates.slice(0, applyLimit);
    const results: CatalogRefreshItemResult[] = [];
    let updated = 0;
    let noChange = 0;
    let failed = 0;

    for (const candidate of candidatesToApply) {
      if (candidate.status === 'NO_CHANGE') {
        noChange++;
        results.push({
          position: candidate.position,
          game: candidate.title,
          gameId: candidate.gameId,
          igdbId: candidate.igdbId,
          steamAppId: candidate.steamAppId,
          fieldsChanged: [],
          result: 'NO_CHANGE',
        });
        continue;
      }

      if (candidate.status !== 'ELIGIBLE' || !candidate.payload) {
        failed++;
        results.push({
          position: candidate.position,
          game: candidate.title,
          gameId: candidate.gameId,
          igdbId: candidate.igdbId,
          steamAppId: candidate.steamAppId,
          fieldsChanged: candidate.fieldsChanged,
          result: 'FAILED',
          error: candidate.error ?? candidate.reason ?? 'Candidate is not eligible for refresh',
        });
        continue;
      }

      try {
        if (this.dependencies.applyUpdate) {
          await this.dependencies.applyUpdate(candidate.payload);
        } else if (this.dependencies.prisma) {
          await this.defaultPrismaApply(candidate.payload);
        } else {
          throw new Error('No database client or applyUpdate handler provided for apply().');
        }

        updated++;
        results.push({
          position: candidate.position,
          game: candidate.title,
          gameId: candidate.gameId,
          igdbId: candidate.igdbId,
          steamAppId: candidate.steamAppId,
          fieldsChanged: candidate.fieldsChanged,
          result: 'UPDATED',
        });
      } catch (err: any) {
        failed++;
        results.push({
          position: candidate.position,
          game: candidate.title,
          gameId: candidate.gameId,
          igdbId: candidate.igdbId,
          steamAppId: candidate.steamAppId,
          fieldsChanged: candidate.fieldsChanged,
          result: 'FAILED',
          error: err?.message ?? String(err),
        });
      }
    }

    return {
      sessionId: manifest.sessionId,
      catalogCount: manifest.catalogCount,
      requested: applyLimit,
      processed: results.length,
      updated,
      noChange,
      failed,
      results,
    };
  }

  private async evaluateRecord(
    record: CatalogRefreshGameRecord,
    position: number,
  ): Promise<RefreshCandidatePlan> {
    const fieldsChanged: string[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const updates: CatalogRefreshGamePayload['updates'] = {};
    let steamOfferPayload: CatalogRefreshGamePayload['steamOffer'] | undefined;
    let newTrailerPayload: CatalogRefreshGamePayload['newTrailer'] | undefined;
    let steamQualityWarning: string | undefined;

    // Fail-closed checks on stable internal identity
    if (!record.id || typeof record.id !== 'string') {
      return {
        position,
        gameId: record.id ?? 'UNKNOWN',
        title: record.title ?? 'UNKNOWN',
        fieldsChanged: [],
        diffs: {},
        before: {},
        after: {},
        refreshEligible: false,
        status: 'FAILED_INVALID_DATA',
        error: 'Game record has invalid or missing internal UUID.',
      };
    }

    // 1. Steam Provider Evaluation (if game has confirmed steamAppId)
    let steamData: SteamAppDetailsDto['data'] | undefined;
    if (record.steamAppId) {
      if (!Number.isSafeInteger(record.steamAppId) || record.steamAppId <= 0) {
        return {
          position,
          gameId: record.id,
          title: record.title,
          igdbId: record.igdbId,
          steamAppId: record.steamAppId,
          fieldsChanged: [],
          diffs: {},
          before: {},
          after: {},
          refreshEligible: false,
          status: 'FAILED_IDENTITY_CONFLICT',
          error: `Invalid steamAppId: ${record.steamAppId}`,
        };
      }

      if (this.dependencies.fetchSteamDetails) {
        try {
          const details = await this.dependencies.fetchSteamDetails(record.steamAppId);
          if (details?.success && details.data) {
            steamData = details.data;

            // Identity protection: Fail closed if Steam returns data for a different App ID
            if (
              steamData.steam_appid !== undefined &&
              steamData.steam_appid !== record.steamAppId
            ) {
              return {
                position,
                gameId: record.id,
                title: record.title,
                igdbId: record.igdbId,
                steamAppId: record.steamAppId,
                fieldsChanged: [],
                diffs: {},
                before: {},
                after: {},
                refreshEligible: false,
                status: 'FAILED_IDENTITY_CONFLICT',
                error: `Steam App ID mismatch: expected ${record.steamAppId}, received ${steamData.steam_appid}`,
              };
            }
          }
        } catch (err: any) {
          return {
            position,
            gameId: record.id,
            title: record.title,
            igdbId: record.igdbId,
            steamAppId: record.steamAppId,
            fieldsChanged: [],
            diffs: {},
            before: {},
            after: {},
            refreshEligible: false,
            status: 'FAILED_PROVIDER_UNAVAILABLE',
            error: `Steam details provider unavailable: ${err?.message ?? err}`,
          };
        }
      }

      // Steam Quality Gate Check (reported separately, does NOT auto-delete)
      if (this.dependencies.fetchSteamReviews) {
        try {
          const reviews = await this.dependencies.fetchSteamReviews(record.steamAppId);
          if (reviews) {
            if (reviews.totalReviews < 100 || reviews.positivePercentage < 80) {
              steamQualityWarning = `Steam Quality Warning: reviews=${reviews.totalReviews}, positive=${reviews.positivePercentage.toFixed(1)}% (below recommended gate)`;
            }
          }
        } catch {
          // Failure to fetch reviews is non-fatal for pricing/metadata refresh
        }
      }
    }

    // 2. IGDB Provider Evaluation (if game has igdbId)
    let igdbDto: any | undefined;
    if (record.igdbId) {
      if (!Number.isSafeInteger(record.igdbId) || record.igdbId <= 0) {
        return {
          position,
          gameId: record.id,
          title: record.title,
          igdbId: record.igdbId,
          steamAppId: record.steamAppId,
          fieldsChanged: [],
          diffs: {},
          before: {},
          after: {},
          refreshEligible: false,
          status: 'FAILED_IDENTITY_CONFLICT',
          error: `Invalid igdbId: ${record.igdbId}`,
        };
      }

      if (this.dependencies.fetchIgdbGame) {
        try {
          igdbDto = await this.dependencies.fetchIgdbGame(record.igdbId);
          if (igdbDto) {
            // Identity protection: Fail closed if IGDB returns a different ID
            if (igdbDto.id !== undefined && igdbDto.id !== record.igdbId) {
              return {
                position,
                gameId: record.id,
                title: record.title,
                igdbId: record.igdbId,
                steamAppId: record.steamAppId,
                fieldsChanged: [],
                diffs: {},
                before: {},
                after: {},
                refreshEligible: false,
                status: 'FAILED_IDENTITY_CONFLICT',
                error: `IGDB ID mismatch: expected ${record.igdbId}, received ${igdbDto.id}`,
              };
            }

            // Check if IGDB external_games has conflicting Steam ID
            if (record.steamAppId && igdbDto.external_games) {
              for (const ext of igdbDto.external_games) {
                if (ext.external_game_source?.name?.trim().toLowerCase() === 'steam') {
                  const extUid = Number(ext.uid);
                  if (Number.isSafeInteger(extUid) && extUid > 0 && extUid !== record.steamAppId) {
                    return {
                      position,
                      gameId: record.id,
                      title: record.title,
                      igdbId: record.igdbId,
                      steamAppId: record.steamAppId,
                      fieldsChanged: [],
                      diffs: {},
                      before: {},
                      after: {},
                      refreshEligible: false,
                      status: 'FAILED_IDENTITY_CONFLICT',
                      error: `IGDB reports conflicting Steam App ID: ${extUid} vs existing confirmed ${record.steamAppId}`,
                    };
                  }
                }
              }
            }
          }
        } catch (err: any) {
          return {
            position,
            gameId: record.id,
            title: record.title,
            igdbId: record.igdbId,
            steamAppId: record.steamAppId,
            fieldsChanged: [],
            diffs: {},
            before: {},
            after: {},
            refreshEligible: false,
            status: 'FAILED_PROVIDER_UNAVAILABLE',
            error: `IGDB provider unavailable: ${err?.message ?? err}`,
          };
        }
      }
    }

    // 3. Mutable Pricing / Offer Diffs (Steam)
    const latestSteamOffer = record.steamOffers?.[0];
    if (steamData) {
      const priceOverview = steamData.price_overview;
      const isFreeGame = Boolean(steamData.is_free || (priceOverview && priceOverview.final === 0));

      let newPriceCents: number | undefined;
      let newOriginalPriceCents: number | undefined;
      let newDiscountPercent: number | undefined;
      let newCurrency: string | undefined;

      if (isFreeGame) {
        newPriceCents = 0;
        newOriginalPriceCents = 0;
        newDiscountPercent = 0;
        newCurrency = priceOverview?.currency ?? latestSteamOffer?.currency ?? 'BRL';
      } else if (priceOverview) {
        newPriceCents = priceOverview.final;
        newOriginalPriceCents = priceOverview.initial ?? priceOverview.final;
        newDiscountPercent = priceOverview.discount_percent;
        newCurrency = priceOverview.currency;
      }
      // If priceOverview is null and game is not free -> provider returns null -> preserve existing!

      let offerDiffFound = false;

      if (newPriceCents !== undefined && newPriceCents !== latestSteamOffer?.priceCents) {
        fieldsChanged.push('priceCents');
        before.priceCents = latestSteamOffer?.priceCents ?? null;
        after.priceCents = newPriceCents;
        offerDiffFound = true;
      }

      if (
        newDiscountPercent !== undefined &&
        newDiscountPercent !== latestSteamOffer?.discountPercent
      ) {
        fieldsChanged.push('discountPercent');
        before.discountPercent = latestSteamOffer?.discountPercent ?? null;
        after.discountPercent = newDiscountPercent;
        offerDiffFound = true;
      }

      if (
        newOriginalPriceCents !== undefined &&
        newOriginalPriceCents !== latestSteamOffer?.originalPriceCents
      ) {
        fieldsChanged.push('originalPriceCents');
        before.originalPriceCents = latestSteamOffer?.originalPriceCents ?? null;
        after.originalPriceCents = newOriginalPriceCents;
        offerDiffFound = true;
      }

      if (newCurrency !== undefined && newCurrency !== latestSteamOffer?.currency) {
        fieldsChanged.push('currency');
        before.currency = latestSteamOffer?.currency ?? null;
        after.currency = newCurrency;
        offerDiffFound = true;
      }

      const newIsAvailable = Boolean(steamData);
      if (latestSteamOffer && latestSteamOffer.isAvailable !== newIsAvailable) {
        fieldsChanged.push('isAvailable');
        before.isAvailable = latestSteamOffer.isAvailable;
        after.isAvailable = newIsAvailable;
        offerDiffFound = true;
      }

      if (isFreeGame !== record.isFree) {
        fieldsChanged.push('isFree');
        before.isFree = record.isFree;
        after.isFree = isFreeGame;
        updates.isFree = isFreeGame;
      }

      if (offerDiffFound && record.steamAppId) {
        steamOfferPayload = {
          priceCents: newPriceCents ?? latestSteamOffer?.priceCents ?? null,
          originalPriceCents:
            newOriginalPriceCents ?? latestSteamOffer?.originalPriceCents ?? null,
          discountPercent: newDiscountPercent ?? latestSteamOffer?.discountPercent ?? null,
          currency: newCurrency ?? latestSteamOffer?.currency ?? 'BRL',
          isAvailable: newIsAvailable,
          storeUrl: `https://store.steampowered.com/app/${record.steamAppId}/`,
        };
      }
    }

    // 4. Mutable IGDB Ratings Diffs (Rule: new value missing -> preserve existing)
    if (igdbDto) {
      if (igdbDto.rating !== undefined && igdbDto.rating !== null) {
        const rawRating = Number(igdbDto.rating);
        const mappedRating = rawRating > 10 ? Number((rawRating / 10).toFixed(1)) : rawRating;
        if (mappedRating !== record.rating) {
          fieldsChanged.push('rating');
          before.rating = record.rating;
          after.rating = mappedRating;
          updates.rating = mappedRating;
        }
      }

      if (igdbDto.rating_count !== undefined && igdbDto.rating_count !== null) {
        const mappedRatingCount = Number(igdbDto.rating_count);
        if (mappedRatingCount !== record.ratingCount) {
          fieldsChanged.push('ratingCount');
          before.ratingCount = record.ratingCount;
          after.ratingCount = mappedRatingCount;
          updates.ratingCount = mappedRatingCount;
        }
      }

      if (igdbDto.total_rating !== undefined && igdbDto.total_rating !== null) {
        const rawTotalRating = Number(igdbDto.total_rating);
        const mappedTotalRating =
          rawTotalRating > 10 ? Number((rawTotalRating / 10).toFixed(1)) : rawTotalRating;
        if (mappedTotalRating !== record.totalRating) {
          fieldsChanged.push('totalRating');
          before.totalRating = record.totalRating;
          after.totalRating = mappedTotalRating;
          updates.totalRating = mappedTotalRating;
        }
      }

      if (igdbDto.total_rating_count !== undefined && igdbDto.total_rating_count !== null) {
        const mappedTotalRatingCount = Number(igdbDto.total_rating_count);
        if (mappedTotalRatingCount !== record.totalRatingCount) {
          fieldsChanged.push('totalRatingCount');
          before.totalRatingCount = record.totalRatingCount;
          after.totalRatingCount = mappedTotalRatingCount;
          updates.totalRatingCount = mappedTotalRatingCount;
        }
      }
    }

    // 5. Mutable Metadata Diffs (Rule: Additive only, never erase valid data)
    const incomingDescription =
      (typeof igdbDto?.summary === 'string' && igdbDto.summary.trim()) ||
      (typeof steamData?.short_description === 'string' && steamData.short_description.trim()) ||
      undefined;

    if (incomingDescription && (!record.description || record.description.trim().length === 0)) {
      fieldsChanged.push('description');
      before.description = record.description;
      after.description = incomingDescription;
      updates.description = incomingDescription;
    }

    const incomingStudio =
      igdbDto?.involved_companies?.find((c: any) => c.developer)?.company?.name?.trim() ||
      steamData?.developers?.[0]?.trim() ||
      undefined;

    if (incomingStudio && (!record.studio || record.studio.trim().length === 0)) {
      fieldsChanged.push('studio');
      before.studio = record.studio;
      after.studio = incomingStudio;
      updates.studio = incomingStudio;
    }

    const incomingPublisher =
      igdbDto?.involved_companies?.find((c: any) => c.publisher)?.company?.name?.trim() ||
      steamData?.publishers?.[0]?.trim() ||
      undefined;

    if (incomingPublisher && (!record.publisher || record.publisher.trim().length === 0)) {
      fieldsChanged.push('publisher');
      before.publisher = record.publisher;
      after.publisher = incomingPublisher;
      updates.publisher = incomingPublisher;
    }

    const incomingCover =
      (igdbDto?.cover?.url &&
        (igdbDto.cover.url.startsWith('//') ? `https:${igdbDto.cover.url}` : igdbDto.cover.url)) ||
      steamData?.header_image ||
      undefined;

    if (incomingCover && (!record.coverUrl || record.coverUrl.trim().length === 0)) {
      fieldsChanged.push('coverUrl');
      before.coverUrl = record.coverUrl;
      after.coverUrl = incomingCover;
      updates.coverUrl = incomingCover;
    }

    const incomingHero = igdbDto?.artworks?.[0]?.url
      ? igdbDto.artworks[0].url.startsWith('//')
        ? `https:${igdbDto.artworks[0].url}`
        : igdbDto.artworks[0].url
      : undefined;

    if (incomingHero && (!record.heroUrl || record.heroUrl.trim().length === 0)) {
      fieldsChanged.push('heroUrl');
      before.heroUrl = record.heroUrl;
      after.heroUrl = incomingHero;
      updates.heroUrl = incomingHero;
    }

    if (igdbDto?.first_release_date && !record.releaseDate) {
      const incomingDate = new Date(igdbDto.first_release_date * 1000);
      fieldsChanged.push('releaseDate');
      before.releaseDate = record.releaseDate;
      after.releaseDate = incomingDate;
      updates.releaseDate = incomingDate;
    }

    // 6. Trailer Determinism & Repair Evaluation
    const currentPrimaryTrailer = (record.media ?? []).find(
      (m) => m.type === 'TRAILER' || m.type === 'GAMEPLAY',
    );

    let currentTrailerValid = false;
    let currentTrailerPriority = 3;

    if (currentPrimaryTrailer?.url) {
      const described = describeTrailer(currentPrimaryTrailer.url);
      const isDisqualified = isDisqualifiedTrailer(currentPrimaryTrailer.url);
      if (described.provider === 'YOUTUBE' && described.videoId) {
        if (/^[A-Za-z0-9_-]{11}$/.test(described.videoId) && !isDisqualified) {
          currentTrailerValid = true;
          currentTrailerPriority = 1;
        }
      } else if (described.provider === 'STEAM' && !isDisqualified) {
        currentTrailerValid = true;
        currentTrailerPriority = 2;
      }
    }

    if (igdbDto?.videos && Array.isArray(igdbDto.videos)) {
      const rankedVideos = rankedIgdbVideos(igdbDto.videos);
      const bestVideo = rankedVideos.find(
        (v) => v.priority !== 99 && /^[A-Za-z0-9_-]{11}$/.test(v.videoId),
      );

      if (bestVideo) {
        const canonicalUrl = `https://www.youtube.com/watch?v=${bestVideo.videoId}`;
        if (!currentTrailerValid) {
          // Current trailer is missing or invalid -> Repair allowed!
          fieldsChanged.push('trailer');
          before.trailer = currentPrimaryTrailer?.url ?? null;
          after.trailer = canonicalUrl;
          newTrailerPayload = {
            url: canonicalUrl,
            provider: 'YOUTUBE',
            sortOrder: 0,
          };
        } else if (
          currentPrimaryTrailer &&
          bestVideo.priority === 0 &&
          currentTrailerPriority > 0 &&
          currentPrimaryTrailer.url !== canonicalUrl
        ) {
          // Canonical official primary is strictly superior to current non-official trailer
          fieldsChanged.push('trailer');
          before.trailer = currentPrimaryTrailer.url;
          after.trailer = canonicalUrl;
          newTrailerPayload = {
            url: canonicalUrl,
            provider: 'YOUTUBE',
            sortOrder: 0,
          };
        }
        // If bestVideo is worse or same -> preserve current trailer!
      }
    }

    // 7. Conclusion & Diff Packaging
    const diffs: Record<string, { before: unknown; after: unknown }> = {};
    for (const field of fieldsChanged) {
      diffs[field] = { before: before[field], after: after[field] };
    }

    if (fieldsChanged.length === 0) {
      return {
        position,
        gameId: record.id,
        title: record.title,
        igdbId: record.igdbId,
        steamAppId: record.steamAppId,
        fieldsChanged: [],
        diffs: {},
        before,
        after,
        refreshEligible: false,
        status: 'NO_CHANGE',
        reason: 'No mutable fields changed',
        steamQualityWarning,
      };
    }

    return {
      position,
      gameId: record.id,
      title: record.title,
      igdbId: record.igdbId,
      steamAppId: record.steamAppId,
      fieldsChanged,
      diffs,
      before,
      after,
      refreshEligible: true,
      status: 'ELIGIBLE',
      steamQualityWarning,
      payload: {
        gameId: record.id,
        title: record.title,
        updates,
        steamOffer: steamOfferPayload,
        newTrailer: newTrailerPayload,
      },
    };
  }

  private async defaultPrismaApply(payload: CatalogRefreshGamePayload): Promise<void> {
    if (!this.dependencies.prisma) {
      throw new Error('Prisma client required for default apply.');
    }
    const prisma = this.dependencies.prisma;

    // 1. Update Game record
    await prisma.game.update({
      where: { id: payload.gameId },
      data: {
        ...payload.updates,
        lastSyncedAt: new Date(),
      },
    });

    // 2. If steamOffer changed, insert new SteamOffer & StoreOffer
    if (payload.steamOffer) {
      await prisma.steamOffer.create({
        data: {
          gameId: payload.gameId,
          storeUrl: payload.steamOffer.storeUrl,
          priceCents: payload.steamOffer.priceCents ?? null,
          originalPriceCents: payload.steamOffer.originalPriceCents ?? null,
          discountPercent: payload.steamOffer.discountPercent ?? null,
          currency: payload.steamOffer.currency ?? 'BRL',
          isAvailable: payload.steamOffer.isAvailable,
        },
      });

      await prisma.storeOffer.create({
        data: {
          gameId: payload.gameId,
          store: 'STEAM',
          storeUrl: payload.steamOffer.storeUrl,
          finalPriceCents: payload.steamOffer.priceCents ?? null,
          originalPriceCents: payload.steamOffer.originalPriceCents ?? null,
          discountPercent: payload.steamOffer.discountPercent ?? 0,
          currency: payload.steamOffer.currency ?? 'BRL',
          isAvailable: payload.steamOffer.isAvailable,
          provider: 'STEAM_OFFICIAL',
        },
      });
    }

    // 3. If newTrailer, repair/update trailer in GameMedia
    if (payload.newTrailer) {
      const existing = await prisma.gameMedia.findFirst({
        where: {
          gameId: payload.gameId,
          type: 'TRAILER',
        },
        orderBy: { sortOrder: 'asc' },
      });
      if (existing) {
        await prisma.gameMedia.update({
          where: { id: existing.id },
          data: {
            url: payload.newTrailer.url,
            provider: payload.newTrailer.provider,
          },
        });
      } else {
        await prisma.gameMedia.create({
          data: {
            gameId: payload.gameId,
            type: 'TRAILER',
            url: payload.newTrailer.url,
            sortOrder: payload.newTrailer.sortOrder ?? 0,
            provider: payload.newTrailer.provider,
          },
        });
      }
    }
  }
}

export function formatCatalogRefreshPlan(manifest: CatalogRefreshManifest): string {
  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push('NEXTPLAY — CATALOG REFRESH PLAN (DRY-RUN)');
  lines.push('================================================================================');
  lines.push(`sessionId:    ${manifest.sessionId}`);
  lines.push(`catalogCount: ${manifest.catalogCount}`);
  lines.push(`requested:    ${manifest.requested}`);
  lines.push(`processed:    ${manifest.processed}`);
  lines.push(`eligible:     ${manifest.eligibleForRefresh}`);
  lines.push(`noChange:     ${manifest.noChangeCount}`);
  lines.push(`failed:       ${manifest.failedCount}`);
  lines.push('--------------------------------------------------------------------------------');
  lines.push('| # | Game | Game ID | IGDB ID | Steam App ID | Fields Changed | Status |');
  lines.push('|---|------|---------|---------|--------------|----------------|--------|');
  for (const c of manifest.candidates) {
    const fields = c.fieldsChanged.length ? c.fieldsChanged.join(', ') : 'none';
    lines.push(
      `| ${c.position} | ${c.title} | ${c.gameId} | ${c.igdbId ?? 'N/A'} | ${c.steamAppId ?? 'N/A'} | ${fields} | ${c.status} |`,
    );
  }
  lines.push('================================================================================');
  return lines.join('\n');
}

export function formatCatalogRefreshResult(result: CatalogRefreshResult): string {
  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push('NEXTPLAY — CATALOG REFRESH EXECUTION REPORT');
  lines.push('================================================================================');
  lines.push(`sessionId:    ${result.sessionId}`);
  lines.push(`catalogCount: ${result.catalogCount}`);
  lines.push(`requested:    ${result.requested}`);
  lines.push(`processed:    ${result.processed}`);
  lines.push(`updated:      ${result.updated}`);
  lines.push(`noChange:     ${result.noChange}`);
  lines.push(`failed:       ${result.failed}`);
  lines.push('--------------------------------------------------------------------------------');
  lines.push('| # | Game | Game ID | IGDB ID | Steam App ID | Fields Changed | Result |');
  lines.push('|---|------|---------|---------|--------------|----------------|--------|');
  for (const r of result.results) {
    const fields = r.fieldsChanged.length ? r.fieldsChanged.join(', ') : 'none';
    lines.push(
      `| ${r.position} | ${r.game} | ${r.gameId} | ${r.igdbId ?? 'N/A'} | ${r.steamAppId ?? 'N/A'} | ${fields} | ${r.result}${r.error ? ` (${r.error})` : ''} |`,
    );
  }
  lines.push('================================================================================');
  return lines.join('\n');
}
