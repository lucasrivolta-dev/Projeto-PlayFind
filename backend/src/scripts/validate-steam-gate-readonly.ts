import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  CatalogAcquisitionService,
  STEAM_QUALITY_GATE_CONFIG,
} from '../modules/sync/catalog-acquisition.service.js';

async function main() {
  const prisma = new PrismaClient();
  try {
    // 1. Load current catalog identities (read-only)
    const existingCatalog = await prisma.game.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        igdbId: true,
        steamAppId: true,
      },
    });

    const snapshotPath = path.resolve(process.cwd(), 'reports/catalog-acquisition-v1/audited-raw.json');
    const reviewsCachePath = path.resolve(process.cwd(), 'reports/catalog-acquisition-v1/steam-reviews-cache.json');

    // Run planning pipeline with the new Steam quality gate enabled
    const service = new CatalogAcquisitionService({
      loadExistingCatalog: async () => existingCatalog,
    });

    const manifest = await service.plan({
      snapshotPath,
      steamReviewsCachePath: reviewsCachePath,
    });

    console.log('=== RESULTADOS DO PIPELINE (READ-ONLY) ===\n');
    console.log('TOTAL DISCOVERED:', manifest.totals.discovered);
    console.log('ALREADY_EXISTS:', manifest.totals.alreadyExists);
    console.log('AMBIGUOUS:', manifest.totals.ambiguous);
    console.log('REJECTED:', manifest.totals.rejected);
    console.log('READY (DEPOIS):', manifest.totals.ready);

    console.log('\n=== DETALHAMENTO DE REJEIÇÕES ===');
    console.log('unsupportedPlatform:', manifest.rejectionReasons.unsupportedPlatform);
    console.log('invalidMetadata:', manifest.rejectionReasons.invalidMetadata);
    console.log('ineligible:', manifest.rejectionReasons.ineligible);
    console.log('insufficientQuality (IGDB):', manifest.rejectionReasons.insufficientQuality);
    console.log('noTrailer:', manifest.rejectionReasons.noTrailer);
    console.log('insufficientSteamReviews (REJECTED_LOW_STEAM_REVIEWS):', manifest.rejectionReasons.insufficientSteamReviews);
    console.log('poorSteamRating (REJECTED_POOR_STEAM_RATING):', manifest.rejectionReasons.poorSteamRating);
    console.log('steamEvidenceUnavailable (STEAM_EVIDENCE_UNAVAILABLE):', manifest.rejectionReasons.steamEvidenceUnavailable);

    // Filter in READY bucket:
    const readySteam = manifest.candidates.filter(c => c.steamEvidenceStatus === 'STEAM_VERIFIED');
    const readyNonSteam = manifest.candidates.filter(c => c.steamEvidenceStatus === 'NON_STEAM');

    // Filter across all evaluated candidates for steamEvidenceStatus
    const allNonSteam = manifest.evaluated.filter(c => c.steamEvidenceStatus === 'NON_STEAM');

    console.log('\n=== DISTRIBUIÇÃO STEAM EM READY ===');
    console.log('READY Steam Verificados:', readySteam.length);
    console.log('READY Non-Steam (consoles):', readyNonSteam.length);

    console.log('\n=== COMPARAÇÃO EXIGIDA ===');
    console.log('ANTES: READY = 473');
    console.log(`DEPOIS: READY = ${manifest.totals.ready}`);
    console.log(`REJECTED_LOW_STEAM_REVIEWS = ${manifest.rejectionReasons.insufficientSteamReviews}`);
    console.log(`REJECTED_POOR_STEAM_RATING = ${manifest.rejectionReasons.poorSteamRating}`);
    console.log(`STEAM_EVIDENCE_UNAVAILABLE = ${manifest.rejectionReasons.steamEvidenceUnavailable}`);
    console.log(`NON_STEAM (em READY) = ${readyNonSteam.length}`);
    console.log(`NON_STEAM (no pool total) = ${allNonSteam.length}`);

    console.log('\n=== TOP 20 CANDIDATOS READY ===');
    console.log('| Posição | Nome | Steam App ID | Steam Reviews | % Positivas | IGDB Rating | Evidência |');
    console.log('|---|---|---|---|---|---|---|');

    const top20 = manifest.candidates.slice(0, 20);
    let violations = 0;

    top20.forEach((c, index) => {
      const pos = index + 1;
      const appId = c.steamAppId ?? c.steamAppIds?.[0] ?? 'N/A';
      const reviews = c.steamReviewCount !== undefined ? c.steamReviewCount : 'N/A';
      const positive = c.steamPositivePercentage !== undefined ? `${c.steamPositivePercentage}%` : 'N/A';
      const igdbRating = c.effectiveRating;
      const status = c.steamEvidenceStatus ?? 'N/A';

      console.log(`| ${pos} | ${c.name} | ${appId} | ${reviews} | ${positive} | ${igdbRating} | ${status} |`);

      if (c.steamEvidenceStatus === 'STEAM_VERIFIED') {
        if ((c.steamReviewCount ?? 0) < STEAM_QUALITY_GATE_CONFIG.minReviewCount) {
          console.error(`VIOLAÇÃO DETECTADA no jogo #${pos} ${c.name}: reviews ${c.steamReviewCount} < 100!`);
          violations++;
        }
        if ((c.steamPositivePercentage ?? 0) < STEAM_QUALITY_GATE_CONFIG.minPositivePercentage) {
          console.error(`VIOLAÇÃO DETECTADA no jogo #${pos} ${c.name}: positive ${c.steamPositivePercentage}% < 80%!`);
          violations++;
        }
      }
    });

    console.log(`\nVerificação manual por código do Top 20: ${violations === 0 ? 'ZERO VIOLAÇÕES! Todos os candidatos Steam cumprem reviews >= 100 e positive >= 80%.' : `FALHA: ${violations} violações encontradas!`}`);

    // Check all READY candidates (not just top 20)
    let allReadyViolations = 0;
    for (const c of manifest.candidates) {
      if (c.steamEvidenceStatus === 'STEAM_VERIFIED') {
        if ((c.steamReviewCount ?? 0) < 100 || (c.steamPositivePercentage ?? 0) < 80.0) {
          allReadyViolations++;
        }
      }
    }
    console.log(`Verificação de TODOS os ${manifest.candidates.length} candidatos READY: ${allReadyViolations === 0 ? 'ZERO VIOLAÇÕES em 100% dos candidatos READY!' : `FALHA: ${allReadyViolations} violações!`}`);

    console.log('\n=== JOGOS REJEITADOS: REJECTED_LOW_STEAM_REVIEWS (reviews < 100) ===');
    manifest.buckets.rejected
      .filter((c) => c.rejectionReason === 'insufficientSteamReviews')
      .forEach((c, idx) => {
        console.log(`${idx + 1}. ${c.name} | SteamAppId: ${c.steamAppId} | Reviews: ${c.steamReviewCount} | % Positivas: ${c.steamPositivePercentage}%`);
      });

    console.log('\n=== AMOSTRA JOGOS REJEITADOS: REJECTED_POOR_STEAM_RATING (% positiva < 80%) (10 primeiros) ===');
    manifest.buckets.rejected
      .filter((c) => c.rejectionReason === 'poorSteamRating')
      .slice(0, 10)
      .forEach((c, idx) => {
        console.log(`${idx + 1}. ${c.name} | SteamAppId: ${c.steamAppId} | Reviews: ${c.steamReviewCount} | % Positivas: ${c.steamPositivePercentage}%`);
      });

    console.log('\n=== INSPEÇÃO ESPECÍFICA DOS 3 JOGOS SOLICITADOS ===');
    const targetNames = ['Ready or Not', 'Chants of Sennaar', 'Epic Seven'];
    for (const name of targetNames) {
      const candidate = manifest.evaluated.find((c) => c.name === name);
      if (!candidate) {
        console.log(`Jogo "${name}" não encontrado no pool de candidatos.`);
        continue;
      }
      console.log(`--- Jogo: ${candidate.name} ---`);
      console.log(`  Steam App ID: ${candidate.steamAppId ?? 'N/A'} (Todos IDs: ${candidate.steamAppIds?.join(', ') || 'N/A'})`);
      console.log(`  Evidence source: Steam Store API reviews endpoint (cached snapshot)`);
      console.log(`  Request / Live / Snapshot: snapshot cache (reports/catalog-acquisition-v1/steam-reviews-cache.json)`);
      console.log(`  Review count: ${candidate.steamReviewCount !== undefined ? candidate.steamReviewCount : 'undefined (sem evidência)'}`);
      console.log(`  Positive %: ${candidate.steamPositivePercentage !== undefined ? `${candidate.steamPositivePercentage}%` : 'undefined'}`);
      console.log(`  Evidence status: ${candidate.steamEvidenceStatus}`);
      console.log(`  Bucket: ${candidate.bucket}`);
      console.log(`  Rejection reason: ${candidate.rejectionReason ?? 'N/A (Aprovado)'}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
