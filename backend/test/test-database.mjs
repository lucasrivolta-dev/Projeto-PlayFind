import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export class TestDatabaseConfigError extends Error {}

function databaseTarget(value, variableName) {
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1)
    ) {
      throw new Error();
    }
    // Neon uses a separate -pooler hostname for the same endpoint and database.
    const host = ['127.0.0.1', '[::1]'].includes(url.hostname)
      ? 'localhost'
      : url.hostname.replace(/-pooler(?=\.)/, '');
    return `${host}:${url.port || '5432'}${decodeURIComponent(url.pathname)}`;
  } catch {
    throw new TestDatabaseConfigError(`${variableName} deve conter uma URL PostgreSQL válida.`);
  }
}

export function assertTestDatabaseConfig(testUrl, normalUrl) {
  if (!testUrl)
    throw new TestDatabaseConfigError('TEST_DATABASE_URL é obrigatório para testes com banco.');
  if (!normalUrl)
    throw new TestDatabaseConfigError(
      'DATABASE_URL é necessário para verificar o isolamento dos testes.',
    );
  if (databaseTarget(testUrl, 'TEST_DATABASE_URL') === databaseTarget(normalUrl, 'DATABASE_URL')) {
    throw new TestDatabaseConfigError(
      'TEST_DATABASE_URL deve apontar para outro endpoint ou banco.',
    );
  }
}

export function safeTestFailure(error, fallback) {
  if (error instanceof TestDatabaseConfigError) return error.message;
  const cause = error?.cause ?? error;
  const code = /^P\d{4}$/.test(cause?.code) ? cause.code : null;
  const line = String(cause?.stack ?? '').match(/\.test\.mjs:(\d+):\d+/)?.[1];
  const detail = [code && `código ${code}`, line && `linha ${line}`].filter(Boolean).join(', ');
  return detail ? `${fallback} (${detail})` : fallback;
}

export function createTestPrismaClient() {
  const testUrl = process.env.TEST_DATABASE_URL;
  assertTestDatabaseConfig(testUrl, process.env.DATABASE_URL);
  return new PrismaClient({ datasourceUrl: testUrl, log: [] });
}
