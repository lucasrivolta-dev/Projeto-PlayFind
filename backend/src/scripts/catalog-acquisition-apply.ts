import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';
import { SteamClient } from '../modules/integrations/steam/steam.client.js';
import { enrichWithSteam } from '../modules/integrations/steam/steam.mapper.js';
import { PrismaGameRepository } from '../modules/games/prisma-game.repository.js';
import { GameService } from '../modules/games/game.service.js';
import { describeTrailer } from '../modules/games/normalized-game.js';
import { GameSyncService } from '../modules/sync/game-sync.service.js';
import { CatalogAcquisitionService } from '../modules/sync/catalog-acquisition.service.js';
import {
  createCatalogAcquisitionBatchPlan,
  formatCatalogAcquisitionBatchPlan,
  formatCatalogAcquisitionBatchResult,
  runCatalogAcquisitionBatch,
  steamGatePassed,
} from '../modules/sync/catalog-acquisition-batch.js';
import { dedupeCandidate } from '../modules/sync/catalog-hygiene.service.js';
import type { NormalizedGame } from '../modules/games/normalized-game.js';
import {
  formatSelectedCanary,
  parseCatalogAcquisitionApplyArgs,
  selectExactCanary,
} from './catalog-acquisition-apply-selection.js';

async function main() {
  const options = parseCatalogAcquisitionApplyArgs(process.argv.slice(2));
  const { limit, igdbId, snapshotPath, batch, apply, dryRun } = options;

  console.log('='.repeat(80));
  console.log(
    batch
      ? `NEXTPLAY — CATALOG ACQUISITION BATCH ${dryRun ? 'DRY-RUN' : 'APPLY'} (LIMIT: ${limit})`
      : `NEXTPLAY — CATALOG ACQUISITION APPLY (LIMIT: ${limit})`,
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
    const client = clientId && clientSecret ? new IgdbClient(clientId, clientSecret) : undefined;

    const repository = new PrismaGameRepository(prisma);
    const gameSyncService = new GameSyncService(repository);
    const gameService = new GameService(prisma);

    const steamKey = process.env.STEAM_API_KEY;
    const steamClient = new SteamClient(steamKey ?? '');
    const steamEnricher = async (game: NormalizedGame) => {
      try {
        const appId =
          game.steamAppId ??
          (game.steamAppIds?.length
            ? await steamClient.resolvePrimaryApp(game.title, game.steamAppIds)
            : steamKey
              ? await steamClient.findByName(game.title)
              : undefined);
        if (!appId) return game;
        const details = await steamClient.details(appId);
        return enrichWithSteam(game, appId, details);
      } catch {
        return game;
      }
    };

    const loadExistingCatalog = async () => {
      const dbGames = await prisma.game.findMany({
        select: { id: true, title: true, slug: true, igdbId: true, steamAppId: true },
      });
      return dbGames;
    };

    const service = new CatalogAcquisitionService({
      igdbClient: client,
      loadExistingCatalog,
      gameSyncService,
      steamEnricher,
    });

    console.log('\n[1/3] Planejando pool e identificando candidatos READY...');
    const manifest = await service.plan({ snapshotPath });
    console.log(
      `-> Pool descoberto: ${manifest.totals.discovered} | READY: ${manifest.totals.ready}`,
    );

    if (batch) {
      const catalogCountBefore = await prisma.game.count();
      const plan = createCatalogAcquisitionBatchPlan(manifest, {
        limit,
        catalogCountBefore,
      });
      console.log(`\n${formatCatalogAcquisitionBatchPlan(plan)}\n`);

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
            let steamQualityGatePassed = true;
            let steamReason: string | undefined;
            if (appIds.length > 0) {
              const reviews = [];
              for (const appId of appIds) {
                try {
                  const review = await steamClient.reviews(appId);
                  if (review) reviews.push(review);
                } catch {
                  // Missing current evidence fails closed below.
                }
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
                candidate.dedupeStatus === 'NEW',
              steamQualityGatePassed,
              reason: dedupe.dedupeReason ?? steamReason,
            };
          },
          applyCandidate: async (item) =>
            service.apply(manifest, {
              limit: 1,
              candidates: [
                item.candidate as import('../modules/sync/catalog-acquisition.service.js').EvaluatedCandidate,
              ],
              loadExistingCatalog,
              gameSyncService,
              steamEnricher,
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
                (candidate.steamAppId === undefined || record.steamAppId === candidate.steamAppId),
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
        { apply },
      );

      console.log(`\n${formatCatalogAcquisitionBatchResult(result)}`);
      if (result.result !== 'PASS') process.exitCode = 1;
      return;
    }

    const selectedCandidate =
      igdbId === undefined ? undefined : selectExactCanary(manifest, igdbId);
    if (selectedCandidate) console.log(`\n${formatSelectedCanary(selectedCandidate)}\n`);

    console.log(`\n[2/3] Aplicando ingestão controlada (limite: ${limit})...`);
    const result = await service.apply(manifest, {
      limit,
      ...(selectedCandidate ? { candidates: [selectedCandidate] } : {}),
      loadExistingCatalog,
      gameSyncService,
      steamEnricher,
    });

    console.log('\n[3/3] Relatório de Ingestão:');
    console.log(`- Solicitados: ${result.requested}`);
    console.log(`- Processados: ${result.processed}`);
    console.log(`- Inseridos  : ${result.inserted}`);
    console.log(`- Já existentes (pulados): ${result.skippedAlreadyExists}`);
    console.log(`- Ambíguos (pulados)     : ${result.skippedAmbiguous}`);
    console.log(`- Falhas     : ${result.failed}`);

    console.log('\nResultados detalhados:');
    for (const r of result.results) {
      console.log(
        `[${r.status}] IGDB ${r.igdbId} - ${r.name}${r.reason ? ` (${r.reason})` : ''}${r.error ? ` [ERRO: ${r.error}]` : ''}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Falha na execução de apply:', err);
  process.exit(1);
});
