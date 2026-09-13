import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

test('library rejects unverified identities and bearer tokens', async () => {
  const app = await buildApp({ prisma: {} });
  try {
    for (const headers of [
      {},
      { 'x-user-id': 'another-user' },
      { authorization: 'Bearer arbitrary-token' },
      { 'x-user-id': 'another-user', authorization: 'Bearer arbitrary-token' },
    ]) {
      const response = await app.inject({ method: 'GET', url: '/api/v1/library', headers });
      assert.equal(response.statusCode, 401);
    }
  } finally {
    await app.close();
  }
});

test('CORS only permits local web origins', async () => {
  const app = await buildApp({ prisma: {} });
  try {
    const blocked = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/library',
      headers: { origin: 'https://example.com', 'access-control-request-method': 'GET' },
    });
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);

    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/library',
      headers: { origin: 'http://localhost:53404', 'access-control-request-method': 'GET' },
    });
    assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:53404');
  } finally {
    await app.close();
  }
});
