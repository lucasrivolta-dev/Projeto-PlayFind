import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';
import { LibraryService } from '../dist/modules/library/library.service.js';
import { Prisma } from '@prisma/client';

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

test('validated Firebase UID resolves only through firebaseUid, even when it looks like an internal ID or username', async () => {
  for (const uid of ['11111111-1111-1111-1111-111111111111', 'existing_username', ' uid ']) {
    const calls = [];
    const service = new LibraryService({
      user: {
        upsert: async (args) => {
          calls.push(args);
          return { id: `user-for-${uid}` };
        },
        findUnique: async () => {
          throw new Error('Identity alias lookup is forbidden');
        },
      },
    });
    assert.equal(await service.ensureUser(uid), `user-for-${uid}`);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].where, { firebaseUid: uid });
    assert.equal(calls[0].create.firebaseUid, uid);
  }
});

test('simultaneous first requests reuse only the row with the same firebaseUid', async () => {
  const uid = 'firebase-first-login';
  let attempts = 0;
  const service = new LibraryService({
    user: {
      upsert: async () => {
        attempts++;
        if (attempts === 1) return { id: 'created-user-id' };
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.16.0',
        });
      },
      findUnique: async ({ where }) => {
        assert.deepEqual(where, { firebaseUid: uid });
        return { id: 'created-user-id' };
      },
    },
  });
  assert.deepEqual(await Promise.all([service.ensureUser(uid), service.ensureUser(uid)]), [
    'created-user-id',
    'created-user-id',
  ]);
});

test('unique conflict on another field cannot resolve a different user', async () => {
  const service = new LibraryService({
    user: {
      upsert: async () => {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.16.0',
        });
      },
      findUnique: async ({ where }) => {
        assert.deepEqual(where, { firebaseUid: 'new-firebase-uid' });
        return null;
      },
    },
  });
  await assert.rejects(() => service.ensureUser('new-firebase-uid'), { code: 'P2002' });
});
