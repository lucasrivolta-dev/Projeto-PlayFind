import type { FastifyPluginAsync } from 'fastify';
import type { GameService } from './game.service.js';
import { createDevDirectGame } from '../../dev/dev-fixtures.js';

export interface GameRoutesOptions {
  service: GameService;
}

export const gameRoutes: FastifyPluginAsync<GameRoutesOptions> = async (fastify, opts) => {
  const { service } = opts;

  fastify.get('/games', async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      genre?: string;
      platform?: string;
      search?: string;
    };

    const page = query.page === undefined ? undefined : Number(query.page);
    const limit = query.limit === undefined ? undefined : Number(query.limit);
    if (
      (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) ||
      (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
    ) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'page e limit devem ser inteiros positivos.',
      });
    }

    const result = await service.listGames({
      page,
      limit,
      genre: query.genre,
      platform: query.platform,
      search: query.search,
    });

    return reply.status(200).send(result);
  });

  fastify.get('/games/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (
      process.env.NEXTPLAY_DEV_FIXTURES === 'true' &&
      (id === 'dev:direct-poc' || id === 'nextplay-direct-poc')
    ) {
      const host = request.headers.host || '127.0.0.1:3333';
      const protocol = request.protocol || 'http';
      return reply.status(200).send(createDevDirectGame({ baseUrl: `${protocol}://${host}` }));
    }
    const game = await service.getGameById(id);

    if (!game) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Jogo '${id}' não encontrado.`,
      });
    }

    return reply.status(200).send(game);
  });

  fastify.get('/games/:id/comments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const comments = await service.getGameComments(id);
    return reply.status(200).send({
      data: comments.map((c) => ({
        id: c.id,
        gameId: c.gameId,
        user: c.user.username || c.user.name,
        avatarUrl: c.user.avatarUrl,
        text: c.body,
        time: c.createdAt.toISOString(),
        likes: 0,
        reply: Boolean(c.parentId),
      })),
      total: comments.length,
    });
  });

  fastify.get('/feed', async (request, reply) => {
    const query = request.query as {
      limit?: string;
      exclude?: string | string[];
      platforms?: string | string[];
    };
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'limit deve ser um inteiro positivo.',
      });
    }

    // Parse exclude parameter (comma-separated string or array of strings)
    const rawExclude = query.exclude;
    const excludeList: string[] = [];
    if (Array.isArray(rawExclude)) {
      for (const item of rawExclude) {
        if (typeof item === 'string') {
          excludeList.push(...item.split(','));
        }
      }
    } else if (typeof rawExclude === 'string') {
      excludeList.push(...rawExclude.split(','));
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sanitizedExcludeIds = Array.from(
      new Set(
        excludeList
          .map((id) => id.trim())
          .filter((id) => UUID_REGEX.test(id)),
      ),
    ).slice(0, 500);

    // Parse preferred platforms parameter
    const rawPlatforms = query.platforms;
    const platformList: string[] = [];
    if (Array.isArray(rawPlatforms)) {
      for (const item of rawPlatforms) {
        if (typeof item === 'string') platformList.push(...item.split(','));
      }
    } else if (typeof rawPlatforms === 'string') {
      platformList.push(...rawPlatforms.split(','));
    }
    const sanitizedPlatforms = platformList.map((p) => p.trim().toLowerCase()).filter(Boolean);

    const items = await service.getFeedGames(limit, sanitizedExcludeIds, sanitizedPlatforms);

    if (process.env.NEXTPLAY_DEV_FIXTURES === 'true') {
      const host = request.headers.host || '127.0.0.1:3333';
      const protocol = request.protocol || 'http';
      const devGame = createDevDirectGame({ baseUrl: `${protocol}://${host}` });
      if (!sanitizedExcludeIds.includes(devGame.id)) {
        items.unshift(devGame as any);
      }
    }

    return reply.status(200).send({
      data: items,
      total: items.length,
    });
  });
};
