import assert from 'node:assert/strict';
import test from 'node:test';
import { mapIgdbGame } from '../dist/modules/integrations/igdb/igdb.mapper.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';
import { matchGames } from '../dist/modules/sync/game-matcher.service.js';
import { enrichWithSteam } from '../dist/modules/integrations/steam/steam.mapper.js';
import { IgdbClient } from '../dist/modules/integrations/igdb/igdb.client.js';
import { SteamClient } from '../dist/modules/integrations/steam/steam.client.js';
import { describeTrailer } from '../dist/modules/games/normalized-game.js';

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
    rating_count: 321,
    total_rating: 90,
    total_rating_count: 654,
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
  assert.equal(game.ratingCount, 321);
  assert.equal(game.totalRating, 9);
  assert.equal(game.totalRatingCount, 654);
  assert.equal(game.developer, 'Dev Studio');
  assert.equal(game.publisher, 'Publisher');
});

test('IGDB mapper preserves missing and rejects invalid rating confidence values', () => {
  const missing = mapIgdbGame({ id: 1, name: 'Missing confidence' });
  assert.equal(missing.rating, undefined);
  assert.equal(missing.ratingCount, undefined);
  assert.equal(missing.totalRating, undefined);
  assert.equal(missing.totalRatingCount, undefined);

  const invalid = mapIgdbGame({
    id: 2,
    name: 'Invalid confidence',
    rating: Number.NaN,
    rating_count: 1.5,
    total_rating: Number.POSITIVE_INFINITY,
    total_rating_count: -1,
  });
  assert.equal(invalid.rating, undefined);
  assert.equal(invalid.ratingCount, undefined);
  assert.equal(invalid.totalRating, undefined);
  assert.equal(invalid.totalRatingCount, undefined);
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

test('Steam fallback: app list successful, exact match, nonexistent returns undefined, and cache prevents multiple downloads', async () => {
  let fetchCount = 0;
  const requestedUrls = [];
  const client = new SteamClient('test-key', async (url) => {
    fetchCount++;
    requestedUrls.push(String(url));
    if (String(url).includes('IStoreService/GetAppList/v1')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            apps: [
              { appid: 1145360, name: 'Hades' },
              { appid: 1030300, name: 'Hollow Knight: Silksong' },
            ],
            have_more_results: false,
          },
        }),
      };
    }
    return { ok: false, status: 404 };
  });

  // 1. app list bem-sucedida
  // 2. título exato encontra App ID
  assert.equal(await client.findByName('Hades'), 1145360);
  assert.equal(await client.findByName('Hollow Knight: Silksong'), 1030300);

  // 3. título inexistente retorna undefined
  assert.equal(await client.findByName('Nonexistent Game'), undefined);

  // 8. cache evita múltiplos downloads da app list dentro da mesma execução
  assert.equal(fetchCount, 1);
  assert.match(requestedUrls[0], /IStoreService\/GetAppList\/v1/);
  assert.match(requestedUrls[0], /key=test-key/);
  assert.match(requestedUrls[0], /include_games=true/);
  assert.match(requestedUrls[0], /max_results=50000/);
});

test('Steam fallback: ambiguous multiple candidates are NOT arbitrarily associated', async () => {
  const client = new SteamClient('test-key', async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('appdetails')) {
      const id = Number(new URL(urlStr).searchParams.get('appids'));
      // Both are type "game" with exact same title: genuinely ambiguous (e.g. Dead Space or Mass Effect 2)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          [id]: { success: true, data: { name: 'Dead Space', steam_appid: id, type: 'game' } },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        response: {
          apps: [
            { appid: 17470, name: 'Dead Space' },
            { appid: 1444000, name: 'Dead Space' },
          ],
        },
      }),
    };
  });

  // 5. múltiplos candidatos ambíguos continuam sem associação
  assert.equal(await client.findByName('Dead Space'), undefined);
});

test('Steam fallback: HTTP failure on app list does not repeat requests or crash sync', async () => {
  let appListCalls = 0;
  const client = new SteamClient('test-key', async (url) => {
    if (String(url).includes('IStoreService/GetAppList/v1') || String(url).includes('GetAppList')) {
      appListCalls++;
      return { ok: false, status: 404 };
    }
    return { ok: false, status: 404 };
  });

  // 4. resposta HTTP inválida não derruba sync e subsequentes não re-executam request inútil
  await assert.rejects(() => client.findByName('Game 1'), /Steam app list failed \(404\)/);
  // Subsequent call avoids repeating failing HTTP request
  assert.equal(await client.findByName('Game 2'), undefined);
  assert.equal(await client.findByName('Game 3'), undefined);
  assert.equal(appListCalls, 1);

  // 9. erro do fallback não impede persistência do jogo IGDB
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

  const syncService = new GameSyncService(repository, () => {});
  const enricher = async (game) => {
    try {
      const appId = await client.findByName(game.title);
      return appId ? enrichWithSteam(game, appId, await client.details(appId)) : game;
    } catch {
      return game;
    }
  };

  const igdbGame = {
    title: 'The Last of Us',
    slug: 'the-last-of-us',
    igdbId: 1009,
    genres: ['Action'],
    platforms: ['PlayStation'],
    screenshots: [],
  };

  const result = await syncService.sync([igdbGame], enricher);
  assert.equal(result.inserted, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'The Last of Us');
  assert.equal(records[0].igdbId, 1009);
});

