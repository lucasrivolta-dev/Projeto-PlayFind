import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Default IGDB sync query preserves catalog fields without invalid popularity', async () => {
  // Inspect the CLI default without executing a real sync or loading credentials.
  const source = await readFile(new URL('../src/scripts/sync-games.ts', import.meta.url), 'utf8');
  const querySource = await readFile(
    new URL('../src/modules/integrations/igdb/igdb-query.ts', import.meta.url),
    'utf8',
  );
  const match = querySource.match(/DEFAULT_IGDB_SYNC_QUERY\s*=\s*\n\s*'([^']+)'/);
  assert.ok(match, 'The sync script must provide its default query');
  const query = match[1];
  assert.doesNotMatch(query, /\bpopularity\b/);
  assert.equal(
    query,
    'fields name,slug,summary,cover.url,artworks.url,screenshots.url,videos.video_id,external_games.uid,external_games.external_game_source.name,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,total_rating; where version_parent = null; limit 50;',
  );
  assert.match(querySource, /videos\\.video_id/);
  assert.match(source, /ensureVideoField\(process\.env\.IGDB_SYNC_QUERY/);
});
