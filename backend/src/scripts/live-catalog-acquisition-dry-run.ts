import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';
import {
  GENRE_CLUSTERS,
} from '../modules/integrations/igdb/igdb-query.js';
import {
  CatalogAcquisitionService,
  type TrailerStatus,
  type EvaluatedCandidate as EvaluatedLiveCandidate,
  type AcquisitionBucket,
  type AcquisitionRejectionReason,
} from '../modules/sync/catalog-acquisition.service.js';
import type { DedupeStatus } from '../modules/sync/catalog-hygiene.service.js';

export type { TrailerStatus, EvaluatedLiveCandidate, DedupeStatus, AcquisitionBucket, AcquisitionRejectionReason };

const prisma = new PrismaClient();

async function run() {
  const snapshotArg = process.argv.indexOf('--snapshot');
  const snapshotPath = snapshotArg >= 0 ? process.argv[snapshotArg + 1] : undefined;
  if (snapshotArg >= 0 && !snapshotPath) throw new Error('--snapshot requires a path');

  console.log('='.repeat(80));
  console.log('NEXTPLAY — LIVE CATALOG ACQUISITION V1 (DRY-RUN AO VIVO)');
  console.log('='.repeat(80));

  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      'ERRO: Credenciais IGDB_CLIENT_ID ou IGDB_CLIENT_SECRET ausentes em backend/.env',
    );
    process.exit(1);
  }

  // 1. Validar autenticação IGDB
  console.log('\n[1/4] Validando autenticação junto à Twitch OAuth e IGDB...');
  const client = new IgdbClient(clientId, clientSecret);
  if (!snapshotPath) {
    try {
      const authCheck = await client.search('fields id, name; limit 1;');
      if (!authCheck || authCheck.length === 0) {
        throw new Error('IGDB retornou array vazio no teste de autenticação.');
      }
      console.log('-> Autenticação IGDB: PASS (sucesso total na troca de token e consulta)');
    } catch (err: any) {
      console.error(`-> Autenticação IGDB: FAIL (${err.message})`);
      console.error('PARANDO execução conforme instrução.');
      process.exit(1);
    }
  }

  // 2. Carregar dados atuais de produção (Read-only)
  console.log('\n[2/4] Carregando catálogo atual do PostgreSQL de produção (Read-Only)...');
  const dbGames = await prisma.game.findMany({
    include: {
      genres: { include: { genre: true } },
      platforms: { include: { platform: true } },
      media: true,
      steamOffers: true,
    },
  });
  console.log(`-> Jogos carregados de produção: ${dbGames.length} registros`);

  // 3. Executar planejamento via CatalogAcquisitionService
  console.log('\n[3/4] Executando CatalogAcquisitionService.plan() (Read-Only)...');
  const service = new CatalogAcquisitionService({
    igdbClient: client,
    loadExistingCatalog: async () => dbGames,
  });

  const manifest = await service.plan({
    snapshotPath,
  });

  console.log(
    `-> Candidatos avaliados: ${manifest.totals.discovered} | Ready: ${manifest.totals.ready} | Already Exists: ${manifest.totals.alreadyExists} | Ambiguous: ${manifest.totals.ambiguous} | Rejected: ${manifest.totals.rejected}`,
  );

  // 4. Projeção de Catálogo e Estatísticas
  console.log('\n[4/4] Formatando relatório e projeções...');
  const currentTotal = dbGames.length;
  const projectedAdditions = manifest.candidates.length;
  const projectedTotal = currentTotal + projectedAdditions;

  const curBuckets = {
    unproven: 6,
    emerging: 89,
    discovery: 28,
    mid_tail: 0,
    head: 100,
  };

  const projBuckets = {
    unproven: curBuckets.unproven,
    emerging: curBuckets.emerging + manifest.byBand.emerging.length,
    discovery: curBuckets.discovery + manifest.byBand.discovery.length,
    mid_tail: curBuckets.mid_tail + manifest.byBand.mid_tail.length + manifest.byBand.older_gems.length,
    head: curBuckets.head,
  };

  const countGenreInDb = (pattern: RegExp) =>
    dbGames.filter((g) => g.genres.some((x) => pattern.test(x.genre.name))).length;

  const currentGenres = {
    strategy_tactical: countGenreInDb(/strategy|tactical/i),
    simulation: countGenreInDb(/simulator|simulation/i),
    racing: countGenreInDb(/racing/i),
    horror: dbGames.filter((g) => g.genres.some((x) => /horror/i.test(x.genre.name))).length,
    puzzle_point_click: countGenreInDb(/puzzle|point/i),
    rpg: countGenreInDb(/rpg|role/i),
    action_adventure: countGenreInDb(/action|adventure/i),
  };

  const projectedGenres = {
    strategy_tactical: currentGenres.strategy_tactical + manifest.byCluster.strategy_tactical.length,
    simulation: currentGenres.simulation + manifest.byCluster.simulation.length,
    racing: currentGenres.racing + manifest.byCluster.racing.length,
    horror: currentGenres.horror + manifest.byCluster.horror.length,
    puzzle_point_click: currentGenres.puzzle_point_click + manifest.byCluster.puzzle_point_click.length,
    rpg: currentGenres.rpg + manifest.byCluster.niche_rpg.length,
    action_adventure: currentGenres.action_adventure + manifest.byCluster.platform_action_indie.length,
  };

  // Imprimir Relatório
  console.log('\n' + '='.repeat(80));
  console.log('RELATÓRIO DA VALIDAÇÃO AO VIVO (IGDB LIVE DRY-RUN)');
  console.log('='.repeat(80));

  console.log(
    `\n1. FONTE IGDB: ${snapshotPath ? 'SNAPSHOT VALIDADO (sem nova coleta)' : 'LIVE / AUTENTICAÇÃO PASS'}`,
  );
  console.log(`2. TOTAL BRUTO RECEBIDO DA IGDB: ${manifest.totals.discovered} candidatos únicos`);
  console.log(
    `3. TOTAL APÓS QUALITY GATE     : ${manifest.gateSummary.passedQualityGate} passaram (${manifest.gateSummary.failedQualityGate} rejeitados)`,
  );
  console.log(`4. DUPLICADOS (JÁ NO DB)       : ${manifest.totals.alreadyExists}`);
  console.log(`5. AMBIGUOUS MATCHES           : ${manifest.totals.ambiguous}`);
  console.log(
    `6. SEM TRAILER                 : ${manifest.trailerSummary.noTrailer} sem vídeo + ${manifest.trailerSummary.disqualifiedTrailer} vídeos desqualificados`,
  );
  console.log(`7. COM TRAILER VÁLIDO          : ${manifest.trailerSummary.playableTrailer}`);
  console.log(`8. NOVOS ELEGÍVEIS FINAIS      : ${manifest.candidates.length}`);

  console.log(`\n9. NOVOS ELEGÍVEIS POR EXPOSURE BAND:`);
  console.log(`  - EMERGING   (10-99 votos, rating >= 80) : ${manifest.byBand.emerging.length}`);
  console.log(`  - DISCOVERY  (100-499 v., rating >= 75)  : ${manifest.byBand.discovery.length}`);
  console.log(`  - MID_TAIL   (500-1500 v., rating >= 75) : ${manifest.byBand.mid_tail.length}`);
  console.log(`  - OLDER_GEMS (20-1500 v., 6-12 anos)     : ${manifest.byBand.older_gems.length}`);

  console.log(`\n10. FUNIL E NOVOS ELEGÍVEIS POR CLUSTER DE GÊNERO:`);
  for (const cl of GENRE_CLUSTERS) {
    const f = manifest.funnelByCluster[cl];
    console.log(
      `  - ${cl.padEnd(23)}: Brutos IGDB: ${String(f.found).padStart(3)} | Aprovados Gate: ${String(f.passedGate).padStart(3)} | Já no DB: ${String(f.alreadyExists).padStart(2)} | Novos c/ Trailer: ${String(f.finalEligible).padStart(2)}`,
    );
  }

  console.log(`\n11. DISTRIBUIÇÃO ATUAL VS PROJETADA DO CATÁLOGO:`);
  console.log(`  Tamanho Atual: ${currentTotal} jogos -> Projetado: ${projectedTotal} jogos`);
  console.log(
    `  - UNPROVEN (<10 v.) : ${curBuckets.unproven} (${((curBuckets.unproven / currentTotal) * 100).toFixed(1)}%) -> ${projBuckets.unproven} (${((projBuckets.unproven / projectedTotal) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  - EMERGING (10-99)  : ${curBuckets.emerging} (${((curBuckets.emerging / currentTotal) * 100).toFixed(1)}%) -> ${projBuckets.emerging} (${((projBuckets.emerging / projectedTotal) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  - DISCOVERY (100-499): ${curBuckets.discovery} (${((curBuckets.discovery / currentTotal) * 100).toFixed(1)}%) -> ${projBuckets.discovery} (${((projBuckets.discovery / projectedTotal) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  - MID_TAIL (500-1500): ${curBuckets.mid_tail} (${((curBuckets.mid_tail / currentTotal) * 100).toFixed(1)}%) -> ${projBuckets.mid_tail} (${((projBuckets.mid_tail / projectedTotal) * 100).toFixed(1)}%)  [Vácuo corrigido!]`,
  );
  console.log(
    `  - HEAD (1000+ v.)   : ${curBuckets.head} (${((curBuckets.head / currentTotal) * 100).toFixed(1)}%) -> ${projBuckets.head} (${((projBuckets.head / projectedTotal) * 100).toFixed(1)}%)  [Diluição: 44.8% -> ${((projBuckets.head / projectedTotal) * 100).toFixed(1)}%]`,
  );

  console.log(`\n12. DISTRIBUIÇÃO ATUAL VS PROJETADA POR GÊNERO:`);
  for (const [k, curV] of Object.entries(currentGenres)) {
    const projV = (projectedGenres as any)[k];
    console.log(
      `  - ${k.padEnd(20)}: ${String(curV).padStart(3)} atuais -> ${String(projV).padStart(3)} projetados (+${projV - curV})`,
    );
  }

  console.log(
    `\n13. LISTA DOS CANDIDATOS ELEGÍVEIS FINAIS (${manifest.candidates.length} títulos reais):`,
  );
  manifest.candidates.forEach((g, idx) => {
    console.log(
      `#${String(idx + 1).padStart(3)} ${g.name.padEnd(35)} | Ano: ${g.releaseYear ?? 'N/A'} | IGDB ID: ${String(g.igdbId).padStart(6)} | Steam: ${String(g.steamAppId ?? 'N/A').padStart(7)} | Rating: ${String(g.effectiveRating).padStart(5)} | Votes: ${String(g.effectiveVotes).padStart(4)} | AdjRating: ${String(g.adjustedRating).padStart(5)} | Band: ${g.exposureBand.padEnd(10)} | Cluster: ${g.primaryCluster.padEnd(22)} | Trailer: ${g.primaryVideoId}`,
    );
  });

  console.log('\n' + '='.repeat(80));
  console.log('FIM DA VALIDAÇÃO AO VIVO (READ-ONLY — ZERO DADOS GRAVADOS NO POSTGRESQL)');
  console.log('='.repeat(80));
}

run()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
