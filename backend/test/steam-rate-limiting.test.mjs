import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SteamClient,
  STEAM_REQUEST_MIN_INTERVAL_MS,
  STEAM_DEFAULT_MAX_RETRIES,
  STEAM_DEFAULT_RETRY_AFTER_MS,
} from '../dist/modules/integrations/steam/steam.client.js';
import { GameSyncService } from '../dist/modules/sync/game-sync.service.js';
import { enrichWithSteam } from '../dist/modules/integrations/steam/steam.mapper.js';

test('Teste A — pacing: duas chamadas consecutivas respeitam o intervalo mínimo entre requisições', async () => {
  let virtualTime = 1000;
  const sleptIntervals = [];

  const fakeNow = () => virtualTime;
  const fakeSleeper = async (ms) => {
    sleptIntervals.push(ms);
    virtualTime += ms;
  };

  const dispatchTimes = [];
  const fakeFetcher = async (url) => {
    dispatchTimes.push(virtualTime);
    const id = Number(new URL(String(url)).searchParams.get('appids'));
    return {
      ok: true,
      status: 200,
      json: async () => ({ [id]: { success: true, data: { name: `Game ${id}`, steam_appid: id } } }),
    };
  };

  const client = new SteamClient({
    minIntervalMs: 250,
    fetcher: fakeFetcher,
    now: fakeNow,
    sleeper: fakeSleeper,
  });

  // Dispara duas chamadas
  const res1 = await client.details(100);
  const res2 = await client.details(200);

  assert.equal(res1?.data?.name, 'Game 100');
  assert.equal(res2?.data?.name, 'Game 200');

  // A primeira executa imediatamente em t = 1000
  assert.equal(dispatchTimes[0], 1000);
  // O sleeper deve ter sido acionado com o intervalo mínimo de 250ms antes da segunda chamada
  assert.deepEqual(sleptIntervals, [250]);
  // A segunda chamada é disparada em t = 1250 (1000 + 250)
  assert.equal(dispatchTimes[1], 1250);
});

test('Teste B — 429 + Retry-After: aguarda o tempo especificado e obtém sucesso no retry', async () => {
  let virtualTime = 2000;
  const sleptIntervals = [];
  let callCount = 0;

  const fakeNow = () => virtualTime;
  const fakeSleeper = async (ms) => {
    sleptIntervals.push(ms);
    virtualTime += ms;
  };

  const fakeFetcher = async (url) => {
    callCount++;
    const id = Number(new URL(String(url)).searchParams.get('appids'));
    if (callCount === 1) {
      return {
        ok: false,
        status: 429,
        headers: {
          get: (name) => (name.toLowerCase() === 'retry-after' ? '5' : null),
        },
        json: async () => ({}),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ [id]: { success: true, data: { name: 'Recovered Game', steam_appid: id } } }),
    };
  };

  const client = new SteamClient({
    fetcher: fakeFetcher,
    now: fakeNow,
    sleeper: fakeSleeper,
    maxRetries: 3,
  });

  const result = await client.details(555);

  assert.equal(callCount, 2);
  assert.equal(result?.data?.name, 'Recovered Game');
  // Retry-After de 5s converte para 5000ms
  assert.deepEqual(sleptIntervals, [5000]);
});

test('Teste C — limite de retries: 429 persistente aborta após o limite configurado sem loop infinito', async () => {
  let virtualTime = 5000;
  const sleptIntervals = [];
  let callCount = 0;

  const fakeNow = () => virtualTime;
  const fakeSleeper = async (ms) => {
    sleptIntervals.push(ms);
    virtualTime += ms;
  };

  const fakeFetcher = async () => {
    callCount++;
    return {
      ok: false,
      status: 429,
      headers: {
        get: (name) => (name.toLowerCase() === 'retry-after' ? '1' : null),
      },
      json: async () => ({}),
    };
  };

  const client = new SteamClient({
    fetcher: fakeFetcher,
    now: fakeNow,
    sleeper: fakeSleeper,
    maxRetries: 3,
  });

  await assert.rejects(
    () => client.details(777),
    (err) => {
      assert.match(err.message, /Steam rate limit exceeded \(429\) after 3 retries/);
      return true;
    },
  );

  // 1 chamada inicial + 3 retries = 4 tentativas no total
  assert.equal(callCount, 4);
  // Dormiu 3 vezes pelo Retry-After de 1s (1000ms)
  assert.deepEqual(sleptIntervals, [1000, 1000, 1000]);
});

test('Teste D — sucesso normal: 200 na primeira tentativa executa imediatamente sem retries', async () => {
  let callCount = 0;
  const sleptIntervals = [];

  const fakeFetcher = async (url) => {
    callCount++;
    const id = Number(new URL(String(url)).searchParams.get('appids'));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ [id]: { success: true, data: { name: 'Hades', steam_appid: id } } }),
    };
  };

  const client = new SteamClient({
    fetcher: fakeFetcher,
    sleeper: async (ms) => sleptIntervals.push(ms),
  });

  const result = await client.details(1145360);

  assert.equal(callCount, 1);
  assert.equal(result?.data?.name, 'Hades');
  assert.equal(sleptIntervals.length, 0);
});

test('Teste E — isolamento: falha de rate limit na Steam preserva os dados do catálogo IGDB sem corrupção', async () => {
  const persisted = [];
  const fakeRepository = {
    findCandidates: async () => [],
    upsertByExternalId: async (game) => {
      const record = { id: `db-${persisted.length + 1}`, ...game };
      persisted.push(record);
      return record;
    },
    linkExternalIds: async () => {},
    markSynced: async () => {},
  };

  const failingFetcher = async () => ({
    ok: false,
    status: 429,
    headers: { get: () => null },
    json: async () => ({}),
  });

  const client = new SteamClient({
    fetcher: failingFetcher,
    sleeper: async () => {},
    maxRetries: 1,
  });

  const syncService = new GameSyncService(fakeRepository, () => {});

  const igdbGame = {
    title: 'Celeste',
    slug: 'celeste',
    igdbId: 25076,
    genres: ['Platformer'],
    platforms: ['PC'],
    screenshots: ['https://images.igdb.com/igdb/image/upload/t_1080p/example.jpg'],
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/example.jpg',
    rating: 92,
  };

  const enricher = async (game) => {
    try {
      const details = await client.details(504230);
      return enrichWithSteam(game, 504230, details);
    } catch {
      // Fallback seguro: retorna jogo original sem enriquecimento da Steam
      return game;
    }
  };

  const result = await syncService.sync([igdbGame], enricher);

  // O jogo IGDB foi inserido com sucesso
  assert.equal(result.inserted, 1);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].title, 'Celeste');
  assert.equal(persisted[0].igdbId, 25076);
  // Metadados da Steam não foram fabricados nem corrompidos
  assert.equal(persisted[0].steam, undefined);
  assert.equal(persisted[0].steamAppId, undefined);
});
