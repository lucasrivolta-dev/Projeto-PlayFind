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
  allowTestUsers?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
  });

  await app.register(cors, {
    // Permite o Flutter Web servido localmente; impede que sites externos
    // façam requisições com x-user-id ao backend de desenvolvimento.
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const url = new URL(origin);
        return callback(
          null,
          url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
        );
      } catch {
        return callback(null, false);
      }
    },
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
    allowTestUsers: options.allowTestUsers ?? false,
  });

  return app;
}
