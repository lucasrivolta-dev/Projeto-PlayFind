import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';

const port = Number(process.env.PORT) || 3333;
const host = process.env.HOST || '0.0.0.0';

const prisma = new PrismaClient();
const app = await buildApp({ prisma });

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
  console.log(`NextPlay API rodando em http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
