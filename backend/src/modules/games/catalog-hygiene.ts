import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isEligibleForCatalog } from './game-eligibility.js';

export type HygieneCategory =
  'PROTECTED' | 'CLEAR_JUNK' | 'PROBABLE_BAD_RECENT_IMPORT' | 'LEGITIMATE_KEEP' | 'UNCERTAIN';

export type GameProvenance =
  'SEED_OR_CURATED' | 'POPULAR_BATCH' | 'RECENT_OLD_BATCH' | 'DISCOVER_BATCH' | 'UNKNOWN';

export interface HygieneUserRelations {
  libraryCount: number;
  commentsCount: number;
  topicsCount: number;
  eventsCount: number;
}

export interface HygieneGameInput {
  id: string;
  title: string;
  slug: string;
  igdbId?: number | null;
  steamAppId?: number | null;
  source?: string | null;
  sourceId?: string | null;
  createdAt: Date;
  lastSyncedAt?: Date | null;
  rating?: number | null;
  ratingCount?: number | null;
  totalRating?: number | null;
  totalRatingCount?: number | null;
  releaseDate?: Date | null;
  gameType?: number | null;
  trailersCount?: number;
  playableTrailersCount?: number;
  userRelations: HygieneUserRelations;
  provenance?: GameProvenance;
}

export interface HygieneClassificationResult {
  category: HygieneCategory;
  reason: string;
  canSafelyDelete: boolean;
}

/**
 * Deterministically calculates provenance based on the database creation timestamps
 * of the initial seed and the 2026-09-17 expansion batches.
 */
export function determineGameProvenance(createdAt: Date): GameProvenance {
  const time = createdAt.getTime();

  // Initial seed and dev catalog (< 2026-09-17)
  const sep17 = new Date('2026-09-17T00:00:00.000Z').getTime();
  if (time < sep17) {
    return 'SEED_OR_CURATED';
  }

  // 2026-09-17 Expansion syncs:
  // POPULAR batch: 02:42:59 - 02:46:58 UTC
  const popularStart = new Date('2026-09-17T02:42:00.000Z').getTime();
  const popularEnd = new Date('2026-09-17T02:47:00.000Z').getTime();
  if (time >= popularStart && time < popularEnd) {
    return 'POPULAR_BATCH';
  }

  // RECENT OLD batch: 02:47:02 - 02:50:11 UTC
  const recentStart = new Date('2026-09-17T02:47:00.000Z').getTime();
  const recentEnd = new Date('2026-09-17T02:50:15.000Z').getTime();
  if (time >= recentStart && time < recentEnd) {
    return 'RECENT_OLD_BATCH';
  }

  // DISCOVER batch: 02:50:16 - 02:54:24 UTC
  const discoverStart = new Date('2026-09-17T02:50:15.000Z').getTime();
  const discoverEnd = new Date('2026-09-17T02:55:00.000Z').getTime();
  if (time >= discoverStart && time <= discoverEnd) {
    return 'DISCOVER_BATCH';
  }

  return 'UNKNOWN';
}

/**
 * Checks if a game has any user relations that forbid deletion.
 */
export function hasUserRelations(relations: HygieneUserRelations): boolean {
  return (
    relations.libraryCount > 0 ||
    relations.commentsCount > 0 ||
    relations.topicsCount > 0 ||
    relations.eventsCount > 0
  );
}

/**
 * Classifies a game record for catalog hygiene according to Obsidian Kinetic rules.
 *
 * Rules:
 * 1. PROTECTED: any user relation (library, comments, topics, events).
 * 2. CLEAR_JUNK: objective exclusion (mods, DLCs, expansions, demos, tools, soundtracks, spam).
 * 3. PROBABLE_BAD_RECENT_IMPORT: belongs to old recent batch and fails new editorial quality filter
 *    (total_rating >= 60 & total_rating_count >= 10), but is not objective junk.
 * 4. LEGITIMATE_KEEP: valid game that should remain (curated/seed, meets editorial rule, etc.).
 *    Low ratingCount alone NEVER classifies as junk or removable!
 * 5. UNCERTAIN: insufficient data / unknown provenance.
 */
