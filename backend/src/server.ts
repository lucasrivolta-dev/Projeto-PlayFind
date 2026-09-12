import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';

const port = Number(process.env.PORT) || 3333;
// A identidade x-user-id é temporária e não verifica a pessoa que envia a requisição.
// Até a autenticação real existir, nunca exponha este servidor na rede.
const host = '127.0.0.1';

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
  console.log(`NextPlay API rodando em http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
