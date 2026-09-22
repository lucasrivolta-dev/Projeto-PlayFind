import { randomUUID } from 'node:crypto';
import {
  STEAM_QUALITY_GATE_CONFIG,
  type CatalogAcquisitionApplyResult,
  type CatalogAcquisitionManifest,
  type EvaluatedCandidate,
} from './catalog-acquisition.service.js';
import type { DedupeStatus } from './catalog-hygiene.service.js';

export const CATALOG_ACQUISITION_BATCH_MAX_LIMIT = 25;

export interface CatalogAcquisitionBatchPlanItem {
  position: number;
  identityKey: string;
  candidate: Readonly<EvaluatedCandidate>;
}

export interface CatalogAcquisitionBatchPlan {
  sessionId: string;
  catalogCountBefore: number;
  requestedLimit: number;
  selectedCount: number;
  selected: readonly CatalogAcquisitionBatchPlanItem[];
}

export interface CatalogAcquisitionBatchRevalidation {
  dedupeStatus: DedupeStatus;
  identityMatches: boolean;
  finalEligible: boolean;
  steamQualityGatePassed: boolean;
  reason?: string;
}

export interface CatalogAcquisitionBatchPersistedState {
  identityMatches: boolean;
  primaryVideoId?: string;
}

export interface CatalogAcquisitionBatchDependencies {
  catalogCount(): Promise<number>;
  revalidate(item: CatalogAcquisitionBatchPlanItem): Promise<CatalogAcquisitionBatchRevalidation>;
  applyCandidate?(item: CatalogAcquisitionBatchPlanItem): Promise<CatalogAcquisitionApplyResult>;
  readPersisted?(
    item: CatalogAcquisitionBatchPlanItem,
  ): Promise<CatalogAcquisitionBatchPersistedState>;
  readApiPrimaryVideoId?(item: CatalogAcquisitionBatchPlanItem): Promise<string | undefined>;
  readPostWriteDedupe?(item: CatalogAcquisitionBatchPlanItem): Promise<DedupeStatus>;
}

export type CatalogAcquisitionBatchItemStatus =
  'VALIDATED' | 'INSERTED' | 'FAILED' | 'SKIPPED_ALREADY_EXISTS' | 'SKIPPED_AMBIGUOUS';

export interface CatalogAcquisitionBatchItemResult {
  position: number;
  name: string;
  igdbId: number;
  band?: string;
  reviews?: number;
  positive?: number;
  plannedPrimary?: string;
  persistedPrimary?: string;
  apiPrimary?: string;
  result: CatalogAcquisitionBatchItemStatus;
  postWriteDedupe?: DedupeStatus;
  error?: string;
}

export interface CatalogAcquisitionBatchResult {
  result: 'PASS' | 'PARTIAL' | 'FAIL';
  dryRun: boolean;
  sessionId: string;
  catalogCountBefore: number;
  catalogCountAfter: number;
  requested: number;
  selected: number;
  processed: number;
  inserted: number;
  skippedAlreadyExists: number;
  skippedAmbiguous: number;
  failed: number;
  stoppedAt?: number;
  results: CatalogAcquisitionBatchItemResult[];
}

function candidateIdentityKey(candidate: EvaluatedCandidate): string {
  return JSON.stringify({
    igdbId: candidate.igdbId,
    steamAppId: candidate.steamAppId ?? null,
    steamAppIds: [...(candidate.steamAppIds ?? [])].sort((a, b) => a - b),
    name: candidate.name,
    slug: candidate.slug,
  });
}

function frozenCandidate(candidate: EvaluatedCandidate): Readonly<EvaluatedCandidate> {
  return Object.freeze({
    ...candidate,
    genres: Object.freeze([...(candidate.genres ?? [])]),
    themes: Object.freeze([...(candidate.themes ?? [])]),
    platforms: Object.freeze([...(candidate.platforms ?? [])]),
    clusters: Object.freeze([...(candidate.clusters ?? [])]),
    steamAppIds: Object.freeze([...(candidate.steamAppIds ?? [])]),
    qualityGateFailReasons: Object.freeze([...(candidate.qualityGateFailReasons ?? [])]),
  }) as Readonly<EvaluatedCandidate>;
}

export function validateCatalogAcquisitionBatchLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > CATALOG_ACQUISITION_BATCH_MAX_LIMIT) {
    throw new Error(
      `Catalog acquisition batch limit must be an integer between 1 and ${CATALOG_ACQUISITION_BATCH_MAX_LIMIT}.`,
    );
  }
}

export function createCatalogAcquisitionBatchPlan(
  manifest: CatalogAcquisitionManifest,
  options: { limit: number; catalogCountBefore: number; sessionId?: string },
): CatalogAcquisitionBatchPlan {
  validateCatalogAcquisitionBatchLimit(options.limit);
  if (!Number.isSafeInteger(options.catalogCountBefore) || options.catalogCountBefore < 0) {
    throw new Error('Catalog acquisition batch requires a valid catalogCountBefore.');
  }

  const selected = manifest.candidates.slice(0, options.limit).map((source, index) => {
    if (
      source.bucket !== 'READY' ||
      source.finalEligible !== true ||
      source.dedupeStatus !== 'NEW'
    ) {
      throw new Error(
        `Batch selection failed closed for IGDB ${source.igdbId}: candidate is not READY, NEW and finalEligible.`,
      );
    }
    const candidate = frozenCandidate(source);
    return Object.freeze({
      position: index + 1,
      identityKey: candidateIdentityKey(candidate),
      candidate,
    });
  });

  if (new Set(selected.map((item) => item.candidate.igdbId)).size !== selected.length) {
    throw new Error('Batch selection contains duplicate IGDB IDs.');
  }

  return Object.freeze({
    sessionId: options.sessionId ?? randomUUID(),
    catalogCountBefore: options.catalogCountBefore,
    requestedLimit: options.limit,
    selectedCount: selected.length,
    selected: Object.freeze(selected),
  });
}

function baseItemResult(item: CatalogAcquisitionBatchPlanItem): CatalogAcquisitionBatchItemResult {
  const candidate = item.candidate;
  return {
    position: item.position,
    name: candidate.name,
    igdbId: candidate.igdbId,
    band: candidate.steamExposureBand,
    reviews: candidate.steamReviewCount,
    positive: candidate.steamPositivePercentage,
    plannedPrimary: candidate.primaryVideoId,
    result: 'FAILED',
  };
}

