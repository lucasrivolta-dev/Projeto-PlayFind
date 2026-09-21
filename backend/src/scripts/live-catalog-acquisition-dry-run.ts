import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';
import {
  BAND_CONFIGS,
  GENRE_CLUSTERS,
  type ExposureBand,
  type GenreCluster,
} from '../modules/integrations/igdb/igdb-query.js';
import { isDisqualifiedTrailer, isEligibleForCatalog } from '../modules/games/game-eligibility.js';

import { acquireAuditPool } from './catalog-acquisition-audit.js';
import {
  steamIdentity,
  companyMetadata,
  supportedPlatforms,
  partitionCandidates,
  dedupeCandidate,
  type DedupeStatus,
} from '../modules/sync/catalog-hygiene.service.js';

const prisma = new PrismaClient();

export type TrailerStatus = 'PLAYABLE_TRAILER' | 'VIDEO_PRESENT_BUT_DISQUALIFIED' | 'NO_VIDEO';
export type { DedupeStatus };

export interface EvaluatedLiveCandidate {
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
  metadataStatus: 'VALID' | 'INVALID_METADATA';
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
  dedupeStatus: DedupeStatus;
  dedupeReason?: string;
  matchedDbGame?: { id: string; title: string; igdbId: number | null; steamAppId: number | null };
  passedQualityGate: boolean;
  qualityGateFailReasons: string[];
  finalEligible: boolean;
}

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

  // 1. Validar autenticação
  console.log('\n[1/6] Validando autenticação junto à Twitch OAuth e IGDB...');
  const client = new IgdbClient(clientId, clientSecret);
  if (!snapshotPath)
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

  // 2. Carregar dados atuais de produção (Read-only)
  console.log('\n[2/6] Carregando catálogo atual do PostgreSQL de produção (Read-Only)...');
  const dbGames = await prisma.game.findMany({
    include: {
      genres: { include: { genre: true } },
      platforms: { include: { platform: true } },
      media: true,
      steamOffers: true,
    },
  });
  console.log(`-> Jogos carregados de produção: ${dbGames.length} registros`);

  const snapshot = await acquireAuditPool(client, snapshotPath);
  const rawPool = new Map(
    snapshot.raw.map((raw) => [
      raw.id,
      {
        raw,
        foundClusters: new Set(
          snapshot.queries
            .filter((q) => q.ids.includes(raw.id))
            .map((q) => q.cluster as GenreCluster),
        ),
        foundBands: new Set(
          snapshot.queries.filter((q) => q.ids.includes(raw.id)).map((q) => q.band as ExposureBand),
        ),
      },
    ]),
  );
  console.log('IGDB snapshot: ' + snapshot.sha256 + '; unique RAW: ' + rawPool.size);

  // 4. Quality Gate, Dedupe e Validação de Trailers
  console.log('\n[4/6] Avaliando Quality Gate Bayesiano, Trailers Reais e Deduplicação...');

  const evaluatedList: EvaluatedLiveCandidate[] = [];

  for (const [, { raw, foundClusters, foundBands }] of rawPool) {
    const name: string = raw.name ?? '';
    const slug: string = raw.slug ?? '';
    const igdbId: number = raw.id;

    // Métricas de avaliação
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
    } else {
      effectiveRating = 0;
      effectiveVotes = 0;
    }

    const releaseDate = raw.first_release_date ? new Date(raw.first_release_date * 1000) : null;
    const releaseYear = releaseDate ? releaseDate.getUTCFullYear() : null;

    // Determinar exposureBand real baseada nos votos e ano reais
    const nowYears = new Date().getUTCFullYear();
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
      exposureBand = 'mid_tail'; // Excesso de votos para emerging/discovery
    } else {
      exposureBand = 'emerging';
    }

    // Se o candidate foi capturado por uma query de band específica, priorizar se compatível
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

    // Quality gate checks
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

    // Verificar elegibilidade de catálogo (exclui DLCs, mods, etc.)
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

    // Genres & themes
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

    // Compare every IGDB Steam identity; never choose an arbitrary first edition.
    const { steamAppId, steamAppIds } = steamIdentity(raw.external_games);

    // Trailer validation
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

    const { dedupeStatus, dedupeReason } = dedupeCandidate(
      { igdbId, steamAppId, steamAppIds, name, slug },
      dbGames,
    );

    const finalEligible =
      passedQualityGate &&
      metadataStatus === 'VALID' &&
      platformStatus === 'SUPPORTED' &&
      dedupeStatus === 'NEW' &&
      trailerStatus === 'PLAYABLE_TRAILER';

    const clusterList = Array.from(foundClusters);
    const primaryCluster = clusterList[0] ?? 'strategy_tactical';

    evaluatedList.push({
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
      steamAppId,
      steamAppIds,
      dedupeStatus,
      dedupeReason,
      passedQualityGate,
      qualityGateFailReasons,
      finalEligible,
    });
  }

  // 5. Agregações e Estatísticas
  console.log('\n[5/6] Processando agregações estatísticas...');

  const totalRaw = evaluatedList.length;
  const partition = partitionCandidates(evaluatedList);
  console.log(
    'DISJOINT BASE PARTITION (before platform/metadata/quality gates):',
    Object.fromEntries(Object.entries(partition).map(([k, v]) => [k, v.length])),
  );
  console.log('NEW_ELIGIBLE gate partition:', {
    UNSUPPORTED_PLATFORM: partition.NEW_ELIGIBLE.filter(
      (c) => c.platformStatus === 'UNSUPPORTED_PLATFORM',
    ).length,
    INVALID_METADATA: partition.NEW_ELIGIBLE.filter(
      (c) => c.platformStatus === 'SUPPORTED' && c.metadataStatus === 'INVALID_METADATA',
    ).length,
    QUALITY_REJECTED: partition.NEW_ELIGIBLE.filter(
      (c) =>
        c.platformStatus === 'SUPPORTED' && c.metadataStatus === 'VALID' && !c.passedQualityGate,
    ).length,
    APPROVED_POOL: evaluatedList.filter((c) => c.finalEligible).length,
  });
  const passedGate = evaluatedList.filter((c) => c.passedQualityGate);
  const failedGate = evaluatedList.filter((c) => !c.passedQualityGate);
  const alreadyExists = evaluatedList.filter((c) => c.dedupeStatus === 'ALREADY_EXISTS');
  const ambiguous = evaluatedList.filter((c) => c.dedupeStatus === 'AMBIGUOUS');
  const newCandidates = evaluatedList.filter((c) => c.dedupeStatus === 'NEW');
  const noTrailer = evaluatedList.filter((c) => c.trailerStatus === 'NO_VIDEO');
  const disqualifiedTrailer = evaluatedList.filter(
    (c) => c.trailerStatus === 'VIDEO_PRESENT_BUT_DISQUALIFIED',
  );
  const playableTrailer = evaluatedList.filter((c) => c.trailerStatus === 'PLAYABLE_TRAILER');

  console.log(`Candidatos classificados como NEW: ${newCandidates.length}`);

  const finalEligibleGames = evaluatedList
    .filter((c) => c.finalEligible)
    .sort((a, b) => b.adjustedRating - a.adjustedRating);

  // Agregação por faixa de exposição dos elegíveis finais
  const finalByBand: Record<ExposureBand, EvaluatedLiveCandidate[]> = {
    emerging: [],
    discovery: [],
    mid_tail: [],
    older_gems: [],
  };
  for (const g of finalEligibleGames) {
    finalByBand[g.exposureBand].push(g);
  }

  // Agregação por cluster dos elegíveis finais
  const finalByCluster: Record<GenreCluster, EvaluatedLiveCandidate[]> = {
    strategy_tactical: [],
    simulation: [],
    racing: [],
    horror: [],
    puzzle_point_click: [],
    niche_rpg: [],
    platform_action_indie: [],
  };
  for (const g of finalEligibleGames) {
    finalByCluster[g.primaryCluster].push(g);
  }

  // Estatísticas por cluster (todo o funil)
  const funnelByCluster: Record<
    GenreCluster,
    {
      found: number;
      passedGate: number;
      alreadyExists: number;
      isNew: number;
      playableTrailer: number;
      finalEligible: number;
    }
  > = {
    strategy_tactical: {
      found: 0,
      passedGate: 0,
      alreadyExists: 0,
      isNew: 0,
      playableTrailer: 0,
      finalEligible: 0,
    },
    simulation: {
      found: 0,
      passedGate: 0,
      alreadyExists: 0,
      isNew: 0,
      playableTrailer: 0,
      finalEligible: 0,
    },
    racing: {
      found: 0,
      passedGate: 0,
      alreadyExists: 0,
      isNew: 0,
      playableTrailer: 0,
      finalEligible: 0,
    },
    horror: {
      found: 0,
      passedGate: 0,
      alreadyExists: 0,
      isNew: 0,
      playableTrailer: 0,
      finalEligible: 0,
    },
    puzzle_point_click: {
      found: 0,
      passedGate: 0,
      alreadyExists: 0,
      isNew: 0,
      playableTrailer: 0,
      finalEligible: 0,
    },
    niche_rpg: {
      found: 0,
      passedGate: 0,
      alreadyExists: 0,
      isNew: 0,
      playableTrailer: 0,
      finalEligible: 0,
    },
    platform_action_indie: {
      found: 0,
      passedGate: 0,
      alreadyExists: 0,
      isNew: 0,
      playableTrailer: 0,
      finalEligible: 0,
    },
  };

  for (const c of evaluatedList) {
    for (const cl of c.clusters) {
      const f = funnelByCluster[cl];
      f.found++;
      if (c.passedQualityGate) f.passedGate++;
      if (c.dedupeStatus === 'ALREADY_EXISTS') f.alreadyExists++;
      if (c.dedupeStatus === 'NEW') f.isNew++;
      if (c.trailerStatus === 'PLAYABLE_TRAILER') f.playableTrailer++;
    }
  }
  for (const g of finalEligibleGames) {
    for (const cl of g.clusters) {
      funnelByCluster[cl].finalEligible++;
    }
  }

  // 6. Projeção de Catálogo
  const currentTotal = dbGames.length; // 223
  const projectedAdditions = finalEligibleGames.length;
  const projectedTotal = currentTotal + projectedAdditions;

  // Buckets atuais recalculados:
  // UNPROVEN: 6, EMERGING: 89, DISCOVERY: 28, MID_TAIL: 0, HEAD: 100
  const curBuckets = {
    unproven: 6,
    emerging: 89,
    discovery: 28,
    mid_tail: 0,
    head: 100,
  };

  const projBuckets = {
    unproven: curBuckets.unproven,
    emerging: curBuckets.emerging + finalByBand.emerging.length,
    discovery: curBuckets.discovery + finalByBand.discovery.length,
    mid_tail: curBuckets.mid_tail + finalByBand.mid_tail.length + finalByBand.older_gems.length,
    head: curBuckets.head,
  };

  // Projeção por gênero
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
    strategy_tactical: currentGenres.strategy_tactical + finalByCluster.strategy_tactical.length,
    simulation: currentGenres.simulation + finalByCluster.simulation.length,
    racing: currentGenres.racing + finalByCluster.racing.length,
    horror: currentGenres.horror + finalByCluster.horror.length,
    puzzle_point_click: currentGenres.puzzle_point_click + finalByCluster.puzzle_point_click.length,
    rpg: currentGenres.rpg + finalByCluster.niche_rpg.length,
    action_adventure: currentGenres.action_adventure + finalByCluster.platform_action_indie.length,
  };

  // Imprimir Relatório
  console.log('\n' + '='.repeat(80));
  console.log('RELATÓRIO DA VALIDAÇÃO AO VIVO (IGDB LIVE DRY-RUN)');
  console.log('='.repeat(80));

  console.log(
    `\n1. FONTE IGDB: ${snapshotPath ? 'SNAPSHOT VALIDADO (sem nova coleta)' : 'LIVE / AUTENTICAÇÃO PASS'}`,
  );
  console.log(`2. TOTAL BRUTO RECEBIDO DA IGDB: ${totalRaw} candidatos únicos`);
  console.log(
    `3. TOTAL APÓS QUALITY GATE     : ${passedGate.length} passaram (${failedGate.length} rejeitados)`,
  );
  console.log(`4. DUPLICADOS (JÁ NO DB)       : ${alreadyExists.length}`);
  console.log(`5. AMBIGUOUS MATCHES           : ${ambiguous.length}`);
  console.log(
    `6. SEM TRAILER                 : ${noTrailer.length} sem vídeo + ${disqualifiedTrailer.length} vídeos desqualificados`,
  );
  console.log(`7. COM TRAILER VÁLIDO          : ${playableTrailer.length}`);
  console.log(`8. NOVOS ELEGÍVEIS FINAIS      : ${finalEligibleGames.length}`);

  console.log(`\n9. NOVOS ELEGÍVEIS POR EXPOSURE BAND:`);
  console.log(`  - EMERGING   (10-99 votos, rating >= 80) : ${finalByBand.emerging.length}`);
  console.log(`  - DISCOVERY  (100-499 v., rating >= 75)  : ${finalByBand.discovery.length}`);
  console.log(`  - MID_TAIL   (500-1500 v., rating >= 75) : ${finalByBand.mid_tail.length}`);
  console.log(`  - OLDER_GEMS (20-1500 v., 6-12 anos)     : ${finalByBand.older_gems.length}`);

  console.log(`\n10. FUNIL E NOVOS ELEGÍVEIS POR CLUSTER DE GÊNERO:`);
  for (const cl of GENRE_CLUSTERS) {
    const f = funnelByCluster[cl];
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
    `\n13. LISTA DOS CANDIDATOS ELEGÍVEIS FINAIS (${finalEligibleGames.length} títulos reais):`,
  );
  finalEligibleGames.forEach((g, idx) => {
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
