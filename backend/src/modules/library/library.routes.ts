import type { FastifyPluginAsync } from 'fastify';
import type { LibraryService, LibraryFilters } from './library.service.js';
import type { LibraryStatus } from '@prisma/client';
import type { TokenVerifier } from '../../auth/firebase-auth.js';

export interface LibraryRoutesOptions {
  service: LibraryService;
  allowTestUsers: boolean;
  tokenVerifier?: TokenVerifier;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export const libraryRoutes: FastifyPluginAsync<LibraryRoutesOptions> = async (fastify, opts) => {
  const { service, allowTestUsers, tokenVerifier } = opts;

  fastify.addHook('preHandler', async (request, reply) => {
    const rawUser = request.headers['x-user-id'];
    const authorization = request.headers.authorization;
    let identity: string | undefined;
    if (authorization?.startsWith('Bearer ') && tokenVerifier) {
      try {
        identity = (await tokenVerifier.verify(authorization.slice(7).trim())).uid;
      } catch {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token inválido.' });
      }
    } else if (allowTestUsers && rawUser === 'dev-user') {
      identity = 'dev-user';
    } else {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Autenticação obrigatória.' });
    }

    if (!identity) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Identidade ausente.' });
    }
    try {
      const userId = await service.ensureUser(identity);
      request.userId = userId;
    } catch {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Falha ao identificar usuário.',
      });
    }
  });

  fastify.get('/', async (request, reply) => {
    const query = request.query as {
      status?: string;
      favorite?: string;
      rated?: string;
    };

    const filters: LibraryFilters = {};
    if (query.status === 'WANT_TO_PLAY' || query.status === 'PLAYED') {
      filters.status = query.status as LibraryStatus;
    }
    if (query.favorite === 'true') {
      filters.favorite = true;
    }
    if (query.rated === 'true') {
      filters.rated = true;
    }

    const [items, likes] = await Promise.all([
      service.getUserLibrary(request.userId, filters),
      service.getUserLikedGames(request.userId),
    ]);
    return reply.status(200).send({
      data: items,
      likes,
      total: items.length,
    });
  });

  fastify.put('/:gameId', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const body = request.body as { status?: string };

    if (body?.status !== 'WANT_TO_PLAY' && body?.status !== 'PLAYED') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: "Status inválido. Deve ser 'WANT_TO_PLAY' ou 'PLAYED'.",
      });
    }

    try {
      const result = await service.setGameStatus(
        request.userId,
        gameId,
        body.status as LibraryStatus,
      );
      return reply.status(200).send(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'GAME_NOT_FOUND') {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Jogo '${gameId}' não encontrado.`,
        });
      }
      throw err;
    }
  });

  fastify.delete('/:gameId', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    try {
      const result = await service.removeFromLibrary(request.userId, gameId);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'GAME_NOT_FOUND') {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Jogo '${gameId}' não encontrado.`,
        });
      }
      throw err;
    }
  });

  fastify.post('/:gameId/favorite', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const body = request.body as { isFavorite?: boolean } | undefined;

    try {
      const result = await service.toggleFavorite(request.userId, gameId, body?.isFavorite);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'GAME_NOT_FOUND') {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Jogo '${gameId}' não encontrado.`,
        });
      }
      throw err;
    }
  });

  fastify.post('/:gameId/rate', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const body = request.body as { rating?: number; reviewText?: string };

    if (
      typeof body?.rating !== 'number' ||
      !Number.isInteger(body.rating) ||
      body.rating < 1 ||
      body.rating > 5
    ) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'A avaliação deve ser um número inteiro entre 1 e 5.',
      });
    }

    try {
      const result = await service.rateGame(request.userId, gameId, body.rating, body.reviewText);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'GAME_NOT_FOUND') {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Jogo '${gameId}' não encontrado.`,
        });
      }
      throw err;
    }
  });

  fastify.delete('/:gameId/rate', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    try {
      const result = await service.removeRating(request.userId, gameId);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'GAME_NOT_FOUND') {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Jogo '${gameId}' não encontrado.`,
        });
      }
      throw err;
    }
  });

  fastify.post('/:gameId/like', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    try {
      const result = await service.toggleGameLike(request.userId, gameId);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'GAME_NOT_FOUND') {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Jogo '${gameId}' não encontrado.`,
        });
      }
      throw err;
    }
  });
};
