import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildSyncQuery,
  DEFAULT_IGDB_SYNC_QUERY,
  EDITORIAL_MIN_RATING,
  EDITORIAL_MIN_RATING_COUNT,
  ensureVideoField,
  parseSyncArgs,
  rankDiscoverCandidates,
} from '../dist/modules/integrations/igdb/igdb-query.js';

test('Default IGDB sync query preserves catalog fields without invalid popularity', async () => {
  // Inspect the CLI default without executing a real sync or loading credentials.
  const source = await readFile(new URL('../src/scripts/sync-games.ts', import.meta.url), 'utf8');
  const query = DEFAULT_IGDB_SYNC_QUERY;
  assert.doesNotMatch(query, /\bpopularity\b/);
  // Ensure the new quality-filtered default query is correct.
  assert.equal(
    query,
    'fields name,slug,game_type,summary,cover.url,artworks.url,screenshots.url,videos.video_id,videos.name,external_games.uid,external_games.external_game_source.name,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,rating_count,total_rating,total_rating_count; where game_type = (0, 8, 9) & version_parent = null & cover != null & total_rating_count >= 10 & total_rating >= 60; sort total_rating desc; limit 50;',
  );
  assert.match(source, /ensureVideoField\(process\.env\.IGDB_SYNC_QUERY/);
  assert.match(query, /rating_count/);
  assert.match(query, /total_rating_count/);
  assert.match(query, /videos\.video_id/);
  // Certifica que a nova query usa filtros de qualidade e inclui jogos principais, remakes e remasters
  assert.match(query, /game_type = \(0, 8, 9\)/);
  assert.match(query, /cover != null/);
  assert.match(query, /total_rating >= 60/);
});

test('Controlled CLI modes validate limits and generate safe IGDB queries', () => {
  assert.deepEqual(parseSyncArgs(['--id', '113112']), {
    mode: 'id',
    limit: 1,
    dryRun: false,
    igdbId: 113112,
  });
  assert.equal(parseSyncArgs(['--', '--mode', 'discover']).mode, 'discover');
  assert.throws(() => parseSyncArgs(['--unknown']));
  assert.equal(
    buildSyncQuery(parseSyncArgs(['--id', '113112'])).includes('where id = 113112; limit 1;'),
    true,
  );
  const popular = buildSyncQuery(parseSyncArgs(['--mode', 'popular', '--limit', '5']));
  assert.match(popular, /total_rating_count != null/);
  assert.match(popular, /sort total_rating_count desc/);
  assert.doesNotMatch(popular, /sort rating desc/);
  assert.doesNotMatch(popular, /\bpopularity\b/);
  const recent = buildSyncQuery(
    parseSyncArgs(['--mode', 'recent', '--limit', '5']),
    new Date('2026-09-13T00:00:00Z'),
  );
  assert.match(recent, /first_release_date >= \d+ & first_release_date <= \d+/);
  assert.match(recent, /sort first_release_date desc/);
  assert.throws(() => parseSyncArgs(['--limit', '0']));
  assert.throws(() => parseSyncArgs(['--limit', '101']));
  assert.throws(() => parseSyncArgs(['--limit', '1.5']));
  assert.throws(() => parseSyncArgs(['--id', '113112', '--mode', 'recent']));
  assert.equal(ensureVideoField('fields name; limit 5;'), 'fields name,videos.video_id; limit 5;');
  assert.equal(
    ensureVideoField('fields name,videos.video_id; limit 5;'),
    'fields name,videos.video_id; limit 5;',
  );
});

test('Discover uses a bounded pool and Bayesian deterministic ranking', () => {
  const query = buildSyncQuery(
    parseSyncArgs(['--mode', 'discover', '--limit', '20']),
    new Date('2026-09-13T00:00:00Z'),
  );
  assert.match(query, /game_type = \(0, 8, 9\)/);
  assert.match(query, /first_release_date >= \d+ & first_release_date <= \d+/);
  assert.match(query, /total_rating >= 70/);
  assert.match(query, /total_rating_count >= 20 & total_rating_count <= 500/);
  assert.match(query, /limit 100/);
  assert.doesNotMatch(query, /popularity|sort rating desc/);
  const ranked = rankDiscoverCandidates([
    { id: 1, name: 'Tiny', total_rating: 99, total_rating_count: 20 },
    { id: 2, name: 'Evidence', total_rating: 90, total_rating_count: 200 },
    { id: 3, name: 'Tie A', total_rating: 80, total_rating_count: 50 },
    { id: 4, name: 'Tie B', total_rating: 80, total_rating_count: 50 },
  ]);
  assert.ok(
    ranked.find((item) => item.id === 1).adjustedRating <
      ranked.find((item) => item.id === 2).adjustedRating,
  );
  assert.deepEqual(
    ranked.slice(-2).map((item) => item.id),
    [3, 4],
  );
  assert.equal(parseSyncArgs(['--mode', 'discover', '--limit', '20', '--dry-run']).dryRun, true);
});

test('Recent mode enforces quality threshold, recency window, and preserved modes without regression', () => {
  const fixedNow = new Date('2026-09-17T12:00:00Z');
  const query = buildSyncQuery(
    parseSyncArgs(['--mode', 'recent', '--limit', '20']),
    fixedNow,
  );

  // 1. recent contém filtro de game_type correto: (0, 8, 9)
  assert.match(query, /game_type = \(0, 8, 9\)/);
  // 2. version_parent = null
  assert.match(query, /version_parent = null/);
  // 3. cover != null
  assert.match(query, /cover != null/);
  // 4. janela temporal continua existindo (5 anos)
  const expectedCutoff = Math.floor(fixedNow.getTime() / 1000) - 5 * 365 * 24 * 60 * 60;
  assert.match(query, new RegExp(`first_release_date >= ${expectedCutoff}`));
  // 5. first_release_date futuro continua excluído
  const expectedCurrent = Math.floor(fixedNow.getTime() / 1000);
  assert.match(query, new RegExp(`first_release_date <= ${expectedCurrent}`));
  // 6. total_rating_count mínimo (10)
  assert.match(query, new RegExp(`total_rating_count >= ${EDITORIAL_MIN_RATING_COUNT}`));
  assert.equal(EDITORIAL_MIN_RATING_COUNT, 10);
  // 7. total_rating mínimo (60)
  assert.match(query, new RegExp(`total_rating >= ${EDITORIAL_MIN_RATING}`));
  assert.equal(EDITORIAL_MIN_RATING, 60);
  // 8. ordenação continua sendo first_release_date DESC
  assert.match(query, /sort first_release_date desc/);
  assert.match(query, /limit 20/);

  // 9. popular continua sem regressão
  const popular = buildSyncQuery(parseSyncArgs(['--mode', 'popular', '--limit', '10']));
  assert.match(popular, /game_type = \(0, 8, 9\)/);
  assert.match(popular, /version_parent = null/);
  assert.match(popular, /cover != null/);
  assert.match(popular, /first_release_date != null/);
  assert.match(popular, /total_rating_count != null/);
  assert.match(popular, /sort total_rating_count desc/);
  assert.match(popular, /limit 10/);

  // 10. discover continua sem regressão
  const discover = buildSyncQuery(
    parseSyncArgs(['--mode', 'discover', '--limit', '10']),
    fixedNow,
  );
  assert.match(discover, /game_type = \(0, 8, 9\)/);
  assert.match(discover, /version_parent = null/);
  assert.match(discover, /cover != null/);
  assert.match(discover, /total_rating >= 70/);
  assert.match(discover, /total_rating_count >= 20 & total_rating_count <= 500/);
  assert.match(discover, /limit 50/);
});