test('Steam fallback: known IGDB steamAppId has priority and details() works', async () => {
  let findByNameCalled = false;
  let detailsCalledId = null;

  const client = new SteamClient('test-key', async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('appdetails')) {
      const id = Number(new URL(urlStr).searchParams.get('appids'));
      detailsCalledId = id;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          [id]: {
            success: true,
            data: {
              name: 'Hades',
              steam_appid: id,
              type: 'game',
              is_free: false,
              price_overview: { final: 7399, discount_percent: 0, currency: 'BRL' },
            },
          },
        }),
      };
    }
    findByNameCalled = true;
    return { ok: true, status: 200, json: async () => ({ response: { apps: [] } }) };
  });

  // 6. App ID conhecido pela IGDB continua tendo prioridade
  // 7. details() continua funcionando
  const records = [];
  const repository = {
    findCandidates: async () => [],
    upsertByExternalId: async (game) => {
      let record = records.find((r) => r.igdbId === game.igdbId);
      if (!record) {
        record = { id: 'db-1', ...game };
        records.push(record);
      } else {
        Object.assign(record, game);
      }
      return record;
    },
    linkExternalIds: async () => {},
    markSynced: async () => {},
  };

  const syncService = new GameSyncService(repository, () => {});
  const enricher = async (game) => {
    const appId = game.steamAppId ?? (await client.findByName(game.title));
    if (!appId) return game;
    const details = await client.details(appId);
    return enrichWithSteam(game, appId, details);
  };

  const igdbWithSteam = {
    title: 'Hades',
    slug: 'hades',
    igdbId: 113112,
    steamAppId: 1145360,
    genres: ['Roguelike'],
    platforms: ['PC'],
    screenshots: [],
  };

  await syncService.sync([igdbWithSteam], enricher);
  assert.equal(findByNameCalled, false, 'findByName não deve ser chamado quando steamAppId já é conhecido');
  assert.equal(detailsCalledId, 1145360);
  assert.equal(records[0].steamAppId, 1145360);
  assert.equal(records[0].steam?.priceCents, 7399);
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

test('describeTrailer legacy compat: YouTube URL resolves to YOUTUBE with videoId', () => {
  const t1 = describeTrailer('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(t1.provider, 'YOUTUBE');
  assert.equal(t1.videoId, 'dQw4w9WgXcQ');

  const t2 = describeTrailer('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(t2.provider, 'YOUTUBE');
  assert.equal(t2.videoId, 'dQw4w9WgXcQ');
});

test('describeTrailer legacy compat: Steam CDN URL resolves to STEAM', () => {
  const t = describeTrailer('https://steamcdn-a.akamaihd.net/steam/apps/256693630/movie480.mp4');
  assert.equal(t.provider, 'STEAM');
});

test('describeTrailer legacy compat: unknown .mp4 URL resolves to OTHER and is NEVER auto-promoted to DIRECT', () => {
  const urls = [
    'https://example.com/trailer.mp4',
    'https://cdn.publisher.com/videos/game_trailer.m3u8',
    'https://my-game.org/direct_trailer.mp4',
    'https://presskit.studio.com/video.mp4',
  ];
  for (const url of urls) {
    const t = describeTrailer(url);
    assert.equal(t.provider, 'OTHER', `URL ${url} deve resultar em OTHER, nunca DIRECT`);
  }
});

test('IGDB mapper never generates DIRECT provider trailers', () => {
  const game = mapIgdbGame({
    id: 100,
    name: 'IGDB Trailer Game',
    videos: [
      { video_id: 'yt_abc_1', name: 'Official Trailer' },
      { video_id: 'yt_abc_2', name: 'Gameplay Trailer' },
    ],
  });
  assert.ok(game.trailerDetails.length > 0);
  for (const trailer of game.trailerDetails) {
    assert.equal(trailer.provider, 'YOUTUBE');
    assert.notEqual(trailer.provider, 'DIRECT');
  }
});

test('Steam mapper never generates DIRECT provider trailers', () => {
  const baseGame = {
    title: 'Steam Trailer Game',
    genres: [],
    platforms: [],
    screenshots: [],
    trailers: [],
  };
  const enriched = enrichWithSteam(baseGame, 500, {
    success: true,
    data: {
      movies: [
        { mp4: { max: 'https://cdn.steam.com/movie_max.mp4' } },
        { webm: { max: 'https://cdn.steam.com/movie_webm.mp4' } },
      ],
    },
  });
  assert.ok(enriched.trailerDetails.length > 0);
  for (const trailer of enriched.trailerDetails) {
    assert.equal(trailer.provider, 'STEAM');
    assert.notEqual(trailer.provider, 'DIRECT');
  }
});
