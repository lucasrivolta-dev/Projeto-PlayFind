import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  companyMetadata,
  supportedPlatforms,
  partitionCandidates,
  dedupeCandidate,
  steamIdentity,
} from '../dist/modules/sync/catalog-hygiene.service.js';
import {
  acquireAuditPool,
} from '../dist/scripts/catalog-acquisition-audit.js';

test('Company metadata uses only company.name, retains missing names as null and rejects numeric/placeholder values per role', () => {
  assert.deepEqual(companyMetadata([{ developer: true, publisher: true, company: { id: 3909 } }]), {
    developer: null,
    publisher: null,
    metadataStatus: 'VALID',
    invalid: [],
  });
  const result = companyMetadata([
    { developer: true, company: { name: ' Lucas Pope ', id: 1365 } },
    { publisher: true, company: { name: '3909', id: 15527 } },
    { publisher: true, company: { name: 'Real Publisher' } },
  ]);
  assert.equal(result.developer, 'Lucas Pope');
  assert.equal(result.publisher, 'Real Publisher');
  assert.equal(result.metadataStatus, 'INVALID_METADATA');
  assert.deepEqual(result.invalid, [{ role: 'publisher', name: '3909', companyId: 15527 }]);
  for (const name of [3909, ' 123 ', 'Unknown', 'N/A', 'placeholder']) {
    assert.equal(
      companyMetadata([{ developer: true, company: { name } }]).metadataStatus,
      'INVALID_METADATA',
    );
  }
  assert.equal(
    companyMetadata([{ developer: true, company: { name: '11 bit studios' } }]).metadataStatus,
    'VALID',
  );
});

test('Platform gate admits PC/console and PC VR but not mobile/browser/standalone VR alone', () => {
  for (const platforms of [
    ['Android', 'iOS'],
    ['Web browser'],
    ['Arcade'],
    ['Meta Quest 2'],
    [],
    ['Windows Phone'],
    ['PC Engine'],
  ]) {
    assert.equal(supportedPlatforms(platforms).length, 0);
  }
  for (const platforms of [
    ['Android', 'PC (Microsoft Windows)', 'iOS'], // Gakuen Idolmaster
    ['Web browser', 'PC (Microsoft Windows)'], // Blood on the Clocktower
    ['Meta Quest 2', 'SteamVR'], // Animal Company
    ['PC (Microsoft Windows)'], // PlayM2M
    ['Nintendo Switch 2'],
    ['PlayStation VR2'],
    ['Xbox Series X|S'],
  ])
    assert(supportedPlatforms(platforms).length > 0);
});

test('Disjoint funnel never subtracts an existing or ambiguous game without a trailer twice', () => {
  const candidates = [
    { igdbId: 1, dedupeStatus: 'ALREADY_EXISTS', trailerStatus: 'NO_VIDEO' },
    { igdbId: 2, dedupeStatus: 'AMBIGUOUS', trailerStatus: 'NO_VIDEO' },
    { igdbId: 3, dedupeStatus: 'NEW', trailerStatus: 'VIDEO_PRESENT_BUT_DISQUALIFIED' },
    { igdbId: 4, dedupeStatus: 'NEW', trailerStatus: 'PLAYABLE_TRAILER' },
  ];
  const partition = partitionCandidates(candidates);
  assert.deepEqual(
    Object.values(partition).map((g) => g.length),
    [1, 1, 1, 1],
  );
  assert.throws(() => partitionCandidates([...candidates, candidates[0]]), /unique IGDB/);
});

test('Dedupe detects conflicting identities without letting an earlier ID match hide another collision', () => {
  const candidate = { igdbId: 10, steamAppId: 20, name: 'Example Game', slug: 'example-game' };
  assert.equal(dedupeCandidate(candidate, []).dedupeStatus, 'NEW');
  assert.equal(
    dedupeCandidate(candidate, [{ ...candidate, title: candidate.name }]).dedupeStatus,
    'ALREADY_EXISTS',
  );
  assert.equal(
    dedupeCandidate(candidate, [
      { igdbId: 10, steamAppId: 30, title: 'Example Game', slug: 'example-game' },
      { igdbId: 11, steamAppId: 20, title: 'Different Game', slug: 'different-game' },
    ]).dedupeStatus,
    'AMBIGUOUS',
  );
  assert.equal(
    dedupeCandidate(candidate, [{ title: 'Different Game', slug: 'example-game' }]).dedupeStatus,
    'AMBIGUOUS',
  );
});

