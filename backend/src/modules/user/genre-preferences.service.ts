import type { PrismaDbClient } from '../games/prisma-game.repository.js';

export const GENRE_PREFERENCES_EVENT = 'GENRE_PREFERENCES';
export const GENRE_PREFERENCE_LIMITS = { min: 3, max: 6 } as const;
export const EXPLICIT_GENRE_WEIGHT = 3;
type Genre = { id: string; name: string; slug: string };
export interface GenreOption { key: string; label: string; genres: Genre[] }

// Presentation aliases only: an option is emitted only when backed by a Genre
// attached to a real catalog game. No synthetic taxonomy or DB rewrites.
const aliases: Record<string, [string, string]> = {
  acao: ['action', 'Ação'], action: ['action', 'Ação'],
  aventura: ['adventure', 'Aventura'], adventure: ['adventure', 'Aventura'],
  rpg: ['rpg', 'RPG'], 'role-playing-rpg': ['rpg', 'RPG'],
  estrategia: ['strategy', 'Estratégia'], strategy: ['strategy', 'Estratégia'],
  simulacao: ['simulation', 'Simulação'], simulator: ['simulation', 'Simulação'],
  plataforma: ['platform', 'Plataforma'], platform: ['platform', 'Plataforma'],
  shooter: ['shooter', 'Tiro'], racing: ['racing', 'Corrida'],
  puzzle: ['puzzle', 'Quebra-cabeças'], sport: ['sport', 'Esportes'],
  fighting: ['fighting', 'Luta'], music: ['music', 'Música'],
  'turn-based-strategy-tbs': ['turn-based-strategy-tbs', 'Estratégia por turnos'],
  'real-time-strategy-rts': ['real-time-strategy-rts', 'Estratégia em tempo real'],
  tactical: ['tactical', 'Tática'],
  'hack-and-slash-beat-em-up': ['hack-and-slash-beat-em-up', 'Combate corpo a corpo'],
  'card-game': ['card-board-game', 'Cartas e tabuleiro'],
  'card-board-game': ['card-board-game', 'Cartas e tabuleiro'],
  'point-and-click': ['point-and-click', 'Aventura de apontar e clicar'],
  'quiz-trivia': ['quiz-trivia', 'Perguntas e respostas'],
  'visual-novel': ['visual-novel', 'Novela visual'],
};
// These legacy tags describe mode/world structure, not a genre choice.
const nonGenreTags = new Set(['cooperativo', 'mundo-aberto']);

export function buildGenreOptions(genres: Genre[]): GenreOption[] {
  const options = new Map<string, GenreOption>();
  for (const genre of genres) {
    if (nonGenreTags.has(genre.slug)) continue;
    const [key, label] = aliases[genre.slug] ?? [genre.slug, genre.name];
    const option = options.get(key) ?? { key, label, genres: [] };
    option.genres.push(genre);
    options.set(key, option);
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export class GenrePreferenceValidationError extends Error {}

export class GenrePreferencesService {
  constructor(private readonly prisma: PrismaDbClient) {}

  async options() {
    const genres = await this.prisma.genre.findMany({
      where: { games: { some: {} } }, select: { id: true, name: true, slug: true },
      orderBy: { slug: 'asc' },
    });
    return buildGenreOptions(genres);
  }

  private async snapshot(userId: string) {
    const [event] = await this.prisma.recommendationEvent.findMany({
      where: { userId, eventType: GENRE_PREFERENCES_EVENT },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
      select: { metadata: true, createdAt: true },
    });
    const metadata = event?.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
        metadata.version !== 1 || !Array.isArray(metadata.genreIds)) return null;
    const ids = metadata.genreIds.filter((id): id is string => typeof id === 'string');
    return { ids, createdAt: event.createdAt };
  }

  /** Durable explicit preference: deliberately outside the 30-day/100-event
   * behavioral window. Latest snapshot replaces, never adds to, older choices. */
  async signal(userId: string) {
    const snapshot = await this.snapshot(userId);
    if (!snapshot?.ids.length) return { genres: [], selectedKeys: [], completed: false };
    const genres = await this.prisma.genre.findMany({
      where: { id: { in: snapshot.ids } }, select: { id: true, name: true, slug: true },
    });
    return { genres, selectedKeys: buildGenreOptions(genres).map(g => g.key), completed: true };
  }

  async get(userId: string) {
    const [options, signal] = await Promise.all([this.options(), this.signal(userId)]);
    return {
      options: options.map(({ key, label }) => ({ key, label })),
      selectedKeys: signal.selectedKeys.filter(key => options.some(o => o.key === key)),
      completed: signal.completed, ...GENRE_PREFERENCE_LIMITS,
    };
  }

  async save(userId: string, input: unknown) {
    if (!Array.isArray(input) || input.some(k => typeof k !== 'string') ||
        input.length < GENRE_PREFERENCE_LIMITS.min || input.length > GENRE_PREFERENCE_LIMITS.max ||
        new Set(input).size !== input.length) {
      throw new GenrePreferenceValidationError('Selecione de 3 a 6 gêneros diferentes.');
    }
    const options = await this.options();
    const chosen = options.filter(o => input.includes(o.key));
    if (chosen.length !== input.length)
      throw new GenrePreferenceValidationError('Escolha gêneros disponíveis no catálogo.');
    const ids = [...new Set(chosen.flatMap(o => o.genres.map(g => g.id)))].sort();
    const previous = await this.snapshot(userId);
    if (JSON.stringify(previous?.ids.slice().sort()) !== JSON.stringify(ids)) {
      await this.prisma.recommendationEvent.deleteMany({
        where: { userId, eventType: GENRE_PREFERENCES_EVENT },
      });
      await this.prisma.recommendationEvent.create({ data: {
        userId, eventType: GENRE_PREFERENCES_EVENT,
        metadata: { version: 1, genreIds: ids },
        // Also ordered correctly in a transaction whose DB now() is constant.
        createdAt: new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1)),
      } });
    }
    return this.get(userId);
  }
}