export async function runCatalogAcquisitionBatch(
  plan: CatalogAcquisitionBatchPlan,
  dependencies: CatalogAcquisitionBatchDependencies,
  options: { apply: boolean },
): Promise<CatalogAcquisitionBatchResult> {
  validateCatalogAcquisitionBatchLimit(plan.requestedLimit);
  const results: CatalogAcquisitionBatchItemResult[] = [];
  let processed = 0;
  let inserted = 0;
  let skippedAlreadyExists = 0;
  let skippedAmbiguous = 0;
  let failed = 0;
  let stoppedAt: number | undefined;
  let expectedCount = plan.catalogCountBefore;

  const buildResult = async (): Promise<CatalogAcquisitionBatchResult> => {
    const catalogCountAfter = await dependencies.catalogCount();
    const stopped = stoppedAt !== undefined;
    return {
      result: stopped ? (inserted > 0 ? 'PARTIAL' : 'FAIL') : 'PASS',
      dryRun: !options.apply,
      sessionId: plan.sessionId,
      catalogCountBefore: plan.catalogCountBefore,
      catalogCountAfter,
      requested: plan.requestedLimit,
      selected: plan.selectedCount,
      processed,
      inserted,
      skippedAlreadyExists,
      skippedAmbiguous,
      failed,
      ...(stoppedAt !== undefined ? { stoppedAt } : {}),
      results,
    };
  };

  const initialCount = await dependencies.catalogCount();
  if (initialCount !== plan.catalogCountBefore) {
    stoppedAt = 0;
    failed++;
    return buildResult();
  }

  for (const item of plan.selected) {
    processed++;
    const row = baseItemResult(item);
    const candidate = item.candidate;

    if (candidateIdentityKey(candidate) !== item.identityKey) {
      failed++;
      stoppedAt = item.position;
      row.error = 'Frozen candidate identity changed before execution.';
      results.push(row);
      break;
    }

    let validation: CatalogAcquisitionBatchRevalidation;
    try {
      validation = await dependencies.revalidate(item);
    } catch (error) {
      failed++;
      stoppedAt = item.position;
      row.error = error instanceof Error ? error.message : String(error);
      results.push(row);
      break;
    }

    if (validation.dedupeStatus === 'ALREADY_EXISTS') {
      skippedAlreadyExists++;
      stoppedAt = item.position;
      row.result = 'SKIPPED_ALREADY_EXISTS';
      row.error = validation.reason ?? 'Candidate became ALREADY_EXISTS before write.';
      results.push(row);
      break;
    }
    if (validation.dedupeStatus === 'AMBIGUOUS') {
      skippedAmbiguous++;
      stoppedAt = item.position;
      row.result = 'SKIPPED_AMBIGUOUS';
      row.error = validation.reason ?? 'Candidate became AMBIGUOUS before write.';
      results.push(row);
      break;
    }
    if (
      validation.dedupeStatus !== 'NEW' ||
      !validation.identityMatches ||
      !validation.finalEligible ||
      !validation.steamQualityGatePassed
    ) {
      failed++;
      stoppedAt = item.position;
      row.error = validation.reason ?? 'Candidate failed pre-write revalidation.';
      results.push(row);
      break;
    }

    if (!options.apply) {
      row.result = 'VALIDATED';
      results.push(row);
      continue;
    }

    const countBeforeCandidate = await dependencies.catalogCount();
    if (countBeforeCandidate !== expectedCount) {
      failed++;
      stoppedAt = item.position;
      row.error = `Catalog count changed before write: expected ${expectedCount}, got ${countBeforeCandidate}.`;
      results.push(row);
      break;
    }

    if (
      !dependencies.applyCandidate ||
      !dependencies.readPersisted ||
      !dependencies.readApiPrimaryVideoId ||
      !dependencies.readPostWriteDedupe
    ) {
      throw new Error('Batch apply dependencies are incomplete.');
    }

    let applyResult: CatalogAcquisitionApplyResult;
    try {
      applyResult = await dependencies.applyCandidate(item);
    } catch (error) {
      failed++;
      stoppedAt = item.position;
      row.error = error instanceof Error ? error.message : String(error);
      results.push(row);
      break;
    }

    const detail = applyResult.results[0];
    if (
      applyResult.processed !== 1 ||
      applyResult.inserted !== 1 ||
      applyResult.failed !== 0 ||
      applyResult.skippedAlreadyExists !== 0 ||
      applyResult.skippedAmbiguous !== 0 ||
      applyResult.results.length !== 1 ||
      detail?.status !== 'INSERTED' ||
      detail.igdbId !== candidate.igdbId
    ) {
      skippedAlreadyExists += applyResult.skippedAlreadyExists;
      skippedAmbiguous += applyResult.skippedAmbiguous;
      failed += Math.max(1, applyResult.failed);
      inserted += applyResult.inserted;
      stoppedAt = item.position;
      row.result =
        detail?.status === 'SKIPPED_ALREADY_EXISTS'
          ? 'SKIPPED_ALREADY_EXISTS'
          : detail?.status === 'SKIPPED_AMBIGUOUS'
            ? 'SKIPPED_AMBIGUOUS'
            : 'FAILED';
      row.error = detail?.error ?? detail?.reason ?? 'Unexpected single-candidate apply result.';
      results.push(row);
      break;
    }

    inserted++;
    const countAfterCandidate = await dependencies.catalogCount();
    if (countAfterCandidate !== countBeforeCandidate + 1) {
      failed++;
      stoppedAt = item.position;
      row.error = `Catalog count anomaly: expected ${countBeforeCandidate + 1}, got ${countAfterCandidate}.`;
      results.push(row);
      break;
    }
    expectedCount = countAfterCandidate;

    const persisted = await dependencies.readPersisted(item);
    row.persistedPrimary = persisted.primaryVideoId;
    if (!persisted.identityMatches) {
      failed++;
      stoppedAt = item.position;
      row.error = 'Persisted identity does not match frozen candidate identity.';
      results.push(row);
      break;
    }
    if (!candidate.primaryVideoId || persisted.primaryVideoId !== candidate.primaryVideoId) {
      failed++;
      stoppedAt = item.position;
      row.error = `Persisted primary trailer mismatch: planned ${candidate.primaryVideoId ?? 'N/A'}, got ${persisted.primaryVideoId ?? 'N/A'}.`;
      results.push(row);
      break;
    }

    row.apiPrimary = await dependencies.readApiPrimaryVideoId(item);
    if (row.apiPrimary !== candidate.primaryVideoId) {
      failed++;
      stoppedAt = item.position;
      row.error = `API primary trailer mismatch: planned ${candidate.primaryVideoId}, got ${row.apiPrimary ?? 'N/A'}.`;
      results.push(row);
      break;
    }

    row.postWriteDedupe = await dependencies.readPostWriteDedupe(item);
    if (row.postWriteDedupe !== 'ALREADY_EXISTS') {
      failed++;
      stoppedAt = item.position;
      row.error = `Post-write dedupe mismatch: expected ALREADY_EXISTS, got ${row.postWriteDedupe}.`;
      results.push(row);
      break;
    }

    row.result = 'INSERTED';
    results.push(row);
  }

  return buildResult();
}

