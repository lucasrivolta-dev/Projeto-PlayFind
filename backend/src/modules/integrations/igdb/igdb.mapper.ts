import type { IgdbGameDto } from './igdb.types.js';
import {
  trailerKey,
  type GamePlatform,
  type NormalizedGame,
  type NormalizedTrailer,
} from '../../games/normalized-game.js';
function image(url?: string) {
  if (!url) return undefined;
  return url.startsWith('//') ? `https:${url}` : url;
}
function platform(name: string): GamePlatform {
  const value = name.toLowerCase();
  if (
    value.includes('pc') ||
    value.includes('windows') ||
    value.includes('linux') ||
    value.includes('mac')
  )
    return 'PC';
  if (value.includes('playstation')) return 'PlayStation';
  if (value.includes('xbox')) return 'Xbox';
  if (value.includes('switch')) return 'Switch';
  if (value.includes('ios') || value.includes('android')) return 'Mobile';
  return 'Other';
}

function rating(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  // IGDB rates from 0–100 while the NextPlay domain uses a 0–10 scale.
  return value > 10 ? value / 10 : value;
}

export function mapIgdbGame(dto: IgdbGameDto): NormalizedGame {
  const companies = dto.involved_companies ?? [];
  // A source name containing "steam" is not necessarily the Steam store.
  // Ignore malformed entries, but never choose arbitrarily between conflicting IDs.
  const steamIds = new Set<number>();
  for (const external of dto.external_games ?? []) {
    if (external.external_game_source?.name?.trim().toLowerCase() !== 'steam') continue;
    const uid = typeof external.uid === 'string' ? external.uid.trim() : external.uid;
    if (typeof uid !== 'number' && (typeof uid !== 'string' || !/^\d+$/.test(uid))) continue;
    const id = Number(uid);
    if (Number.isSafeInteger(id) && id > 0) steamIds.add(id);
  }
  if (steamIds.size > 1) throw new Error(`Conflicting Steam IDs for IGDB ${dto.id}`);
  const steamAppId = steamIds.values().next().value;
  const trailerDetails: NormalizedTrailer[] = [];
  for (const video of dto.videos ?? []) {
    const videoId = video.video_id?.trim();
    if (!videoId) continue;
    const trailer: NormalizedTrailer = {
      provider: 'YOUTUBE',
      videoId,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    };
    if (!trailerDetails.some((item) => trailerKey(item) === trailerKey(trailer)))
      trailerDetails.push(trailer);
  }
  const trailers = trailerDetails.map((trailer) => trailer.url);
  return {
    title: dto.name,
    slug: dto.slug,
    description: dto.summary,
    rating: rating(dto.rating ?? dto.total_rating),
    igdbId: dto.id,
    steamAppId,
    coverUrl: image(dto.cover?.url),
    heroUrl: image(dto.artworks?.[0]?.url),
    screenshots: (dto.screenshots ?? [])
      .map((item) => image(item.url))
      .filter((url): url is string => Boolean(url)),
    trailers,
    trailerDetails,
    genres: (dto.genres ?? []).map((item) => item.name),
    platforms: [...new Set((dto.platforms ?? []).map((item) => platform(item.name)))],
    releaseDate: dto.first_release_date ? new Date(dto.first_release_date * 1000) : undefined,
    developer: companies.find((item) => item.developer)?.company?.name,
    publisher: companies.find((item) => item.publisher)?.company?.name,
  };
}
