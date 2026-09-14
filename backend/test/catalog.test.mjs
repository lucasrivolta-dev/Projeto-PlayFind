import assert from 'node:assert/strict';
import test from 'node:test';
import { mapIgdbGame } from '../dist/modules/integrations/igdb/igdb.mapper.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';
import { matchGames } from '../dist/modules/sync/game-matcher.service.js';
import { enrichWithSteam } from '../dist/modules/integrations/steam/steam.mapper.js';
import { IgdbClient } from '../dist/modules/integrations/igdb/igdb.client.js';
import { SteamClient } from '../dist/modules/integrations/steam/steam.client.js';

test('Matching keeps editions, remakes and demos separate', () => {
  const game = {
    title: 'Game',
    developer: 'Studio',
    publisher: 'Publisher',
    releaseDate: new Date('2025-01-01'),
    platforms: ['PC'],
    genres: [],
    screenshots: [],
  };
  for (const suffix of ['Remastered', 'Remake', 'Deluxe Edition', 'Demo', '2']) {
    assert.equal(matchGames(game, { ...game, title: `Game ${suffix}` }).matched, false);
  }
  assert.equal(
    matchGames(game, { ...game, releaseDate: new Date('2015-01-01') }).matched,
    false,
    'Mesmo nome com lançamento muito distante deve permanecer separado',
  );
});

test('IGDB image normalization preserves complete URLs', () => {
  for (const url of ['//images.example/cover.jpg', 'https://images.example/cover.jpg']) {
    const game = mapIgdbGame({ id: 1, name: 'Game', cover: { url } });
    assert.equal(game.coverUrl, 'https://images.example/cover.jpg');
  }
  assert.equal(mapIgdbGame({ id: 1, name: 'Game' }).coverUrl, undefined);
});

test('IGDB mapper normalizes media, platforms, rating and Steam external ID', () => {
  const game = mapIgdbGame({
    id: 42,
    name: 'Example Game',
    slug: 'example-game',
    summary: 'Description',
    rating: 91.5,
    total_rating: 90,
    first_release_date: 1704067200,
    cover: { url: '//images.example/cover.jpg' },
    artworks: [{ url: 'https://images.example/hero.jpg' }],
    screenshots: [{ url: '//images.example/shot.jpg' }],
    videos: [{ video_id: 'abc123' }, { video_id: 'abc123' }],
    external_games: [{ uid: '12345', external_game_source: { name: 'Steam' } }],
    genres: [{ name: 'Action' }],
    platforms: [{ name: 'Linux' }, { name: 'PlayStation 5' }],
    involved_companies: [
      { developer: true, company: { name: 'Dev Studio' } },
      { publisher: true, company: { name: 'Publisher' } },
    ],
  });

  assert.equal(game.igdbId, 42);
  assert.equal(game.steamAppId, 12345);
  assert.equal(game.coverUrl, 'https://images.example/cover.jpg');
  assert.equal(game.heroUrl, 'https://images.example/hero.jpg');
  assert.deepEqual(game.screenshots, ['https://images.example/shot.jpg']);
  assert.deepEqual(game.trailers, ['https://www.youtube.com/watch?v=abc123']);
  assert.deepEqual(game.trailerDetails, [
    { provider: 'YOUTUBE', videoId: 'abc123', url: 'https://www.youtube.com/watch?v=abc123' },
  ]);
  assert.deepEqual(game.platforms, ['PC', 'PlayStation']);
  assert.equal(game.rating, 9.15);
  assert.equal(game.developer, 'Dev Studio');
  assert.equal(game.publisher, 'Publisher');
});

test('IGDB client caches the verified access token for repeated requests', async () => {
  const calls = [];
  const client = new IgdbClient('client-id', 'client-secret', async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes('oauth2')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      };
    }
    return { ok: true, status: 200, json: async () => [{ id: 1 }] };
  });

  await client.search('fields id; limit 1;');
  await client.search('fields id; limit 1;');
  assert.equal(calls.filter((call) => String(call.url).includes('oauth2')).length, 1);
  const gameCall = calls.find((call) => String(call.url).includes('/v4/games'));
  assert.equal(gameCall.options.headers.Authorization, 'Bearer token');
  assert.equal(gameCall.options.body, 'fields id; limit 1;');
});