test('IGDB collection fails closed on query errors instead of publishing partial counts', async () => {
  await assert.rejects(
    acquireAuditPool({
      search: async () => {
        throw new Error('Network unavailable');
      },
    }),
    /Network unavailable/,
  );
});

test('Multiple Steam identities are all checked for dedupe without selecting the first edition', () => {
  const result = steamIdentity([
    { uid: '10', external_game_source: { name: 'Steam' } },
    { uid: '20', external_game_source: { name: 'Steam' } },
    { uid: '30', external_game_source: { name: 'Other' } },
    { uid: '4e2', external_game_source: { name: 'Steam' } },
  ]);
  assert.deepEqual(result, { steamAppIds: [10, 20], steamAppId: undefined });
  assert.equal(
    dedupeCandidate({ ...result, name: 'Example', slug: 'example' }, [
      { steamAppId: 20, title: 'Different edition', slug: 'different-edition' },
    ]).dedupeStatus,
    'AMBIGUOUS',
  );
});

test('Audited manifest has 120 distinct NEW candidates with real IGDB companies/platforms/videos and preserves band balance', () => {
  const report = JSON.parse(
    readFileSync(new URL('../reports/catalog-acquisition-v1/final-batch.json', import.meta.url)),
  );
  const snapshot = JSON.parse(
    readFileSync(new URL('../reports/catalog-acquisition-v1/audited-raw.json', import.meta.url)),
  );
  const previous = JSON.parse(
    readFileSync(new URL('../reports/catalog-acquisition-v1/previous-batch.json', import.meta.url)),
  );
  assert.equal(report.candidates.length, 120);
  assert.equal(new Set(report.candidates.map((c) => c.igdbId)).size, 120);
  assert.equal(
    report.raw,
    Object.values(report.partition).reduce((sum, count) => sum + count, 0),
  );
  assert.equal(
    report.partition.NEW_ELIGIBLE,
    Object.values(report.gatePartition).reduce((sum, count) => sum + count, 0),
  );
  assert.equal(report.raw, report.discoveryRaw + report.supplementalRaw);
  assert.deepEqual(report.selectedByBand, {
    HEAD: 4,
    MID_TAIL: 20,
    DISCOVERY: 60,
    EMERGING: 36,
    UNPROVEN: 0,
  });
  const identities = new Set();
  for (const c of report.candidates) {
    const raw = snapshot.raw.find((g) => g.id === c.igdbId);
    assert(raw);
    assert.equal(raw.name, c.name);
    assert(raw.videos.some((v) => v.video_id === c.primaryVideoId));
    assert.match(c.primaryVideoId, /^[A-Za-z0-9_-]{11}$/);
    const companies = companyMetadata(raw.involved_companies);
    assert.equal(companies.metadataStatus, 'VALID');
    assert.equal(c.developer, companies.developer);
    assert.equal(c.publisher, companies.publisher);
    assert(supportedPlatforms(raw.platforms.map((p) => p.name)).length > 0);
    assert.equal(c.dedupeStatus, 'NEW');
    assert.deepEqual(c.steamAppIds, steamIdentity(raw.external_games).steamAppIds);
    assert.equal(c.steamAppId, steamIdentity(raw.external_games).steamAppId);
    for (const steamId of c.steamAppIds) {
      assert(!identities.has(steamId));
      identities.add(steamId);
    }
  }
  assert.equal(
    report.candidates.filter((c) => previous.candidates.some((p) => p.igdbId === c.igdbId)).length,
    117,
  );
  assert.equal(report.replacements.length, 3);
  for (const { removed, added } of report.replacements) {
    assert.equal(added.exposureBand, removed.exposureBand);
    assert(added.clusters.some((cl) => removed.clusters.includes(cl)));
  }
});
