import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTestDatabaseConfig } from './test-database.mjs';

const normal = 'postgresql://user:secret@ep-main.region.aws.neon.tech/nextplay?sslmode=require';
const separate = 'postgresql://user:secret@ep-tests.region.aws.neon.tech/nextplay?sslmode=require';

test('test database URL is required and must differ from the normal database', () => {
  assert.throws(() => assertTestDatabaseConfig(undefined, normal), /TEST_DATABASE_URL/);
  assert.throws(() => assertTestDatabaseConfig(separate, undefined), /DATABASE_URL/);
  assert.throws(() => assertTestDatabaseConfig(normal, normal), /outro endpoint ou banco/);
  assert.throws(
    () =>
      assertTestDatabaseConfig(
        'postgresql://other:other@ep-main-pooler.region.aws.neon.tech/nextplay?sslmode=prefer',
        normal,
      ),
    /outro endpoint ou banco/,
  );
  assert.throws(
    () =>
      assertTestDatabaseConfig(
        'postgresql://user:other@127.0.0.1:5432/nextplay',
        'postgresql://user:secret@localhost/nextplay',
      ),
    /outro endpoint ou banco/,
  );
  assert.doesNotThrow(() => assertTestDatabaseConfig(separate, normal));
});