test('Steam enrichment keeps IGDB data and adds valid media and offer fields', () => {
  const enriched = enrichWithSteam(
    {
      title: 'Example Game',
      genres: ['Action'],
      platforms: [],
      screenshots: ['https://igdb.example/shot.jpg'],
      trailers: ['https://youtube.example/igdb-trailer'],
      igdbId: 42,
      rating: 9,
    },
    12345,
    {
      success: true,
      data: {
        header_image: 'https://steam.example/header.jpg',
        short_description: 'Steam description',
        screenshots: [{ path_full: 'https://steam.example/shot.jpg' }],
        movies: [{ mp4: { max: 'https://steam.example/trailer.mp4' } }],
        developers: ['Steam Dev'],
        publishers: ['Steam Pub'],
        platforms: { windows: true },
        is_free: true,
        price_overview: { final: 1999, discount_percent: 20, currency: 'BRL' },
      },
    },
  );

  assert.equal(enriched.igdbId, 42);
  assert.equal(enriched.steamAppId, 12345);
  assert.equal(enriched.coverUrl, 'https://steam.example/header.jpg');
  assert.equal(enriched.description, 'Steam description');
  assert.deepEqual(enriched.screenshots, [
    'https://igdb.example/shot.jpg',
    'https://steam.example/shot.jpg',
  ]);
  assert.deepEqual(enriched.trailers, [
    'https://youtube.example/igdb-trailer',
    'https://steam.example/trailer.mp4',
  ]);
  assert.deepEqual(
    enriched.trailerDetails.map((trailer) => trailer.provider),
    ['OTHER', 'STEAM'],
  );
  assert.equal(enriched.isFree, true);
  assert.equal(enriched.steam.priceCents, 1999);
});

test('YouTube remains primary, Steam is fallback, and repeated videos are deduplicated', () => {
  const igdbOnly = mapIgdbGame({ id: 7, name: 'Video Game', videos: [{ video_id: 'yt-1' }] });
  const enriched = enrichWithSteam(igdbOnly, 77, {
    success: true,
    data: { movies: [{ mp4: { max: 'https://steam.example/trailer.mp4' } }] },
  });
  assert.equal(enriched.trailerDetails[0].provider, 'YOUTUBE');
  assert.equal(enriched.trailerDetails[0].videoId, 'yt-1');
  assert.deepEqual(enriched.trailers, [
    'https://www.youtube.com/watch?v=yt-1',
    'https://steam.example/trailer.mp4',
  ]);

  const steamFallback = enrichWithSteam(
    { title: 'Fallback', genres: [], platforms: [], screenshots: [], trailers: [] },
    88,
    { success: true, data: { movies: [{ mp4: { max: 'https://steam.example/fallback.mp4' } }] } },
  );
  assert.equal(steamFallback.trailerDetails[0].provider, 'STEAM');

  const repeated = mapIgdbGame({
    id: 9,
    name: 'Repeated',
    videos: [{ video_id: 'same' }, { video_id: 'same' }],
  });
  assert.equal(repeated.trailerDetails.length, 1);
});

test('Official trailers take priority over walkthroughs, guides, reviews, and gameplay', () => {
  const game = mapIgdbGame({
    id: 42,
    name: 'Epic Adventure',
    videos: [
      { video_id: 'vid-guide', name: 'Complete 100% Walkthrough and Guide' },
      { video_id: 'vid-gameplay', name: 'Extended Gameplay Demo' },
      { video_id: 'vid-review', name: 'IGN Game Review' },
      { video_id: 'vid-trailer', name: 'Official Launch Trailer' },
      { video_id: 'vid-teaser', name: 'Teaser Trailer' },
    ],
  });

  assert.equal(game.trailerDetails[0].videoId, 'vid-trailer');
  assert.equal(game.trailerDetails[1].videoId, 'vid-teaser');
  assert.equal(game.trailerDetails[2].videoId, 'vid-gameplay');
  const tailIds = game.trailerDetails.slice(3).map((t) => t.videoId);
  assert.ok(tailIds.includes('vid-guide'));
  assert.ok(tailIds.includes('vid-review'));
});

test('Multiple Steam IDs are preserved for later validation instead of aborting mapping', () => {
  const game = mapIgdbGame({
    id: 194821,
    name: 'Nine Sols',
    external_games: [
      { uid: '1913920', external_game_source: { name: 'Steam' } },
      { uid: '1809540', external_game_source: { name: 'Steam' } },
    ],
  });
  assert.equal(game.steamAppId, undefined);
  assert.deepEqual(game.steamAppIds, [1913920, 1809540]);
});

test('Steam validation chooses the exact primary app and rejects playtest candidates', async () => {
  const client = new SteamClient('', async (url) => {
    const id = Number(new URL(String(url)).searchParams.get('appids'));
    const name = id === 1809540 ? 'Nine Sols' : 'Nine Sols Playtest';
    return {
      ok: true,
      status: 200,
      json: async () => ({ [id]: { success: true, data: { name, steam_appid: id } } }),
    };
  });
  assert.equal(await client.resolvePrimaryApp('Nine Sols', [1913920, 1809540]), 1809540);
  // Rejecting the playtest leaves one usable app, even without an exact name match.
  assert.equal(await client.resolvePrimaryApp('Unknown', [1913920, 1809540]), 1809540);
  assert.equal(await client.resolvePrimaryApp('Nine Sols', [1913920]), undefined);
});

