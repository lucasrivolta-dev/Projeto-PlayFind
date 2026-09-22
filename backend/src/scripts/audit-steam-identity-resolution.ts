import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { SteamClient } from '../modules/integrations/steam/steam.client.js';
import { CatalogAcquisitionService } from '../modules/sync/catalog-acquisition.service.js';

async function main() {
  const prisma = new PrismaClient();
  const steamKey = process.env.STEAM_API_KEY || '';
  const steamClient = new SteamClient(steamKey);

  console.log('='.repeat(80));
  console.log('AUDITORIA READ-ONLY: OVERWATCH & CANDIDATOS NON_STEAM');
  console.log('='.repeat(80));

  // 1. Audit Overwatch in current DB
  const overwatch = await prisma.game.findFirst({
    where: { OR: [{ title: 'Overwatch' }, { igdbId: 8173 }] },
    include: { steamOffers: true, storeOffers: true },
  });

  console.log('\n[1] OVERWATCH NO BANCO ATUAL:');
  if (overwatch) {
    console.log('ID:', overwatch.id);
    console.log('Title:', overwatch.title);
    console.log('IGDB ID:', overwatch.igdbId);
    console.log('steamAppId no banco:', overwatch.steamAppId);
    console.log('steamOffers count:', overwatch.steamOffers.length);
    console.log('steamOffers detail:', JSON.stringify(overwatch.steamOffers, null, 2));
    console.log('storeOffers count:', overwatch.storeOffers.length);
    console.log('storeOffers detail:', JSON.stringify(overwatch.storeOffers, null, 2));
  } else {
    console.log('Overwatch não encontrado no banco.');
  }

  // 2. Audit confident match resolution on sample of NON_STEAM candidates
  console.log('\n[2] AUDITORIA DE CANDIDATOS NON_STEAM CONTRA RESOLVER:');
  const dbGames = await prisma.game.findMany({
    select: { id: true, title: true, slug: true, igdbId: true, steamAppId: true },
  });
  const service = new CatalogAcquisitionService({
    loadExistingCatalog: async () => dbGames,
  });
  const manifest = await service.plan({
    snapshotPath: 'reports/catalog-acquisition-v1/audited-raw.json',
  });

  const nonSteamCandidates = manifest.evaluated.filter(
    (c) => c.steamEvidenceStatus === 'NON_STEAM' && c.dedupeStatus === 'NEW',
  );
  console.log(`Total candidatos NON_STEAM novos avaliados no pool: ${nonSteamCandidates.length}`);

  // Test sample of 25 candidates
  const sample = nonSteamCandidates.slice(0, 25);
  let totalSearchedWithResult = 0;
  let confidentCount = 0;
  let ambiguousCount = 0;
  let noMatchCount = 0;

  const results: Array<{
    name: string;
    igdbId: number;
    year: number | null;
    status: string;
    appId?: number;
    reasons: string[];
  }> = [];

  for (const c of sample) {
    const res = await steamClient.resolveConfidentMatch({
      name: c.name,
      releaseDate: c.releaseDate,
      releaseYear: c.releaseYear,
      developer: c.studio,
      publisher: c.publisher,
      platforms: c.platforms,
    });

    if (res.status !== 'NO_MATCH' || !res.reasons.some(r => r.includes('Nenhum app Steam encontrado'))) {
      totalSearchedWithResult++;
    }

    if (res.status === 'CONFIDENT_MATCH') confidentCount++;
    else if (res.status === 'AMBIGUOUS') ambiguousCount++;
    else noMatchCount++;

    results.push({
      name: c.name,
      igdbId: c.igdbId,
      year: c.releaseYear,
      status: res.status,
      appId: res.appId,
      reasons: res.reasons,
    });
  }

  console.log(`\nAmostra testada: ${sample.length}`);
  console.log(`Searches que produziram algum resultado Steam: ${totalSearchedWithResult}`);
  console.log(`CONFIDENT_MATCH: ${confidentCount}`);
  console.log(`AMBIGUOUS: ${ambiguousCount}`);
  console.log(`NO_MATCH: ${noMatchCount}`);

  console.log('\nExemplos detalhados:');
  for (const r of results) {
    console.log(`- [${r.status}] "${r.name}" (${r.year ?? 'N/A'}, IGDB: ${r.igdbId}) ${r.appId ? '-> AppID ' + r.appId : ''} | Razões: ${r.reasons.join('; ')}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
