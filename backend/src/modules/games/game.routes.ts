import type { FastifyPluginAsync } from 'fastify';
import type { GameService } from './game.service.js';

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

    const result = await service.listGames({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      genre: query.genre,
      platform: query.platform,
      search: query.search,
    });

    return reply.status(200).send(result);
  });

  fastify.get('/games/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
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

  fastify.get('/feed', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : 20;
    const items = await service.getFeedGames(limit);

    return reply.status(200).send({
      data: items,
      total: items.length,
    });
  });
};
