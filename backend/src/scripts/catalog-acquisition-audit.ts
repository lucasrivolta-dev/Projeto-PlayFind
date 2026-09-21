import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  GENRE_CLUSTERS,
  EXPOSURE_BANDS,
  buildSyncQuery,
} from '../modules/integrations/igdb/igdb-query.js';
import type { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';

import {
  SUPPORTED_PLATFORMS,
  supportedPlatforms,
  companyMetadata,
  normalizeAcquisitionTitle,
  type Identity,
  steamIdentity,
  dedupeCandidate,
  partitionCandidates,
  type DedupeStatus,
  type MetadataStatus,
  type DedupeCandidateResult,
  type CompanyMetadataResult,
  type CandidatePartition,
} from '../modules/sync/catalog-hygiene.service.js';

export {
  SUPPORTED_PLATFORMS,
  supportedPlatforms,
  companyMetadata,
  normalizeAcquisitionTitle,
  type Identity,
  steamIdentity,
  dedupeCandidate,
  partitionCandidates,
  type DedupeStatus,
  type MetadataStatus,
  type DedupeCandidateResult,
  type CompanyMetadataResult,
  type CandidatePartition,
};


export interface PoolSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  referenceTime: string;
  queries: Array<{ cluster: string; band: string; query: string; ids: number[] }>;
  supplementalQueries?: Array<{ query: string; ids: number[]; capturedAt: string }>;
  // Exact IGDB responses retained for replay and metadata provenance.
  raw: any[];
  sha256: string;
}

export async function acquireAuditPool(
  client: IgdbClient,
  snapshotPath?: string,
  requiredIds: number[] = [],
): Promise<PoolSnapshot> {
  if (snapshotPath) {
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as PoolSnapshot;
    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.queries.length, GENRE_CLUSTERS.length * EXPOSURE_BANDS.length);
    assert.equal(snapshot.sha256, hashRaw(snapshot.raw), 'Snapshot checksum mismatch');
    assert(
      requiredIds.every((id) => snapshot.raw.some((g) => g.id === id)),
      'Snapshot missing baseline IDs; capture them explicitly before replay',
    );
    return snapshot;
  }
  const referenceTime = new Date();
  const queries: PoolSnapshot['queries'] = [];
  const raw = new Map<number, any>();
  for (const cluster of GENRE_CLUSTERS) {
    for (const band of EXPOSURE_BANDS) {
      const query = buildSyncQuery(
        { mode: 'discover', band, genre: cluster, limit: 20, dryRun: true },
        referenceTime,
      );
      // Fail closed: an incomplete collection must never pass as a full audit.
      const result = (await client.search(query)) as any[];
      for (const item of result) {
        assert(
          Number.isSafeInteger(item.id) &&
            item.id > 0 &&
            typeof item.name === 'string' &&
            item.name.trim(),
          'Invalid IGDB identity',
        );
        if (!raw.has(item.id)) raw.set(item.id, item);
      }
      queries.push({ cluster, band, query, ids: result.map((g) => g.id) });
      await new Promise((resolve) => setTimeout(resolve, 280));
    }
  }
  const snapshot: PoolSnapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    referenceTime: referenceTime.toISOString(),
    queries,
    raw: [...raw.values()],
    sha256: '',
  };
  await supplementAuditPool(client, snapshot, requiredIds);
  snapshot.sha256 = hashRaw(snapshot.raw);
  return snapshot;
}

export async function supplementAuditPool(
  client: IgdbClient,
  snapshot: PoolSnapshot,
  requiredIds: number[],
) {
  const missing = requiredIds.filter((id) => !snapshot.raw.some((g) => g.id === id));
  if (!missing.length) return;
  assert(missing.every((id) => Number.isSafeInteger(id) && id > 0));
  for (let i = 0; i < missing.length; i += 100) {
    const ids = missing.slice(i, i + 100);
    const query = buildSyncQuery(
      { mode: 'id', igdbId: ids[0], limit: 1, dryRun: true },
      new Date(snapshot.referenceTime),
    ).replace(/where id = \d+; limit 1;/, `where id = (${ids.join(',')}); limit 100;`);
    const result = (await client.search(query)) as any[];
    assert.equal(
      new Set(result.map((g) => g.id)).size,
      ids.length,
      'Baseline IGDB IDs not all returned',
    );
    assert(
      result.every((g) => ids.includes(g.id)),
      'Unexpected supplemental IGDB ID',
    );
    snapshot.raw.push(...result);
    (snapshot.supplementalQueries ??= []).push({
      query,
      ids: result.map((g) => g.id),
      capturedAt: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 280));
  }
  snapshot.sha256 = hashRaw(snapshot.raw);
}

export function hashRaw(raw: unknown): string {
  return createHash('sha256').update(JSON.stringify(raw)).digest('hex');
}

export async function writeAuditJson(path: string | URL, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
}
