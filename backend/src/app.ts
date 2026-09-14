import fs from 'node:fs';
import path from 'node:path';
import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { GameService } from './modules/games/game.service.js';
import { gameRoutes } from './modules/games/game.routes.js';
import { LibraryService } from './modules/library/library.service.js';
import { libraryRoutes } from './modules/library/library.routes.js';
import type { PrismaDbClient } from './modules/games/prisma-game.repository.js';
import type { TokenVerifier } from './auth/firebase-auth.js';

export interface BuildAppOptions {
  prisma?: PrismaDbClient;
  allowTestUsers?: boolean;
  tokenVerifier?: TokenVerifier;
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
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
  });

  const prisma = options.prisma ?? new PrismaClient();
  const gameService = new GameService(prisma);
  const libraryService = new LibraryService(prisma);

  app.get('/health', async () => ({
    status: 'ok',
    service: 'nextplay-backend',
    timestamp: new Date().toISOString(),
  }));

  app.get('/dev/trailer/:file', async (request, reply) => {
    if (process.env.NEXTPLAY_DEV_FIXTURES !== 'true') {
      return reply.status(404).send({ statusCode: 404, message: 'Not Found' });
    }
    const { file } = request.params as { file: string };
    const safeName = path.basename(file);
    const filePath = path.join(process.cwd(), 'dev-assets', safeName);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ statusCode: 404, message: 'Trailer not found' });
    }
    const stat = fs.statSync(filePath);
    const totalSize = stat.size;

    const rangeHeader = request.headers.range;
    if (!rangeHeader) {
      return reply
        .status(200)
        .header('Content-Type', 'video/mp4')
        .header('Content-Length', totalSize)
        .header('Accept-Ranges', 'bytes')
        .send(fs.createReadStream(filePath));
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      return reply
        .status(416)
        .header('Content-Range', `bytes */${totalSize}`)
        .send({ statusCode: 416, message: 'Range Not Satisfiable' });
    }

    let start: number;
    let end: number;

    if (match[1] === '' && match[2] === '') {
      return reply
        .status(416)
        .header('Content-Range', `bytes */${totalSize}`)
        .send({ statusCode: 416, message: 'Range Not Satisfiable' });
    } else if (match[1] === '') {
      const suffixLength = parseInt(match[2], 10);
      start = Math.max(0, totalSize - suffixLength);
      end = totalSize - 1;
    } else if (match[2] === '') {
      start = parseInt(match[1], 10);
      end = totalSize - 1;
    } else {
      start = parseInt(match[1], 10);
      end = parseInt(match[2], 10);
    }

    if (start > end || start >= totalSize) {
      return reply
        .status(416)
        .header('Content-Range', `bytes */${totalSize}`)
        .send({ statusCode: 416, message: 'Range Not Satisfiable' });
    }

    end = Math.min(end, totalSize - 1);
    const chunkSize = end - start + 1;

    return reply
      .status(206)
      .header('Content-Type', 'video/mp4')
      .header('Content-Range', `bytes ${start}-${end}/${totalSize}`)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Length', chunkSize)
      .send(fs.createReadStream(filePath, { start, end }));
  });

  await app.register(gameRoutes, {
    prefix: '/api/v1',
    service: gameService,
  });

  await app.register(libraryRoutes, {
    prefix: '/api/v1/library',
    service: libraryService,
    allowTestUsers: options.allowTestUsers ?? false,
    tokenVerifier: options.tokenVerifier,
  });

  return app;
}
