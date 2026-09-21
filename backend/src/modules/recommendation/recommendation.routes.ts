import type { FastifyPluginAsync } from 'fastify';
import type { RecommendationService, IngestRecommendationEventDto } from './recommendation.service.js';
import type { LibraryService } from '../library/library.service.js';
import type { TokenVerifier } from '../../auth/firebase-auth.js';

export interface RecommendationRoutesOptions {
  recommendationService: RecommendationService;
  libraryService: LibraryService;
  allowTestUsers: boolean;
  tokenVerifier?: TokenVerifier;
}

export const recommendationRoutes: FastifyPluginAsync<RecommendationRoutesOptions> = async (
  fastify,
  opts,
) => {
  const { recommendationService, libraryService, allowTestUsers, tokenVerifier } = opts;

  // Pre-handler hook to authenticate user via Firebase Token or dev-user test identity
  fastify.addHook('preHandler', async (request, reply) => {
    const rawUser = request.headers['x-user-id'];
    const authorization = request.headers.authorization;
    let identity: string | undefined;

    if (authorization?.startsWith('Bearer ') && tokenVerifier) {
      try {
        identity = (await tokenVerifier.verify(authorization.slice(7).trim())).uid;
      } catch {
        return reply
          .status(401)
          .send({ statusCode: 401, error: 'Unauthorized', message: 'Token inválido.' });
      }
    } else if (allowTestUsers && rawUser === 'dev-user') {
      identity = 'dev-user';
    } else {
      return reply
        .status(401)
        .send({ statusCode: 401, error: 'Unauthorized', message: 'Autenticação obrigatória.' });
    }

    if (!identity) {
      return reply
        .status(401)
        .send({ statusCode: 401, error: 'Unauthorized', message: 'Identidade ausente.' });
    }

    try {
      const userId = await libraryService.ensureUser(identity);
      request.userId = userId;
    } catch {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Falha ao identificar usuário.',
      });
    }
  });

  /**
   * POST /api/v1/recommendations/events
   * Ingests single or batch recommendation events securely for the authenticated user.
   */
  fastify.post('/events', async (request, reply) => {
    const body = request.body as
      | { events?: IngestRecommendationEventDto[] }
      | IngestRecommendationEventDto
      | undefined;

    if (!body) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Payload de eventos obrigatório.',
      });
    }

    const eventList: IngestRecommendationEventDto[] = Array.isArray((body as any).events)
      ? (body as any).events
      : 'gameId' in (body as any)
        ? [body as IngestRecommendationEventDto]
        : [];

    if (eventList.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Nenhum evento fornecido para registro.',
      });
    }

    const result = await recommendationService.recordEvents(request.userId, eventList.slice(0, 50));
    return reply.status(200).send({ data: result });
  });

  /**
   * POST /api/v1/recommendations/onboarding-taste
   * Persists taste onboarding seeds (5 to 10 selected games).
   */
  fastify.post('/onboarding-taste', async (request, reply) => {
    const body = request.body as { gameIds?: string[] } | undefined;

    if (!body || !Array.isArray(body.gameIds)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'gameIds deve ser um array de IDs de jogos.',
      });
    }

    const gameIds = body.gameIds;
    if (gameIds.length < 5 || gameIds.length > 15) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Selecione entre 5 e 10 jogos no onboarding de gosto.',
      });
    }

    const recordedCount = await recommendationService.saveOnboardingTaste(
      request.userId,
      gameIds,
    );

    return reply.status(200).send({
      data: {
        recordedCount,
        completed: true,
      },
    });
  });

  /**
   * GET /api/v1/recommendations/onboarding-taste/status
   * Checks whether the user has completed onboarding taste.
   */
  fastify.get('/onboarding-taste/status', async (request, reply) => {
    const status = await recommendationService.getOnboardingTasteStatus(request.userId);
    return reply.status(200).send({ data: status });
  });
};
