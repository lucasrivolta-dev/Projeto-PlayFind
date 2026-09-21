import type { FastifyPluginAsync } from 'fastify';
import type { PrismaDbClient } from '../games/prisma-game.repository.js';
import type { LibraryService } from '../library/library.service.js';
import type { TokenVerifier } from '../../auth/firebase-auth.js';
import { GenrePreferencesService, GenrePreferenceValidationError } from './genre-preferences.service.js';

export interface UserPreferencesRoutesOptions {
  prisma: PrismaDbClient;
  libraryService: LibraryService;
  allowTestUsers: boolean;
  tokenVerifier?: TokenVerifier;
}

export const userPreferencesRoutes: FastifyPluginAsync<UserPreferencesRoutesOptions> = async (
  fastify,
  opts,
) => {
  const { prisma, libraryService, allowTestUsers, tokenVerifier } = opts;
  const genrePreferences = new GenrePreferencesService(prisma);

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

  fastify.get('/genres', async (request) => ({ data: await genrePreferences.get(request.userId) }));

  fastify.put('/genres', async (request, reply) => {
    const body = request.body as { genreKeys?: unknown } | undefined;
    try {
      return { data: await genrePreferences.save(request.userId, body?.genreKeys) };
    } catch (error) {
      if (error instanceof GenrePreferenceValidationError)
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: error.message });
      throw error;
    }
  });

  fastify.get('/platforms', async (request, reply) => {
    const prefs = await prisma.userPlatformPreference.findMany({
      where: { userId: request.userId },
      include: { platform: true },
      orderBy: { createdAt: 'asc' },
    });

    return reply.status(200).send({
      data: prefs.map((p) => ({
        id: p.platform.id,
        name: p.platform.name,
        slug: p.platform.slug,
      })),
    });
  });

  fastify.put('/platforms', async (request, reply) => {
    const body = request.body as { platformSlugs?: string[]; platformIds?: string[] } | undefined;
    if (!body || (!Array.isArray(body.platformSlugs) && !Array.isArray(body.platformIds))) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Lista de plataformas inválida. Forneça platformSlugs ou platformIds.',
      });
    }

    const slugs = (body.platformSlugs ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const ids = (body.platformIds ?? []).map((id) => id.trim()).filter(Boolean);

    const targetPlatforms = await prisma.platform.findMany({
      where: {
        OR: [
          ...(slugs.length > 0 ? [{ slug: { in: slugs } }] : []),
          ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
        ],
      },
    });

    await prisma.userPlatformPreference.deleteMany({
      where: { userId: request.userId },
    });

    if (targetPlatforms.length > 0) {
      await prisma.userPlatformPreference.createMany({
        data: targetPlatforms.map((p) => ({
          userId: request.userId,
          platformId: p.id,
        })),
      });
    }

    const updated = await prisma.userPlatformPreference.findMany({
      where: { userId: request.userId },
      include: { platform: true },
      orderBy: { createdAt: 'asc' },
    });

    return reply.status(200).send({
      data: updated.map((p) => ({
        id: p.platform.id,
        name: p.platform.name,
        slug: p.platform.slug,
      })),
    });
  });
};