export function classifyHygieneGame(game: HygieneGameInput): HygieneClassificationResult {
  // 1. Check user relations first (Absolute rule: NEVER delete user-linked records)
  if (hasUserRelations(game.userRelations)) {
    const details = [
      game.userRelations.libraryCount > 0
        ? `${game.userRelations.libraryCount} library entries`
        : null,
      game.userRelations.commentsCount > 0 ? `${game.userRelations.commentsCount} comments` : null,
      game.userRelations.topicsCount > 0 ? `${game.userRelations.topicsCount} forum topics` : null,
      game.userRelations.eventsCount > 0
        ? `${game.userRelations.eventsCount} recommendation events`
        : null,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      category: 'PROTECTED',
      reason: `Has active user relations (${details}). Strictly protected from modification or deletion.`,
      canSafelyDelete: false,
    };
  }

  // 2. Check for CLEAR JUNK (objective disqualification from catalog)
  const eligibility = isEligibleForCatalog({
    title: game.title,
    slug: game.slug,
    gameType: game.gameType,
    rating: game.rating,
    ratingCount: game.ratingCount,
    totalRating: game.totalRating,
    totalRatingCount: game.totalRatingCount,
  });

  if (!eligibility.eligible) {
    return {
      category: 'CLEAR_JUNK',
      reason: `Objectively disqualified from catalog: ${eligibility.reason ?? 'UNKNOWN'} - ${eligibility.details ?? 'Ineligible content'}.`,
      canSafelyDelete: true,
    };
  }

  // 3. Provenance-based editorial check
  const provenance = game.provenance ?? determineGameProvenance(game.createdAt);

  if (provenance === 'RECENT_OLD_BATCH') {
    const totalRating100 =
      game.totalRating !== null && game.totalRating !== undefined
        ? game.totalRating > 10
          ? game.totalRating
          : game.totalRating * 10
        : null;

    const meetsEditorialRule =
      totalRating100 !== null &&
      totalRating100 >= 60 &&
      game.totalRatingCount !== null &&
      game.totalRatingCount !== undefined &&
      game.totalRatingCount >= 10;

    if (meetsEditorialRule) {
      return {
        category: 'LEGITIMATE_KEEP',
        reason: `Meets editorial quality threshold for recent games (totalRating: ${totalRating100.toFixed(1)}/100, totalRatingCount: ${game.totalRatingCount} >= 10).`,
        canSafelyDelete: false,
      };
    }

    return {
      category: 'PROBABLE_BAD_RECENT_IMPORT',
      reason: `Imported during legacy unfiltered recent sync and does not meet current editorial quality threshold (totalRating >= 60, totalRatingCount >= 10). Current: totalRating=${totalRating100 !== null ? totalRating100.toFixed(1) : 'null'}, totalRatingCount=${game.totalRatingCount ?? 0}.`,
      canSafelyDelete: true,
    };
  }

  // 4. Seed/curated, popular batch, and discover batch games
  if (
    provenance === 'SEED_OR_CURATED' ||
    provenance === 'POPULAR_BATCH' ||
    provenance === 'DISCOVER_BATCH'
  ) {
    return {
      category: 'LEGITIMATE_KEEP',
      reason: `Legitimate catalog game from ${provenance}. Low review count or missing rating alone never implies deletion.`,
      canSafelyDelete: false,
    };
  }

  // 5. UNCERTAIN
  return {
    category: 'UNCERTAIN',
    reason: 'Insufficient provenance or metadata evidence to make an automated hygiene decision.',
    canSafelyDelete: false,
  };
}

export const EXPECTED_BAD_RECENT_COUNT = 99;
export const TCG_SIMULATOR_IGDB_ID = 309862;

/**
 * Computes a deterministic SHA-256 fingerprint for a list of UUIDs.
 * Sorting ensures the hash is order-independent.
 */
