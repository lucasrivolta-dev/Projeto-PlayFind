import {
  STEAM_QUALITY_GATE_CONFIG,
  type CatalogAcquisitionManifest,
  type EvaluatedCandidate,
} from '../modules/sync/catalog-acquisition.service.js';
import {
  CATALOG_ACQUISITION_BATCH_MAX_LIMIT,
  validateCatalogAcquisitionBatchLimit,
} from '../modules/sync/catalog-acquisition-batch.js';

export interface CatalogAcquisitionApplyCliOptions {
  limit: number;
  igdbId?: number;
  snapshotPath?: string;
  batch: boolean;
  apply: boolean;
  dryRun: boolean;
}

export function parseCatalogAcquisitionApplyArgs(
  args: string[],
): CatalogAcquisitionApplyCliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const argv = args[0] === '--' ? args.slice(1) : args;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply' || arg === '--batch') {
      if (flags.has(arg)) throw new Error(`ERRO: ${arg} duplicado.`);
      flags.add(arg);
      continue;
    }
    if (arg !== '--limit' && arg !== '--igdb-id' && arg !== '--snapshot') {
      throw new Error(`ERRO: argumento desconhecido: ${arg}.`);
    }
    if (values.has(arg)) throw new Error(`ERRO: ${arg} duplicado.`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`ERRO: ${arg} requer um valor.`);
    values.set(arg, value);
  }

  const limitRaw = values.get('--limit');
  if (!limitRaw) throw new Error('ERRO: Execução requer argumento explícito --limit <N>.');
  const limit = Number(limitRaw);
  if (!/^\d+$/.test(limitRaw) || !Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error(`ERRO: --limit deve ser um número inteiro positivo. Recebido: "${limitRaw}".`);
  }

  const igdbIdRaw = values.get('--igdb-id');
  let igdbId: number | undefined;
  if (igdbIdRaw !== undefined) {
    igdbId = Number(igdbIdRaw);
    if (!/^\d+$/.test(igdbIdRaw) || !Number.isSafeInteger(igdbId) || igdbId <= 0) {
      throw new Error(`ERRO: --igdb-id deve ser um inteiro positivo. Recebido: "${igdbIdRaw}".`);
    }
  }

  const batch = flags.has('--batch');
  const apply = flags.has('--apply');
  if (batch) {
    try {
      validateCatalogAcquisitionBatchLimit(limit);
    } catch {
      throw new Error(
        `ERRO: --batch exige --limit entre 1 e ${CATALOG_ACQUISITION_BATCH_MAX_LIMIT}.`,
      );
    }
    if (igdbId !== undefined) {
      throw new Error('ERRO: --batch não pode ser combinado com --igdb-id.');
    }
    return {
      limit,
      snapshotPath: values.get('--snapshot'),
      batch: true,
      apply,
      dryRun: !apply,
    };
  }

  if (!apply) {
    throw new Error('ERRO: Ingestão manual requer flag explícita --apply.');
  }
  if (igdbId === undefined) {
    throw new Error('ERRO: Modo manual requer seleção explícita --igdb-id <ID>.');
  }
  if (limit !== 1) throw new Error('ERRO: --igdb-id exige --limit 1.');

  return {
    limit,
    igdbId,
    snapshotPath: values.get('--snapshot'),
    batch: false,
    apply: true,
    dryRun: false,
  };
}

export function selectExactCanary(
  manifest: CatalogAcquisitionManifest,
  igdbId: number,
): EvaluatedCandidate {
  const matches = manifest.evaluated.filter((candidate) => candidate.igdbId === igdbId);
  if (matches.length !== 1) {
    throw new Error(
      `ABORT: IGDB ID ${igdbId} não encontrado de forma única no manifest. processed=0 writes=0.`,
    );
  }

  const selected = matches[0];
  if (
    selected.bucket !== 'READY' ||
    selected.finalEligible !== true ||
    selected.dedupeStatus !== 'NEW' ||
    manifest.candidates.filter((candidate) => candidate === selected).length !== 1 ||
    manifest.buckets.ready.filter((candidate) => candidate === selected).length !== 1
  ) {
    throw new Error(
      `ABORT: IGDB ID ${igdbId} não está READY, NEW e finalEligible no manifest. ` +
        `bucket=${selected.bucket} processed=0 writes=0.`,
    );
  }

  const hasSteam = Boolean(selected.steamAppId || selected.steamAppIds.length > 0);
  if (
    hasSteam &&
    (selected.steamEvidenceStatus !== 'STEAM_VERIFIED' ||
      selected.steamQualityGatePassed !== true ||
      selected.steamReviewCount === undefined ||
      !Number.isFinite(selected.steamReviewCount) ||
      selected.steamReviewCount < STEAM_QUALITY_GATE_CONFIG.minReviewCount ||
      selected.steamPositivePercentage === undefined ||
      !Number.isFinite(selected.steamPositivePercentage) ||
      selected.steamPositivePercentage < STEAM_QUALITY_GATE_CONFIG.minPositivePercentage)
  ) {
    throw new Error(`ABORT: IGDB ID ${igdbId} falhou no Steam Quality Gate. processed=0 writes=0.`);
  }

  return selected;
}

export function formatSelectedCanary(candidate: EvaluatedCandidate): string {
  return [
    'SELECTED CANARY',
    `name: ${candidate.name}`,
    `igdbId: ${candidate.igdbId}`,
    `steamAppId: ${candidate.steamAppId ?? 'N/A'}`,
    `slug: ${candidate.slug}`,
    `bucket: ${candidate.bucket}`,
    `finalEligible: ${candidate.finalEligible}`,
    `steamEvidenceStatus: ${candidate.steamEvidenceStatus ?? 'N/A'}`,
    `steamReviewCount: ${candidate.steamReviewCount ?? 'N/A'}`,
    `steamPositivePercentage: ${candidate.steamPositivePercentage ?? 'N/A'}`,
    `steamExposureBand: ${candidate.steamExposureBand ?? 'N/A'}`,
    `discoveryPriority: ${candidate.discoveryPriority}`,
  ].join('\n');
}
