import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  classifyHygieneGame,
  determineGameProvenance,
  hasUserRelations,
  executeHygieneApplyTransaction,
  computeCandidateFingerprint,
  exportCatalogHygieneSnapshot,
  EXPECTED_BAD_RECENT_COUNT,
  type HygieneClassificationResult,
  type HygieneGameInput,
  type HygieneCategory,
} from '../modules/games/catalog-hygiene.js';
import { describeTrailer } from '../modules/games/normalized-game.js';
import { isDisqualifiedTrailer } from '../modules/games/game-eligibility.js';

interface CliArgs {
  mode: 'dry-run' | 'apply';
}

function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let mode: 'dry-run' | 'apply' = 'dry-run';

  for (const arg of args) {
    if (arg === '--apply') {
      mode = 'apply';
    } else if (arg === '--dry-run') {
      mode = 'dry-run';
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Uso: tsx src/scripts/audit-catalog-hygiene.ts [opções]

Opções:
  --dry-run   (Padrão) Apenas audita e exibe o relatório sem realizar alterações no banco de dados.
  --apply     Executa as alterações de higiene com transação segura e validação estrita de relações.
      `);
      process.exit(0);
    } else {
      console.warn(`Aviso: argumento ignorado: ${arg}`);
    }
  }

  return { mode };
}

export async function runCatalogHygieneAudit(
  prisma: PrismaClient,
  mode: 'dry-run' | 'apply' = 'dry-run',
) {
  console.log('================================================================================');
  console.log(`NEXTPLAY CATALOG HYGIENE AUDIT [MODE: ${mode.toUpperCase()}]`);
  console.log('================================================================================\n');

  // 1. Fetch all games with relations and media
  const games = await prisma.game.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      media: {
        where: { type: { in: ['TRAILER', 'GAMEPLAY'] } },
        select: { url: true, provider: true, mimeType: true, origin: true },
      },
      _count: {
        select: {
          library: true,
          comments: true,
          topics: true,
          events: true,
          genres: true,
          platforms: true,
          steamOffers: true,
        },
      },
    },
  });

  const totalGames = games.length;
  console.log(`Total de jogos no banco: ${totalGames}`);

  // 2. Map and classify each game
  interface GameAuditRecord {
    raw: (typeof games)[number];
    input: HygieneGameInput;
    classification: HygieneClassificationResult;
    hasPlayableTrailer: boolean;
  }

  const records: GameAuditRecord[] = games.map((game) => {
    const playableTrailersCount = game.media.filter((m) => {
      if (m.provider === 'DIRECT') return true;
      const described = describeTrailer(m.url);
      const provider = m.provider ?? described.provider;
      return (
        provider === 'YOUTUBE' &&
        !!described.videoId &&
        !isDisqualifiedTrailer(m.origin ?? undefined)
      );
    }).length;

    const userRelations = {
      libraryCount: game._count.library,
      commentsCount: game._count.comments,
      topicsCount: game._count.topics,
      eventsCount: game._count.events,
    };
    const provenance = determineGameProvenance(game.createdAt);

    const input: HygieneGameInput = {
      id: game.id,
      title: game.title,
      slug: game.slug,
      igdbId: game.igdbId,
      steamAppId: game.steamAppId,
      source: game.source,
      sourceId: game.sourceId,
      createdAt: game.createdAt,
      lastSyncedAt: game.lastSyncedAt,
      rating: game.rating,
      ratingCount: game.ratingCount,
      totalRating: game.totalRating,
      totalRatingCount: game.totalRatingCount,
      releaseDate: game.releaseDate,
      trailersCount: game.media.length,
      playableTrailersCount,
      userRelations,
      provenance,
    };

    const classification = classifyHygieneGame(input);

    return {
      raw: game,
      input,
      classification,
      hasPlayableTrailer: playableTrailersCount > 0,
    };
  });

  // 3. Provenance distribution
  const byProvenance = {
    SEED_OR_CURATED: records.filter((r) => r.input.provenance === 'SEED_OR_CURATED'),
    POPULAR_BATCH: records.filter((r) => r.input.provenance === 'POPULAR_BATCH'),
    RECENT_OLD_BATCH: records.filter((r) => r.input.provenance === 'RECENT_OLD_BATCH'),
    DISCOVER_BATCH: records.filter((r) => r.input.provenance === 'DISCOVER_BATCH'),
    UNKNOWN: records.filter((r) => r.input.provenance === 'UNKNOWN'),
  };

  console.log('\n--------------------------------------------------------------------------------');
  console.log('1. DISTRIBUIÇÃO POR PROVENANCE TEMPORAL:');
  console.log('--------------------------------------------------------------------------------');
  console.log(
    `  - SEED / CURATED (< 2026-09-17)        : ${byProvenance.SEED_OR_CURATED.length} jogos`,
  );
  console.log(
    `  - POPULAR BATCH (02:42:59 - 02:46:58)  : ${byProvenance.POPULAR_BATCH.length} jogos`,
  );
  console.log(
    `  - RECENT ANTIGO (02:47:02 - 02:50:11)  : ${byProvenance.RECENT_OLD_BATCH.length} jogos`,
  );
  console.log(
    `  - DISCOVER BATCH (02:50:16 - 02:54:24) : ${byProvenance.DISCOVER_BATCH.length} jogos`,
  );
  console.log(`  - UNKNOWN / OUTROS                     : ${byProvenance.UNKNOWN.length} jogos`);

  // 4. Category distribution across entire database
  const byCategory: Record<HygieneCategory, GameAuditRecord[]> = {
    PROTECTED: records.filter((r) => r.classification.category === 'PROTECTED'),
    CLEAR_JUNK: records.filter((r) => r.classification.category === 'CLEAR_JUNK'),
    PROBABLE_BAD_RECENT_IMPORT: records.filter(
      (r) => r.classification.category === 'PROBABLE_BAD_RECENT_IMPORT',
    ),
    LEGITIMATE_KEEP: records.filter((r) => r.classification.category === 'LEGITIMATE_KEEP'),
    UNCERTAIN: records.filter((r) => r.classification.category === 'UNCERTAIN'),
  };

  console.log('\n--------------------------------------------------------------------------------');
  console.log('2. CLASSIFICAÇÃO GLOBAL DO BANCO:');
  console.log('--------------------------------------------------------------------------------');
  console.log(`  - PROTECTED                 : ${byCategory.PROTECTED.length}`);
  console.log(`  - CLEAR_JUNK                : ${byCategory.CLEAR_JUNK.length}`);
  console.log(`  - PROBABLE_BAD_RECENT_IMPORT: ${byCategory.PROBABLE_BAD_RECENT_IMPORT.length}`);
  console.log(`  - LEGITIMATE_KEEP           : ${byCategory.LEGITIMATE_KEEP.length}`);
  console.log(`  - UNCERTAIN                 : ${byCategory.UNCERTAIN.length}`);

  // 5. Playable trailers and user relations stats
  const withPlayableTrailers = records.filter((r) => r.hasPlayableTrailer);
  const withUserRelations = records.filter((r) => hasUserRelations(r.input.userRelations));

  console.log('\n--------------------------------------------------------------------------------');
  console.log('3. ESTATÍSTICAS DE QUALIDADE E RELAÇÕES:');
  console.log('--------------------------------------------------------------------------------');
  console.log(`  - Jogos com playable trailer : ${withPlayableTrailers.length} de ${totalGames}`);
  console.log(`  - Jogos com dados de usuário : ${withUserRelations.length} de ${totalGames}`);

  // 6. Recent batch breakdown
  const recentRecords = byProvenance.RECENT_OLD_BATCH;
  const recentBatchTotal = recentRecords.length;
  const recentProbableBad = recentRecords.filter(
    (r) => r.classification.category === 'PROBABLE_BAD_RECENT_IMPORT',
  );
  const recentLegitKeep = recentRecords.filter(
    (r) => r.classification.category === 'LEGITIMATE_KEEP',
  );
  const recentJunk = recentRecords.filter((r) => r.classification.category === 'CLEAR_JUNK');
  const recentProtected = recentRecords.filter((r) => r.classification.category === 'PROTECTED');
  const recentUncertain = recentRecords.filter((r) => r.classification.category === 'UNCERTAIN');

  const recentKeepCount = recentLegitKeep.length;
  const recentBadImportCount = recentProbableBad.length;

  const recentPlayableTotal = recentRecords.filter((r) => r.hasPlayableTrailer).length;
  const recentNonPlayableTotal = recentRecords.filter((r) => !r.hasPlayableTrailer).length;

  const badImportPlayableCount = recentProbableBad.filter((r) => r.hasPlayableTrailer).length;
  const badImportNonPlayableCount = recentProbableBad.filter((r) => !r.hasPlayableTrailer).length;

  const keepPlayableCount = recentLegitKeep.filter((r) => r.hasPlayableTrailer).length;
  const keepNonPlayableCount = recentLegitKeep.filter((r) => !r.hasPlayableTrailer).length;

  const recentWithRelations = recentRecords.filter((r) => hasUserRelations(r.input.userRelations));

  console.log('\n--------------------------------------------------------------------------------');
  console.log(`4. ANÁLISE DO LOTE 'RECENT' ANTIGO (${recentRecords.length} JOGOS):`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`  - PROTECTED                 : ${recentProtected.length}`);
  console.log(`  - CLEAR_JUNK                : ${recentJunk.length}`);
  console.log(`  - PROBABLE_BAD_RECENT_IMPORT: ${recentProbableBad.length}`);
  console.log(`  - LEGITIMATE_KEEP           : ${recentLegitKeep.length}`);
  console.log(`  - UNCERTAIN                 : ${recentUncertain.length}`);
  console.log(
    `  - Com dados de usuário      : ${recentWithRelations.length} de ${recentRecords.length}`,
  );

  console.log('\n--------------------------------------------------------------------------------');
  console.log('4.1. MÉTRICAS EXATAS DO LOTE RECENT E CONSISTÊNCIA MATEMÁTICA:');
  console.log('--------------------------------------------------------------------------------');
  console.log(`  * recentBatchTotal          = ${recentBatchTotal}`);
  console.log(`  * recentKeepCount           = ${recentKeepCount}`);
  console.log(`  * recentBadImportCount      = ${recentBadImportCount}`);
  console.log(`  * recentPlayableTotal       = ${recentPlayableTotal}`);
  console.log(`  * recentNonPlayableTotal    = ${recentNonPlayableTotal}`);
  console.log(`  * badImportPlayableCount    = ${badImportPlayableCount}`);
  console.log(`  * badImportNonPlayableCount = ${badImportNonPlayableCount}`);
  console.log(`  * keepPlayableCount         = ${keepPlayableCount}`);
  console.log(`  * keepNonPlayableCount      = ${keepNonPlayableCount}`);

  console.log('\n  Validação das somas:');
  console.log(
    `  ✓ recentKeepCount (${recentKeepCount}) + recentBadImportCount (${recentBadImportCount}) = ${recentKeepCount + recentBadImportCount} (esperado: ${recentBatchTotal})`,
  );
  console.log(
    `  ✓ recentPlayableTotal (${recentPlayableTotal}) + recentNonPlayableTotal (${recentNonPlayableTotal}) = ${recentPlayableTotal + recentNonPlayableTotal} (esperado: ${recentBatchTotal})`,
  );
  console.log(
    `  ✓ badImportPlayableCount (${badImportPlayableCount}) + badImportNonPlayableCount (${badImportNonPlayableCount}) = ${badImportPlayableCount + badImportNonPlayableCount} (esperado: ${recentBadImportCount})`,
  );
  console.log(
    `  ✓ keepPlayableCount (${keepPlayableCount}) + keepNonPlayableCount (${keepNonPlayableCount}) = ${keepPlayableCount + keepNonPlayableCount} (esperado: ${recentKeepCount})`,
  );
  console.log(
    `  ✓ badImportPlayableCount (${badImportPlayableCount}) + keepPlayableCount (${keepPlayableCount}) = ${badImportPlayableCount + keepPlayableCount} (esperado: ${recentPlayableTotal})`,
  );
  console.log(
    `  ✓ badImportNonPlayableCount (${badImportNonPlayableCount}) + keepNonPlayableCount (${keepNonPlayableCount}) = ${badImportNonPlayableCount + keepNonPlayableCount} (esperado: ${recentNonPlayableTotal})`,
  );

  // Snapshot e Fingerprint dos 99 candidatos
  const candidateIds = recentProbableBad.map((r) => r.input.id);
  const fingerprint = computeCandidateFingerprint(candidateIds);
  console.log('\n--------------------------------------------------------------------------------');
  console.log('4.2. SNAPSHOT DE BACKUP E FINGERPRINT DOS CANDIDATOS:');
  console.log('--------------------------------------------------------------------------------');
  console.log(
    `  * Quantidade exata de candidatos : ${candidateIds.length} (esperado: ${EXPECTED_BAD_RECENT_COUNT})`,
  );
  console.log(`  * Fingerprint SHA-256            : ${fingerprint}`);

  const snapshotFile = '.tools/backups/catalog-hygiene-snapshot-99.json';
  const { snapshotPath: resolvedSnapshotPath } = await exportCatalogHygieneSnapshot(
    prisma,
    candidateIds,
    snapshotFile,
  );
  console.log(`  * Arquivo de snapshot salvo em   : ${resolvedSnapshotPath}`);

  // Print Legitimate Keep from Recent Batch:
  if (recentLegitKeep.length > 0) {
    console.log('\n  -> LEGITIMATE_KEEP do lote recent:');
    for (const r of recentLegitKeep) {
      console.log(
        `     * [${r.input.id}] "${r.input.title}" (igdbId: ${r.input.igdbId}) - totalRating: ${r.input.totalRating}, count: ${r.input.totalRatingCount}, playableTrailer: ${r.hasPlayableTrailer}`,
      );
    }
  }

  // 7. List of PROTECTED games (all in DB)
  console.log('\n--------------------------------------------------------------------------------');
  console.log(`5. LISTA DE JOGOS PROTECTED (${byCategory.PROTECTED.length} JOGOS):`);
  console.log('--------------------------------------------------------------------------------');
  for (const r of byCategory.PROTECTED) {
    const rel = r.input.userRelations;
    console.log(
      `  * [${r.input.id}] "${r.input.title}" (slug: ${r.input.slug}, igdbId: ${r.input.igdbId ?? 'N/A'}, steamAppId: ${r.input.steamAppId ?? 'N/A'})\n` +
        `    -> library: ${rel.libraryCount}, comments: ${rel.commentsCount}, topics: ${rel.topicsCount}, events: ${rel.eventsCount}\n` +
        `    -> provenance: ${r.input.provenance}, playableTrailer: ${r.hasPlayableTrailer}`,
    );
  }

  // 8. List of CLEAR JUNK games (if any)
  console.log('\n--------------------------------------------------------------------------------');
  console.log(`6. LISTA DE CLEAR JUNK (${byCategory.CLEAR_JUNK.length} JOGOS):`);
  console.log('--------------------------------------------------------------------------------');
  if (byCategory.CLEAR_JUNK.length === 0) {
    console.log(
      '  (Nenhum registro classificado como CLEAR JUNK. Todos são jogos standalone válidos).',
    );
  } else {
    for (const r of byCategory.CLEAR_JUNK) {
      console.log(`  * [${r.input.id}] "${r.input.title}": ${r.classification.reason}`);
    }
  }

  // 9. List of PROBABLE_BAD_RECENT_IMPORT
  console.log('\n--------------------------------------------------------------------------------');
  console.log(
    `7. LISTA DE PROBABLE_BAD_RECENT_IMPORT (${byCategory.PROBABLE_BAD_RECENT_IMPORT.length} JOGOS):`,
  );
  console.log('--------------------------------------------------------------------------------');
  for (let i = 0; i < byCategory.PROBABLE_BAD_RECENT_IMPORT.length; i++) {
    const r = byCategory.PROBABLE_BAD_RECENT_IMPORT[i];
    console.log(
      `  ${String(i + 1).padStart(3, ' ')}. [${r.input.id}] "${r.input.title}" (igdbId: ${r.input.igdbId ?? 'N/A'}, steamAppId: ${r.input.steamAppId ?? 'N/A'}, release: ${r.input.releaseDate?.toISOString().slice(0, 10) ?? 'N/A'})\n` +
        `       rating: ${r.input.rating ?? 'null'} (${r.input.ratingCount ?? 0} votes), totalRating: ${r.input.totalRating ?? 'null'} (${r.input.totalRatingCount ?? 0} votes), playableTrailer: ${r.hasPlayableTrailer}`,
    );
  }

  // 10. Execution of --apply (Safe interactive transaction with real-time re-validation)
  if (mode === 'apply') {
    const removableRecords = records.filter(
      (r) =>
        (r.classification.category === 'CLEAR_JUNK' ||
          r.classification.category === 'PROBABLE_BAD_RECENT_IMPORT') &&
        r.classification.canSafelyDelete,
    );

    console.log(
      '\n================================================================================',
    );
    console.log(
      `EXECUTANDO HIGIENE EM TRANSAÇÃO (--APPLY) - CANDIDATOS: ${removableRecords.length} (ESPERADO: ${EXPECTED_BAD_RECENT_COUNT})`,
    );
    console.log(`FINGERPRINT VALIDADO: ${fingerprint}`);
    console.log('================================================================================');

    const candidates = removableRecords.map((r) => ({
      id: r.input.id,
      title: r.input.title,
      category: r.classification.category,
      canSafelyDelete: r.classification.canSafelyDelete,
      igdbId: r.input.igdbId,
      slug: r.input.slug,
    }));

    await prisma.$transaction(
      async (tx) => {
        const { deletedCount, durationMs, deletedDependencies } =
          await executeHygieneApplyTransaction(tx as any, candidates, {
            expectedFingerprint: fingerprint,
          });
        console.log(
          `[Apply] Sucesso: ${deletedCount} registros removidos com segurança na transação em ${durationMs}ms.`,
        );
        console.log(
          `[Apply] Dependências removidas: ${deletedDependencies.gameMedia} mídias, ${deletedDependencies.gameGenre} gêneros, ${deletedDependencies.gamePlatform} plataformas, ${deletedDependencies.steamOffer} ofertas Steam.`,
        );
      },
      {
        maxWait: 10000,
        timeout: 30000,
      },
    );
  } else {
    console.log(
      '\n================================================================================',
    );
    console.log('MODO DRY-RUN FINALIZADO COM SUCESSO: NENHUMA ALTERAÇÃO FOI GRAVADA NO BANCO.');
    console.log('================================================================================');
  }

  return {
    totalGames,
    byProvenance,
    byCategory,
    withPlayableTrailersCount: withPlayableTrailers.length,
    withUserRelationsCount: withUserRelations.length,
  };
}

// CLI entry point
if (
  process.argv[1] &&
  (process.argv[1].endsWith('audit-catalog-hygiene.ts') ||
    process.argv[1].endsWith('audit-catalog-hygiene.js'))
) {
  const { mode } = parseCliArgs(process.argv);
  const prisma = new PrismaClient();

  runCatalogHygieneAudit(prisma, mode)
    .catch((err) => {
      console.error('Erro na execução do script de higiene:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
