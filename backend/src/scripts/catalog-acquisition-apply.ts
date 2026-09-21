import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';
import { SteamClient } from '../modules/integrations/steam/steam.client.js';
import { enrichWithSteam } from '../modules/integrations/steam/steam.mapper.js';
import { PrismaGameRepository } from '../modules/games/prisma-game.repository.js';
import { GameSyncService } from '../modules/sync/game-sync.service.js';
import { CatalogAcquisitionService } from '../modules/sync/catalog-acquisition.service.js';
import type { NormalizedGame } from '../modules/games/normalized-game.js';

async function main() {
  const args = process.argv.slice(2);
  const applyFlag = args.includes('--apply');
  const limitArgIndex = args.indexOf('--limit');
  const snapshotArgIndex = args.indexOf('--snapshot');

  const snapshotPath = snapshotArgIndex >= 0 ? args[snapshotArgIndex + 1] : undefined;
  if (snapshotArgIndex >= 0 && !snapshotPath) {
    console.error('ERRO: --snapshot requer um caminho válido.');
    process.exit(1);
  }

  // Mandatory --apply flag
  if (!applyFlag) {
    console.error('ERRO: Ingestão requer flag explícita --apply para executar gravações.');
    console.error('Uso: pnpm tsx src/scripts/catalog-acquisition-apply.ts --apply --limit <N> [--snapshot <path>]');
    process.exit(1);
  }

  // Mandatory positive integer --limit flag
  if (limitArgIndex < 0 || limitArgIndex + 1 >= args.length) {
    console.error('ERRO: Modo de escrita requer argumento explícito --limit <N>.');
    process.exit(1);
  }

  const limitRaw = args[limitArgIndex + 1];
  const limit = Number(limitRaw);
  if (!/^\d+$/.test(limitRaw) || !Number.isSafeInteger(limit) || limit <= 0) {
    console.error(`ERRO: --limit deve ser um número inteiro positivo. Recebido: "${limitRaw}".`);
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log(`NEXTPLAY — CATALOG ACQUISITION APPLY (LIMIT: ${limit})`);
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
    console.log(`-> Pool descoberto: ${manifest.totals.discovered} | READY: ${manifest.totals.ready}`);

    console.log(`\n[2/3] Aplicando ingestão controlada (limite: ${limit})...`);
    const result = await service.apply(manifest, {
      limit,
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
