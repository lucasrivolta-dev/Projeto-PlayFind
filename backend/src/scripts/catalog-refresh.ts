import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';
import { SteamClient } from '../modules/integrations/steam/steam.client.js';
import {
  CatalogRefreshService,
  formatCatalogRefreshPlan,
  formatCatalogRefreshResult,
  validateCatalogRefreshLimit,
} from '../modules/sync/catalog-refresh.service.js';

export interface CatalogRefreshCliOptions {
  limit: number;
  apply: boolean;
  gameId?: string;
  igdbId?: number;
  steamAppId?: number;
}

export function parseCatalogRefreshArgs(args: string[]): CatalogRefreshCliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const argv = args[0] === '--' ? args.slice(1) : args;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply' || arg === '--refresh') {
      if (flags.has(arg)) throw new Error(`ERRO: ${arg} duplicado.`);
      flags.add(arg);
      continue;
    }
    if (
      arg !== '--limit' &&
      arg !== '--game-id' &&
      arg !== '--igdb-id' &&
      arg !== '--steam-app-id'
    ) {
      throw new Error(`ERRO: argumento desconhecido para refresh: ${arg}.`);
    }
    if (values.has(arg)) throw new Error(`ERRO: ${arg} duplicado.`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`ERRO: ${arg} requer um valor.`);
    values.set(arg, value);
  }

  const limitRaw = values.get('--limit');
  if (!limitRaw) throw new Error('ERRO: Refresh requer argumento explícito --limit <N>.');
  const limit = Number(limitRaw);
  validateCatalogRefreshLimit(limit);

  const gameId = values.get('--game-id');
  const igdbIdRaw = values.get('--igdb-id');
  const igdbId = igdbIdRaw !== undefined ? Number(igdbIdRaw) : undefined;
  if (igdbId !== undefined && (!Number.isSafeInteger(igdbId) || igdbId <= 0)) {
    throw new Error(`ERRO: --igdb-id deve ser um número inteiro positivo. Recebido: ${igdbIdRaw}`);
  }

  const steamAppIdRaw = values.get('--steam-app-id');
  const steamAppId = steamAppIdRaw !== undefined ? Number(steamAppIdRaw) : undefined;
  if (steamAppId !== undefined && (!Number.isSafeInteger(steamAppId) || steamAppId <= 0)) {
    throw new Error(
      `ERRO: --steam-app-id deve ser um número inteiro positivo. Recebido: ${steamAppIdRaw}`,
    );
  }

  return {
    limit,
    apply: flags.has('--apply'),
    gameId,
    igdbId,
    steamAppId,
  };
}

async function main() {
  const options = parseCatalogRefreshArgs(process.argv.slice(2));
  const { limit, apply, gameId, igdbId, steamAppId } = options;

  console.log('='.repeat(80));
  console.log(
    `NEXTPLAY — CATALOG REFRESH ${apply ? 'APPLY' : 'DRY-RUN'} (LIMIT: ${limit})`,
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
    const igdbClient =
      clientId && clientSecret ? new IgdbClient(clientId, clientSecret) : undefined;

    const steamKey = process.env.STEAM_API_KEY;
    const steamClient = new SteamClient(steamKey ?? '');

    const service = new CatalogRefreshService({
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

    console.log('\n[1/2] Planejando refresh (read-only)...');
    const manifest = await service.plan({
      limit,
      gameId,
      igdbId,
      steamAppId,
    });

    console.log(`\n${formatCatalogRefreshPlan(manifest)}\n`);

    if (!apply) {
      console.log('\n[DRY-RUN] Nenhuma alteração aplicada. Para aplicar, use a flag --apply.');
      return;
    }

    console.log(`\n[2/2] Aplicando refresh para ${manifest.eligibleForRefresh} jogo(s) elegível(is)...`);
    const result = await service.apply(manifest, { limit });
    console.log(`\n${formatCatalogRefreshResult(result)}\n`);

    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('catalog-refresh.ts') || process.argv[1]?.endsWith('catalog-refresh.js')) {
  main().catch((err) => {
    console.error('Falha na execução de Catalog Refresh:', err);
    process.exit(1);
  });
}