export function computeCandidateFingerprint(uuids: string[]): string {
  const sorted = [...uuids].sort();
  return crypto.createHash('sha256').update(sorted.join(',')).digest('hex');
}

export interface SafeDeleteCandidate {
  id: string;
  title: string;
  category: HygieneCategory;
  canSafelyDelete: boolean;
  igdbId?: number | null;
  slug?: string | null;
}

/**
 * Validates strict preconditions before any apply can proceed:
 * 1. Count must be EXACTLY 99 (or options.expectedCount).
 * 2. TCG Card Shop Simulator must NEVER be present.
 * 3. Fingerprint must match expected if provided.
 */
export function validateApplyPreconditions(
  candidates: SafeDeleteCandidate[],
  options?: { expectedCount?: number; expectedFingerprint?: string },
): { fingerprint: string } {
  const expectedCount = options?.expectedCount ?? EXPECTED_BAD_RECENT_COUNT;
  const eligible = candidates.filter(
    (c) =>
      (c.category === 'CLEAR_JUNK' || c.category === 'PROBABLE_BAD_RECENT_IMPORT') &&
      c.canSafelyDelete,
  );

  if (eligible.length !== expectedCount) {
    throw new Error(
      `ABORT: A contagem de candidatos (${eligible.length}) difere do esperado (${expectedCount}). Operação abortada por segurança.`,
    );
  }

  for (const c of eligible) {
    if (
      c.igdbId === TCG_SIMULATOR_IGDB_ID ||
      c.title.toLowerCase().includes('tcg card shop simulator') ||
      (c.slug && c.slug.includes('tcg-card-shop-simulator'))
    ) {
      throw new Error(
        `ABORT: "TCG Card Shop Simulator" (${c.id}) foi detectado na lista de remoção! Ele deve ser estritamente preservado. Operação abortada por segurança.`,
      );
    }
  }

  const fingerprint = computeCandidateFingerprint(eligible.map((c) => c.id));
  if (options?.expectedFingerprint && fingerprint !== options.expectedFingerprint) {
    throw new Error(
      `ABORT: O fingerprint dos candidatos (${fingerprint}) não corresponde ao fingerprint auditado (${options.expectedFingerprint}). A lista de candidatos foi alterada!`,
    );
  }

  return { fingerprint };
}

export interface MinimalPrismaTransaction {
  userGameLibrary: {
    count: (args: { where: { gameId: { in: string[] } } }) => Promise<number>;
  };
  comment: {
    count: (args: { where: { gameId: { in: string[] } } }) => Promise<number>;
  };
  forumTopic: {
    count: (args: { where: { gameId: { in: string[] } } }) => Promise<number>;
  };
  recommendationEvent: {
    count: (args: { where: { gameId: { in: string[] } } }) => Promise<number>;
  };
  gameMedia: {
    deleteMany: (args: { where: { gameId: { in: string[] } } }) => Promise<{ count: number } | unknown>;
  };
  gameGenre: {
    deleteMany: (args: { where: { gameId: { in: string[] } } }) => Promise<{ count: number } | unknown>;
  };
  gamePlatform: {
    deleteMany: (args: { where: { gameId: { in: string[] } } }) => Promise<{ count: number } | unknown>;
  };
  steamOffer: {
    deleteMany: (args: { where: { gameId: { in: string[] } } }) => Promise<{ count: number } | unknown>;
  };
  game: {
    deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }>;
  };
}

/**
 * Safely executes deletions inside a transaction using batched (set-based) queries:
 * - Validates strict preconditions (count === 99, TCG excluded, optional fingerprint check).
 * - Re-validates in batch across all candidateIds that none possess user relations (library, comments, topics, events).
 * - Aborts transaction immediately if ANY user relation is found (0 deletions happen).
 * - Never processes PROTECTED, UNCERTAIN, or LEGITIMATE_KEEP records.
 * - Deletes foreign-key dependencies in batch before deleting Game records in batch.
 * - Confirms exact deleted count matches expected count.
 */
