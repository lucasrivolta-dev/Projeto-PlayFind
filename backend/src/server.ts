import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { FirebaseTokenVerifier } from './auth/firebase-auth.js';

const port = Number(process.env.PORT) || 3333;
// A identidade x-user-id é temporária e não verifica a pessoa que envia a requisição.
// O fallback padrão é 127.0.0.1; process.env.HOST permite bind em 0.0.0.0 apenas sob demanda para testes em rede local.
const host = process.env.HOST || '127.0.0.1';

const prisma = new PrismaClient();
const hasFirebaseAdmin = Boolean(
  process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY,
);
const app = await buildApp({
  prisma,
  tokenVerifier: hasFirebaseAdmin ? new FirebaseTokenVerifier() : undefined,
});

const shutdown = async () => {
  app.log.info('Encerrando servidor...');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port, host });
  console.log(`NextPlay API rodando em http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
