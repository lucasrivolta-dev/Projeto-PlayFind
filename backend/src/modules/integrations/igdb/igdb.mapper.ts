import type { IgdbGameDto } from './igdb.types.js';
import type { GamePlatform, NormalizedGame } from '../../games/normalized-game.js';

function image(url?: string) { return url ? `https:${url.replace('//', '//')}` : undefined; }
function platform(name: string): GamePlatform { const value = name.toLowerCase(); if (value.includes('pc') || value.includes('windows')) return 'PC'; if (value.includes('playstation')) return 'PlayStation'; if (value.includes('xbox')) return 'Xbox'; if (value.includes('switch')) return 'Switch'; if (value.includes('ios') || value.includes('android')) return 'Mobile'; return 'Other'; }

export function mapIgdbGame(dto: IgdbGameDto): NormalizedGame {
  const companies = dto.involved_companies ?? [];
  return { title: dto.name, slug: dto.slug, description: dto.summary, rating: dto.rating, igdbId: dto.id, coverUrl: image(dto.cover?.url), heroUrl: image(dto.artworks?.[0]?.url), screenshots: (dto.screenshots ?? []).map((item) => image(item.url)).filter((url): url is string => Boolean(url)), genres: (dto.genres ?? []).map((item) => item.name), platforms: [...new Set((dto.platforms ?? []).map((item) => platform(item.name)))], releaseDate: dto.first_release_date ? new Date(dto.first_release_date * 1000) : undefined, developer: companies.find((item) => item.developer)?.company?.name, publisher: companies.find((item) => item.publisher)?.company?.name };
}
