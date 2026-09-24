import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';
import { SteamClient } from '../modules/integrations/steam/steam.client.js';
import { enrichWithSteam } from '../modules/integrations/steam/steam.mapper.js';
import { PrismaGameRepository } from '../modules/games/prisma-game.repository.js';
import { GameService } from '../modules/games/game.service.js';
import { describeTrailer } from '../modules/games/normalized-game.js';
import { GameSyncService } from '../modules/sync/game-sync.service.js';
import {
  CatalogAcquisitionService,
  type EvaluatedCandidate,
} from '../modules/sync/catalog-acquisition.service.js';
import {
  createCatalogAcquisitionBatchPlan,
  runCatalogAcquisitionBatch,
  steamGatePassed,
} from '../modules/sync/catalog-acquisition-batch.js';
import { dedupeCandidate } from '../modules/sync/catalog-hygiene.service.js';
import type { NormalizedGame } from '../modules/games/normalized-game.js';
import { CatalogRefreshService } from '../modules/sync/catalog-refresh.service.js';
import {
  CatalogMaintenanceService,
  FileMaintenanceLock,
  formatCatalogMaintenanceReport,
  validateMaintenanceLimits,
  type MaintenanceMode,
  type MaintenanceRefreshSummary,
  type MaintenanceAcquisitionSummary,
} from '../modules/sync/catalog-maintenance.service.js';

export interface CatalogMaintenanceCliOptions {
  mode: MaintenanceMode;
  apply: boolean;
  refreshLimit?: number;
  acquisitionLimit?: number;
  snapshotPath?: string;
}

export function parseCatalogMaintenanceArgs(args: string[]): CatalogMaintenanceCliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const argv = args[0] === '--' ? args.slice(1) : args;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') {
      if (flags.has(arg)) throw new Error(`ERRO: ${arg} duplicado.`);
      flags.add(arg);
      continue;
    }
    if (
      arg !== '--mode' &&
      arg !== '--refresh-limit' &&
      arg !== '--acquisition-limit' &&
      arg !== '--snapshot'
    ) {
      throw new Error(`ERRO: argumento desconhecido para manutenção: ${arg}.`);
    }
    if (values.has(arg)) throw new Error(`ERRO: ${arg} duplicado.`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`ERRO: ${arg} requer um valor.`);
    values.set(arg, value);
  }

  const modeRaw = values.get('--mode');
  if (!modeRaw) throw new Error('ERRO: Manutenção requer argumento explícito --mode <refresh|acquisition|full>.');
  if (modeRaw !== 'refresh' && modeRaw !== 'acquisition' && modeRaw !== 'full') {
    throw new Error(`ERRO: modo inválido: "${modeRaw}". Use "refresh", "acquisition" ou "full".`);
  }
  const mode = modeRaw as MaintenanceMode;

  const refreshLimitRaw = values.get('--refresh-limit');
  const refreshLimit = refreshLimitRaw !== undefined ? Number(refreshLimitRaw) : undefined;

  const acquisitionLimitRaw = values.get('--acquisition-limit');
  const acquisitionLimit = acquisitionLimitRaw !== undefined ? Number(acquisitionLimitRaw) : undefined;

  const snapshotPath = values.get('--snapshot');

  validateMaintenanceLimits({ mode, refreshLimit, acquisitionLimit });

  return {
    mode,
    apply: flags.has('--apply'),
    refreshLimit,
    acquisitionLimit,
    snapshotPath,
  };
}