export interface ApplyTransactionResult {
  deletedCount: number;
  fingerprint: string;
  durationMs: number;
  deletedDependencies: {
    gameMedia: number;
    gameGenre: number;
    gamePlatform: number;
    steamOffer: number;
  };
}

export async function executeHygieneApplyTransaction(
  tx: MinimalPrismaTransaction,
  candidates: SafeDeleteCandidate[],
  options?: { expectedCount?: number; expectedFingerprint?: string },
): Promise<ApplyTransactionResult> {
  const expectedCount = options?.expectedCount ?? EXPECTED_BAD_RECENT_COUNT;
  const { fingerprint } = validateApplyPreconditions(candidates, options);

  const eligible = candidates.filter(
    (c) =>
      (c.category === 'CLEAR_JUNK' || c.category === 'PROBABLE_BAD_RECENT_IMPORT') &&
      c.canSafelyDelete,
  );

  const startMs = Date.now();
  const candidateIds = eligible.map((c) => c.id);

  // 1. Revalidar em lote se algum dos candidateIds possui qualquer relação de usuário
  const [libraryCount, commentsCount, topicsCount, eventsCount] = await Promise.all([
    tx.userGameLibrary.count({ where: { gameId: { in: candidateIds } } }),
    tx.comment.count({ where: { gameId: { in: candidateIds } } }),
    tx.forumTopic.count({ where: { gameId: { in: candidateIds } } }),
    tx.recommendationEvent.count({ where: { gameId: { in: candidateIds } } }),
  ]);

  if (libraryCount > 0 || commentsCount > 0 || topicsCount > 0 || eventsCount > 0) {
    const details = [
      libraryCount > 0 ? `${libraryCount} library entries` : null,
      commentsCount > 0 ? `${commentsCount} comments` : null,
      topicsCount > 0 ? `${topicsCount} forum topics` : null,
      eventsCount > 0 ? `${eventsCount} recommendation events` : null,
    ]
      .filter(Boolean)
      .join(', ');

    throw new Error(
      `ABORT: Tentativa de remoção bloqueada! Candidatos possuem relações ativas de usuário (${details}). Nenhuma deleção foi executada.`,
    );
  }

  // 2. Deletar em lote as tabelas dependentes do catálogo
  const mediaResult = (await tx.gameMedia.deleteMany({ where: { gameId: { in: candidateIds } } })) as any;
  const genreResult = (await tx.gameGenre.deleteMany({ where: { gameId: { in: candidateIds } } })) as any;
  const platformResult = (await tx.gamePlatform.deleteMany({
    where: { gameId: { in: candidateIds } },
  })) as any;
  const offerResult = (await tx.steamOffer.deleteMany({
    where: { gameId: { in: candidateIds } },
  })) as any;

  // 3. Deletar os jogos em lote e garantir a contagem
  const result = await tx.game.deleteMany({ where: { id: { in: candidateIds } } });
  const deletedCount = result.count;
  const durationMs = Date.now() - startMs;

  if (deletedCount !== expectedCount) {
    throw new Error(
      `ABORT: Quantidade de registros deletados (${deletedCount}) diferente do esperado (${expectedCount}). Transação cancelada.`,
    );
  }

  return {
    deletedCount,
    fingerprint,
    durationMs,
    deletedDependencies: {
      gameMedia: mediaResult?.count ?? 0,
      gameGenre: genreResult?.count ?? 0,
      gamePlatform: platformResult?.count ?? 0,
      steamOffer: offerResult?.count ?? 0,
    },
  };
}

