import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../dist/app.js';

test('Dev Fixture PoC: injects synthetic Direct game and serves dev_trailer.mp4', async (t) => {
  process.env.NEXTPLAY_DEV_FIXTURES = 'true';

  // Mock prisma with empty response so it doesn't need real postgres
  const mockPrisma = {
    game: {
      findMany: async () => [],
      count: async () => 0,
      findUnique: async () => null,
    },
  };

  const app = await buildApp({ prisma: mockPrisma });
  t.after(() => app.close());

  // 1. Check GET /api/v1/feed returns dev direct game as first element
  const feedRes = await app.inject({
    method: 'GET',
    url: '/api/v1/feed',
    headers: { host: '127.0.0.1:3333' },
  });

  assert.equal(feedRes.statusCode, 200);
  const feedJson = JSON.parse(feedRes.payload);
  assert.equal(feedJson.data.length, 1);
  const game = feedJson.data[0];
  assert.equal(game.id, 'dev:direct-poc');
  assert.equal(game.title, '[DEV] Direct Trailer PoC');
  assert.equal(game.primaryTrailer.provider, 'DIRECT');
  assert.equal(
    game.primaryTrailer.url,
    'http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4',
  );

  // 2. Check GET /dev/trailer/dev_trailer.mp4 returns the full video file (200 OK)
  const videoRes = await app.inject({
    method: 'GET',
    url: '/dev/trailer/dev_trailer.mp4',
  });

  assert.equal(videoRes.statusCode, 200);
  assert.equal(videoRes.headers['content-type'], 'video/mp4');
  assert.equal(videoRes.headers['accept-ranges'], 'bytes');
  const totalLength = Number(videoRes.headers['content-length']);
  assert.ok(totalLength > 0);
  assert.ok(videoRes.rawPayload.length > 0);

  // 3. Range request: bytes=0-1023 -> 206 Partial Content
  const rangeRes1 = await app.inject({
    method: 'GET',
    url: '/dev/trailer/dev_trailer.mp4',
    headers: { range: 'bytes=0-1023' },
  });

  assert.equal(rangeRes1.statusCode, 206);
  assert.equal(rangeRes1.headers['content-type'], 'video/mp4');
  assert.equal(rangeRes1.headers['accept-ranges'], 'bytes');
  assert.equal(rangeRes1.headers['content-range'], `bytes 0-1023/${totalLength}`);
  assert.equal(Number(rangeRes1.headers['content-length']), 1024);
  assert.equal(rangeRes1.rawPayload.length, 1024);

  // 4. Open-ended Range: bytes=1024- -> 206 Partial Content
  const rangeRes2 = await app.inject({
    method: 'GET',
    url: '/dev/trailer/dev_trailer.mp4',
    headers: { range: 'bytes=1024-' },
  });

  assert.equal(rangeRes2.statusCode, 206);
  assert.equal(rangeRes2.headers['content-range'], `bytes 1024-${totalLength - 1}/${totalLength}`);
  assert.equal(Number(rangeRes2.headers['content-length']), totalLength - 1024);
  assert.equal(rangeRes2.rawPayload.length, totalLength - 1024);

  // 5. Suffix Range: bytes=-500 -> 206 Partial Content
  const rangeRes3 = await app.inject({
    method: 'GET',
    url: '/dev/trailer/dev_trailer.mp4',
    headers: { range: 'bytes=-500' },
  });

  assert.equal(rangeRes3.statusCode, 206);
  assert.equal(rangeRes3.headers['content-range'], `bytes ${totalLength - 500}-${totalLength - 1}/${totalLength}`);
  assert.equal(Number(rangeRes3.headers['content-length']), 500);
  assert.equal(rangeRes3.rawPayload.length, 500);

  // 6. Invalid Range: bytes=99999999- -> 416 Range Not Satisfiable
  const invalidRangeRes = await app.inject({
    method: 'GET',
    url: '/dev/trailer/dev_trailer.mp4',
    headers: { range: 'bytes=99999999-' },
  });

  assert.equal(invalidRangeRes.statusCode, 416);
  assert.equal(invalidRangeRes.headers['content-range'], `bytes */${totalLength}`);

  // 7. CORS preflight / headers check
  const corsRes = await app.inject({
    method: 'OPTIONS',
    url: '/dev/trailer/dev_trailer.mp4',
    headers: {
      origin: 'http://localhost:5000',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'range',
    },
  });
  assert.equal(corsRes.statusCode, 204);
  assert.ok(corsRes.headers['access-control-allow-headers'].includes('Range'));
  assert.ok(corsRes.headers['access-control-expose-headers'].includes('Content-Range'));
});

test('Dev Fixture PoC: returns 404 when NEXTPLAY_DEV_FIXTURES is false', async (t) => {
  process.env.NEXTPLAY_DEV_FIXTURES = 'false';

  const mockPrisma = {
    game: {
      findMany: async () => [],
      count: async () => 0,
      findUnique: async () => null,
    },
  };

  const app = await buildApp({ prisma: mockPrisma });
  t.after(() => app.close());

  const videoRes = await app.inject({
    method: 'GET',
    url: '/dev/trailer/dev_trailer.mp4',
  });

  assert.equal(videoRes.statusCode, 404);
});