test('Steam validation leaves genuinely ambiguous candidates unresolved', async () => {
  const client = new SteamClient('', async (url) => {
    const id = Number(new URL(String(url)).searchParams.get('appids'));
    const name = id === 10 ? 'Candidate One' : 'Candidate Two';
    return {
      ok: true,
      status: 200,
      json: async () => ({ [id]: { success: true, data: { name, steam_appid: id } } }),
    };
  });
  assert.equal(await client.resolvePrimaryApp('Unknown', [10, 20]), undefined);
  assert.equal(await client.resolvePrimaryApp('Unknown', [20, 10]), undefined);
});

test('Steam client returns only successful details and matches normalized names', async () => {
  const client = new SteamClient('api-key', async (url) => {
    if (String(url).includes('appdetails')) {
      return { ok: true, status: 200, json: async () => ({ 10: { success: false } }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ applist: { apps: [{ appid: 10, name: 'HÉROE: Test' }] } }),
    };
  });
  assert.equal(await client.details(10), undefined);
  assert.equal(await client.findByName('Heroe Test'), 10);
});

test('Sync links the stored database ID rather than the title or slug', async () => {
  const source = {
    title: 'Game',
    slug: 'game',
    igdbId: 1,
    releaseDate: new Date('2025-01-01'),
    platforms: ['PC'],
    genres: [],
    screenshots: [],
  };
  const links = [];
  const upserts = [];
  const service = new GameSyncService(
    {
      findCandidates: async () => [{ ...source, igdbId: undefined, id: 'database-id' }],
      linkExternalIds: async (id, sources) => links.push({ id, sources }),
      upsertByExternalId: async (game) => {
        upserts.push(game);
        return game;
      },
      markSynced: async () => {},
    },
    () => {},
  );
  const result = await service.sync([source]);
  assert.equal(result.linked, 1);
  assert.deepEqual(links, [{ id: 'database-id', sources: { igdbId: 1 } }]);
  assert.equal(upserts.length, 1);
});

test('Sync is idempotent and Steam enrichment updates the same game record', async () => {
  const records = [];
  const repository = {
    findCandidates: async (game) =>
      records.filter(
        (record) =>
          (game.igdbId !== undefined && record.igdbId === game.igdbId) ||
          (game.steamAppId !== undefined && record.steamAppId === game.steamAppId) ||
          record.slug === game.slug,
      ),
    upsertByExternalId: async (game) => {
      let record = records.find(
        (candidate) =>
          (game.igdbId !== undefined && candidate.igdbId === game.igdbId) ||
          (game.steamAppId !== undefined && candidate.steamAppId === game.steamAppId) ||
          candidate.slug === game.slug,
      );
      if (!record) {
        record = { id: `db-${records.length + 1}`, ...game };
        records.push(record);
      } else {
        Object.assign(record, game);
      }
      return record;
    },
    linkExternalIds: async (id, ids) =>
      Object.assign(
        records.find((record) => record.id === id),
        ids,
      ),
    markSynced: async () => {},
  };
  const source = {
    title: 'Hades',
    slug: 'hades',
    igdbId: 999,
    genres: ['Action'],
    platforms: ['PC'],
    screenshots: [],
  };
  const service = new GameSyncService(repository, () => {});
  const enricher = async (game) => enrichWithSteam(game, 1234, { success: false });

  await service.sync([source], enricher);
  await service.sync([{ ...source, rating: 9.8, description: 'Updated from IGDB' }], enricher);

  assert.equal(records.length, 1);
  assert.equal(records[0].igdbId, 999);
  assert.equal(records[0].rating, 9.8);
  assert.equal(records[0].description, 'Updated from IGDB');
  assert.equal(records[0].steamAppId, 1234);
  assert.equal(records[0].steam.isAvailable, false);
});

test('Sync keeps an IGDB-only game when Steam has no correspondence', async () => {
  const records = [];
  const repository = {
    findCandidates: async () => [],
    upsertByExternalId: async (game) => {
      const record = { id: 'db-1', ...game };
      records.push(record);
      return record;
    },
    linkExternalIds: async () => {},
    markSynced: async () => {},
  };
  const game = {
    title: 'IGDB Only',
    slug: 'igdb-only',
    igdbId: 1001,
    genres: [],
    platforms: [],
    screenshots: [],
  };

  await new GameSyncService(repository, () => {}).sync([game], async (value) => value);
  assert.equal(records.length, 1);
  assert.equal(records[0].igdbId, 1001);
  assert.equal(records[0].steamAppId, undefined);
});