export function formatCatalogAcquisitionBatchPlan(plan: CatalogAcquisitionBatchPlan): string {
  const lines = [
    'BATCH PLAN',
    `sessionId: ${plan.sessionId}`,
    `catalogCountBefore: ${plan.catalogCountBefore}`,
    `requestedLimit: ${plan.requestedLimit}`,
    `selectedCount: ${plan.selectedCount}`,
  ];
  for (const item of plan.selected) {
    const candidate = item.candidate;
    lines.push(
      '',
      `${item.position}:`,
      `name: ${candidate.name}`,
      `igdbId: ${candidate.igdbId}`,
      `steamAppId: ${candidate.steamAppId ?? 'N/A'}`,
      `band: ${candidate.steamExposureBand ?? 'NON_STEAM'}`,
      `discoveryPriority: ${candidate.discoveryPriority}`,
      `primaryVideoId: ${candidate.primaryVideoId ?? 'N/A'}`,
    );
  }
  return lines.join('\n');
}

export function formatCatalogAcquisitionBatchResult(result: CatalogAcquisitionBatchResult): string {
  const lines = [
    'BATCH RESULT',
    `RESULT: ${result.result}`,
    `sessionId: ${result.sessionId}`,
    `catalogCountBefore: ${result.catalogCountBefore}`,
    `catalogCountAfter: ${result.catalogCountAfter}`,
    `requested: ${result.requested}`,
    `processed: ${result.processed}`,
    `inserted: ${result.inserted}`,
    `skippedAlreadyExists: ${result.skippedAlreadyExists}`,
    `skippedAmbiguous: ${result.skippedAmbiguous}`,
    `failed: ${result.failed}`,
    `stoppedAt: ${result.stoppedAt ?? 'N/A'}`,
    '',
    '# | name | igdbId | band | reviews | positive | plannedPrimary | apiPrimary | result | postWriteDedupe',
  ];
  for (const row of result.results) {
    lines.push(
      `${row.position} | ${row.name} | ${row.igdbId} | ${row.band ?? 'NON_STEAM'} | ${row.reviews ?? 'N/A'} | ${row.positive ?? 'N/A'} | ${row.plannedPrimary ?? 'N/A'} | ${row.apiPrimary ?? 'N/A'} | ${row.result} | ${row.postWriteDedupe ?? 'N/A'}${row.error ? ` | ${row.error}` : ''}`,
    );
  }
  return lines.join('\n');
}

export function steamGatePassed(
  reviewCount: number | undefined,
  positivePercentage: number | undefined,
): boolean {
  return (
    reviewCount !== undefined &&
    positivePercentage !== undefined &&
    reviewCount >= STEAM_QUALITY_GATE_CONFIG.minReviewCount &&
    positivePercentage >= STEAM_QUALITY_GATE_CONFIG.minPositivePercentage
  );
}