async function main() {
  const options = parseCatalogMaintenanceArgs(process.argv.slice(2));
  const { mode, apply, refreshLimit, acquisitionLimit, snapshotPath } = options;

  console.log('='.repeat(80));
  console.log(
    `NEXTPLAY — CATALOG MAINTENANCE ORCHESTRATOR [MODE: ${mode.toUpperCase()}] ${apply ? '(APPLY)' : '(DRY-RUN)'}`,
  );
  console.log('='.repeat(80));

  const datasourceUrl =
    process.env.USE_TEST_DB === 'true' && process.env.TEST_DATABASE_URL
      ? process.env.TEST_DATABASE_URL
      : undefined;

  const prisma = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);
  if (datasourceUrl) {
    console.log('Ambiente de banco: TEST_DATABASE_URL (Neon TEST)');
  }

  try {
    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;
    const igdbClient = clientId && clientSecret ? new IgdbClient(clientId, clientSecret) : undefined;

    const steamKey = process.env.STEAM_API_KEY;
    const steamClient = new SteamClient(steamKey ?? '');

    const repository = new PrismaGameRepository(prisma);
    const gameSyncService = new GameSyncService(repository);
    const gameService = new GameService(prisma);

    const steamEnricher = async (game: NormalizedGame) => {
      try {
        const appId =
          game.steamAppId ??
          (game.steamAppIds?.length
            ? await steamClient.resolvePrimaryApp(game.title, game.steamAppIds)
            : undefined);
        if (!appId) return game;
        const details = await steamClient.details(appId);
        return enrichWithSteam(game, appId, details);
      } catch {
        return game;
      }
    };

    const loadExistingCatalog = async () => {
      return await prisma.game.findMany({
        select: { id: true, title: true, slug: true, igdbId: true, steamAppId: true },
      });
    };

    const steamAppResolver = steamKey
      ? (c: any) =>
          typeof c === 'string'
            ? steamClient.findByName(c)
            : steamClient.resolveConfidentMatch(c)
      : undefined;

    const acquisitionService = new CatalogAcquisitionService({
      igdbClient,
      loadExistingCatalog,
      gameSyncService,
      steamEnricher,
      steamClient,
      steamAppResolver,
    });

    const refreshService = new CatalogRefreshService({
      prisma,
      fetchSteamDetails: async (appId: number) => {
        try {
          return await steamClient.details(appId);
        } catch {
          return undefined;
        }
      },
      fetchSteamReviews: async (appId: number) => {
        try {
          return await steamClient.reviews(appId);
        } catch {
          return undefined;
        }
      },
      fetchIgdbGame: async (igdbId: number) => {
        if (!igdbClient) return undefined;
        try {
          const query = `fields id, name, slug, summary, rating, rating_count, total_rating, total_rating_count, first_release_date, cover.url, artworks.url, videos.video_id, videos.name, external_games.uid, external_games.external_game_source.name, involved_companies.developer, involved_companies.publisher, involved_companies.company.name; where id = ${igdbId}; limit 1;`;
          const results = await igdbClient.search(query);
          return (results as any[])?.[0];
        } catch {
          return undefined;
        }
      },
    });

    const refreshRunner = async (opts: {
      limit: number;
      apply: boolean;
    }): Promise<MaintenanceRefreshSummary> => {
      console.log(`\n[REFRESH] Planejando refresh (limite: ${opts.limit})...`);
      const manifest = await refreshService.plan({ limit: opts.limit });
      if (!opts.apply) {
        return {
          requested: manifest.requested,
          processed: manifest.processed,
          updated: 0,
          noChange: manifest.noChangeCount,
          failed: manifest.failedCount,
          status: manifest.failedCount > 0 ? (manifest.eligibleForRefresh > 0 ? 'PARTIAL' : 'FAIL') : 'PASS',
        };
      }
      console.log(`[REFRESH] Aplicando refresh para ${manifest.eligibleForRefresh} elegíveis...`);
      const result = await refreshService.apply(manifest, { limit: opts.limit });
      return {
        requested: result.requested,
        processed: result.processed,
        updated: result.updated,
        noChange: result.noChange,
        failed: result.failed,
        status: result.failed > 0 ? (result.updated > 0 ? 'PARTIAL' : 'FAIL') : 'PASS',
      };
    };

    const acquisitionRunner = async (opts: {
      limit: number;
      apply: boolean;
      snapshotPath?: string;
    }): Promise<MaintenanceAcquisitionSummary> => {
      console.log(`\n[ACQUISITION] Planejando pool e identificando candidatos (limite: ${opts.limit})...`);
      const manifest = await acquisitionService.plan({
        snapshotPath: opts.snapshotPath,
        steamAppResolver,
      });

      const catalogCountBefore = await prisma.game.count();
      const plan = createCatalogAcquisitionBatchPlan(manifest, {
        limit: opts.limit,
        catalogCountBefore,
      });

      console.log(`[ACQUISITION] Executando lote ${opts.apply ? 'APPLY' : 'DRY-RUN'} (${plan.selected.length} itens)...`);
      const result = await runCatalogAcquisitionBatch(
        plan,
        {
          catalogCount: () => prisma.game.count(),
          revalidate: async (item) => {
            const candidate = item.candidate;
            const catalog = await loadExistingCatalog();
            const dedupe = dedupeCandidate(
              {
                igdbId: candidate.igdbId,
                steamAppId: candidate.steamAppId,
                steamAppIds: [...candidate.steamAppIds],
                name: candidate.name,
                slug: candidate.slug,
              },
              catalog,
            );

            const appIds = [
              ...new Set([
                ...(candidate.steamAppId ? [candidate.steamAppId] : []),
                ...candidate.steamAppIds,
              ]),
            ];

            if (appIds.length === 0 && candidate.steamEvidenceStatus === 'NON_STEAM' && steamKey) {
              try {
                const matchResult = await steamClient.resolveConfidentMatch({
                  name: candidate.name,
                  releaseDate: candidate.releaseDate,
                  releaseYear: candidate.releaseYear,
                  developer: candidate.studio,
                  publisher: candidate.publisher,
                  platforms: candidate.platforms,
                });
                if (matchResult.status === 'CONFIDENT_MATCH' && matchResult.appId) {
                  appIds.push(matchResult.appId);
                }
              } catch {}
            }

            let steamQualityGatePassed = true;
            let steamReason: string | undefined;
            if (appIds.length > 0) {
              const reviews = [];
              for (const appId of appIds) {
                try {
                  const review = await steamClient.reviews(appId);
                  if (review) reviews.push(review);
                } catch {}
              }
              reviews.sort((a, b) => b.totalReviews - a.totalReviews);
              const best = reviews[0];
              steamQualityGatePassed = steamGatePassed(
                best?.totalReviews,
                best?.positivePercentage,
              );
              if (!steamQualityGatePassed) {
                steamReason = `Current Steam gate failed (reviews: ${best?.totalReviews ?? 'N/A'}, positive: ${best?.positivePercentage ?? 'N/A'}).`;
              }
            }

            return {
              dedupeStatus: dedupe.dedupeStatus,
              identityMatches:
                Number.isSafeInteger(candidate.igdbId) &&
                candidate.igdbId > 0 &&
                candidate.name.trim().length > 0 &&
                candidate.slug.trim().length > 0,
              finalEligible:
                candidate.bucket === 'READY' &&
                candidate.finalEligible === true &&
                steamQualityGatePassed,
              steamQualityGatePassed,
              reason: dedupe.dedupeReason ?? steamReason,
            };
          },
          applyCandidate: (item) =>
            acquisitionService.apply(manifest, {
              limit: 1,
              candidates: [item.candidate as EvaluatedCandidate],
            }),
          readPersisted: async (item) => {
            const candidate = item.candidate;
            const record = await prisma.game.findUnique({
              where: { igdbId: candidate.igdbId },
              include: { media: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
            });
            const primaryMedia = record?.media.find(
              (media) => media.type === 'TRAILER' || media.type === 'GAMEPLAY',
            );
            return {
              identityMatches: Boolean(
                record &&
                  record.igdbId === candidate.igdbId &&
                  record.title === candidate.name &&
                  record.slug === candidate.slug &&
                  (candidate.steamAppId === undefined
                    ? candidate.steamEvidenceStatus === 'NON_STEAM'
                      ? record.steamAppId === null
                      : true
                    : record.steamAppId === candidate.steamAppId),
              ),
              primaryVideoId: primaryMedia ? describeTrailer(primaryMedia.url).videoId : undefined,
            };
          },
          readApiPrimaryVideoId: async (item) => {
            const record = await prisma.game.findUnique({
              where: { igdbId: item.candidate.igdbId },
              select: { id: true },
            });
            if (!record) return undefined;
            const apiGame = await gameService.getGameById(record.id);
            return apiGame?.primaryTrailer?.videoId;
          },
          readPostWriteDedupe: async (item) => {
            const candidate = item.candidate;
            const catalog = await loadExistingCatalog();
            return dedupeCandidate(
              {
                igdbId: candidate.igdbId,
                steamAppId: candidate.steamAppId,
                steamAppIds: [...candidate.steamAppIds],
                name: candidate.name,
                slug: candidate.slug,
              },
              catalog,
            ).dedupeStatus;
          },
        },
        { apply: opts.apply },
      );

      return {
        requested: result.requested,
        processed: result.processed,
        inserted: result.inserted,
        skipped: result.skippedAlreadyExists + result.skippedAmbiguous,
        ambiguous: result.skippedAmbiguous,
        failed: result.failed,
        status: result.result,
      };
    };

    const lock = new FileMaintenanceLock();
    const maintenanceService = new CatalogMaintenanceService({
      prisma,
      lock,
      refreshRunner,
      acquisitionRunner,
    });

    const report = await maintenanceService.maintain({
      mode,
      apply,
      refreshLimit,
      acquisitionLimit,
      snapshotPath,
    });

    console.log(`\n${formatCatalogMaintenanceReport(report)}\n`);

    if (report.maintenanceResult === 'FAIL') {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1]?.endsWith('catalog-maintenance.ts') ||
  process.argv[1]?.endsWith('catalog-maintenance.js')
) {
  main().catch((err) => {
    console.error('Falha na execução de manutenção:', err);
    process.exit(1);
  });
}