export interface GameSnapshot {
  id: string;
  title: string;
  slug: string;
  igdbId: number | null;
  steamAppId: number | null;
  source: string | null;
  sourceId: string | null;
  description: string | null;
  studio: string | null;
  publisher: string | null;
  coverUrl: string | null;
  heroUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  totalRating: number | null;
  totalRatingCount: number | null;
  releaseDate: string | null;
  mode: string | null;
  playerCountMin: number | null;
  playerCountMax: number | null;
  isFree: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: Array<{
    id: string;
    type: string;
    url: string;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    sortOrder: number;
    provider: string | null;
    mimeType: string | null;
    origin: string | null;
    authorizationRef: string | null;
    createdAt: string;
  }>;
  genres: Array<{
    genreId: string;
    genre: { id: string; name: string; slug: string };
  }>;
  platforms: Array<{
    platformId: string;
    platform: { id: string; name: string; slug: string };
  }>;
  steamOffers: Array<{
    id: string;
    currency: string | null;
    priceCents: number | null;
    discountPercent: number | null;
    storeUrl: string;
    isAvailable: boolean;
    capturedAt: string;
  }>;
}

export interface CatalogHygieneSnapshotFile {
  timestamp: string;
  candidateCount: number;
  fingerprint: string;
  games: GameSnapshot[];
}

/**
 * Creates a complete JSON snapshot/backup of candidate records and all their relations.
 */
export async function exportCatalogHygieneSnapshot(
  prisma: {
    game: {
      findMany: (args: any) => Promise<any[]>;
    };
  },
  candidateIds: string[],
  outputFilePath: string,
): Promise<{ snapshotPath: string; candidateCount: number; fingerprint: string }> {
  const games = await prisma.game.findMany({
    where: { id: { in: candidateIds } },
    include: {
      media: true,
      genres: { include: { genre: true } },
      platforms: { include: { platform: true } },
      steamOffers: true,
    },
    orderBy: { id: 'asc' },
  });

  const fingerprint = computeCandidateFingerprint(candidateIds);
  const snapshotData: CatalogHygieneSnapshotFile = {
    timestamp: new Date().toISOString(),
    candidateCount: games.length,
    fingerprint,
    games: games.map((g) => ({
      id: g.id,
      title: g.title,
      slug: g.slug,
      igdbId: g.igdbId ?? null,
      steamAppId: g.steamAppId ?? null,
      source: g.source ?? null,
      sourceId: g.sourceId ?? null,
      description: g.description ?? null,
      studio: g.studio ?? null,
      publisher: g.publisher ?? null,
      coverUrl: g.coverUrl ?? null,
      heroUrl: g.heroUrl ?? null,
      rating: g.rating ?? null,
      ratingCount: g.ratingCount ?? null,
      totalRating: g.totalRating ?? null,
      totalRatingCount: g.totalRatingCount ?? null,
      releaseDate: g.releaseDate?.toISOString() ?? null,
      mode: g.mode ?? null,
      playerCountMin: g.playerCountMin ?? null,
      playerCountMax: g.playerCountMax ?? null,
      isFree: g.isFree,
      lastSyncedAt: g.lastSyncedAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      media: g.media.map((m: any) => ({
        id: m.id,
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl ?? null,
        durationSeconds: m.durationSeconds ?? null,
        sortOrder: m.sortOrder,
        provider: m.provider ?? null,
        mimeType: m.mimeType ?? null,
        origin: m.origin ?? null,
        authorizationRef: m.authorizationRef ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      genres: g.genres.map((gg: any) => ({
        genreId: gg.genreId,
        genre: { id: gg.genre.id, name: gg.genre.name, slug: gg.genre.slug },
      })),
      platforms: g.platforms.map((gp: any) => ({
        platformId: gp.platformId,
        platform: { id: gp.platform.id, name: gp.platform.name, slug: gp.platform.slug },
      })),
      steamOffers: g.steamOffers.map((so: any) => ({
        id: so.id,
        currency: so.currency ?? null,
        priceCents: so.priceCents ?? null,
        discountPercent: so.discountPercent ?? null,
        storeUrl: so.storeUrl,
        isAvailable: so.isAvailable,
        capturedAt: so.capturedAt.toISOString(),
      })),
    })),
  };

  const resolvedPath = path.resolve(outputFilePath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, JSON.stringify(snapshotData, null, 2), 'utf8');
  return {
    snapshotPath: resolvedPath,
    candidateCount: games.length,
    fingerprint,
  };
}
