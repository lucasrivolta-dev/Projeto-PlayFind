import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { GameService } from './modules/games/game.service.js';
import { gameRoutes } from './modules/games/game.routes.js';
import { LibraryService } from './modules/library/library.service.js';
import { libraryRoutes } from './modules/library/library.routes.js';
import type { PrismaDbClient } from './modules/games/prisma-game.repository.js';

export interface BuildAppOptions {
  prisma?: PrismaDbClient;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const prisma = options.prisma ?? new PrismaClient();
  const gameService = new GameService(prisma);
  const libraryService = new LibraryService(prisma);

  app.get('/health', async () => ({
    status: 'ok',
    service: 'nextplay-backend',
    timestamp: new Date().toISOString(),
  }));

  await app.register(gameRoutes, {
    prefix: '/api/v1',
    service: gameService,
  });

  await app.register(libraryRoutes, {
    prefix: '/api/v1/library',
    service: libraryService,
  });

  return app;
}
