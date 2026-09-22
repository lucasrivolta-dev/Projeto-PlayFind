import type { IgdbGameDto } from './igdb.types.js';
import {
  type GamePlatform,
  type NormalizedGame,
  type NormalizedTrailer,
} from '../../games/normalized-game.js';
import { isDisqualifiedTrailer } from '../../games/game-eligibility.js';

function image(url?: string) {
  if (!url) return undefined;
  return url.startsWith('//') ? `https:${url}` : url;
}
function platform(name: string): GamePlatform {
  const value = name.toLowerCase().trim();
  if (
    value.includes('switch') ||
    value.includes('nintendo') ||
    value.includes('wii') ||
    value.includes('game boy') ||
    value.includes('gameboy') ||
    value.includes('famicom') ||
    value.includes('nes') ||
    value.includes('snes') ||
    value.includes('ds') ||
    value.includes('3ds') ||
    value.includes('gamecube') ||
    value.includes('n64')
  ) {
    return 'Switch';
  }
  if (
    value.includes('playstation') ||
    value.includes('ps5') ||
    value.includes('ps4') ||
    value.includes('ps3') ||
    value.includes('ps2') ||
    value.includes('ps1') ||
    value.includes('ps vita') ||
    value.includes('psvita') ||
    value.includes('psp')
  ) {
    return 'PlayStation';
  }
  if (
    value.includes('xbox') ||
    value.includes('series x') ||
    value.includes('series s') ||
    value.includes('xone')
  ) {
    return 'Xbox';
  }
  if (
    value.includes('pc') ||
    value.includes('windows') ||
    value.includes('linux') ||
    value.includes('mac') ||
    value.includes('steam') ||
    value.includes('dos')
  ) {
    return 'PC';
  }
  if (
    value.includes('ios') ||
    value.includes('android') ||
    value.includes('ipad') ||
    value.includes('iphone')
  ) {
    return 'Mobile';
  }
  return 'Other';
}

function rating(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  // IGDB rates from 0–100 while the NextPlay domain uses a 0–10 scale.
  return value > 10 ? value / 10 : value;
}

function ratingCount(value?: number) {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
}

/** Shared, stable ordering for IGDB videos used by planning and ingestion. */
export function rankedIgdbVideos(videos: IgdbGameDto['videos'] = []) {
  const priority = (name: string) => {
    if (isDisqualifiedTrailer(name)) return 99;
    if (/\b(launch trailer|official trailer|reveal trailer|cinematic trailer|announcement trailer|teaser trailer)\b/i.test(name)) return 0;
    if (/\b(trailer|teaser|reveal|announce|announcement|cinematic)\b/i.test(name)) return 1;
    if (/\b(gameplay|demo|preview|first look)\b/i.test(name)) return 2;
    return 3;
  };

  const explicitPriority = (name: string) => {
    const match = name.match(/\b(launch trailer|official trailer|reveal trailer|cinematic trailer|announcement trailer|teaser trailer)\b/i);
    return match ? ['launch trailer', 'official trailer', 'reveal trailer', 'cinematic trailer', 'announcement trailer', 'teaser trailer'].indexOf(match[1].toLowerCase()) : 0;
  };

  const ranked = (videos ?? [])
    .map((video) => ({ videoId: video.video_id?.trim() ?? '', name: video.name?.trim() ?? '' }))
    .filter((video) => Boolean(video.videoId))
    .map((video) => ({ ...video, priority: priority(video.name), explicitPriority: explicitPriority(video.name) }))
    .sort((a, b) => a.priority - b.priority
      || a.explicitPriority - b.explicitPriority
      || a.videoId.localeCompare(b.videoId)
      || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  return ranked.filter((video) => {
    if (seen.has(video.videoId)) return false;
    seen.add(video.videoId);
    return true;
  });
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
  const steamAppIds = [...steamIds];
  const steamAppId = steamAppIds.length === 1 ? steamAppIds[0] : undefined;
  const trailerDetails: NormalizedTrailer[] = [];
  for (const video of rankedIgdbVideos(dto.videos)) {
    const videoId = video.videoId;
    const trailer: NormalizedTrailer = {
      provider: 'YOUTUBE',
      videoId,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      ...(video.priority === 0 ? { isOfficial: true } : {}),
    };
    trailerDetails.push(trailer);
  }
  const trailers = trailerDetails.map((trailer) => trailer.url);
  return {
    title: dto.name,
    slug: dto.slug,
    gameType: dto.game_type,
    description: dto.summary,
    rating: rating(dto.rating),
    ratingCount: ratingCount(dto.rating_count),
    totalRating: rating(dto.total_rating),
    totalRatingCount: ratingCount(dto.total_rating_count),
    igdbId: dto.id,
    steamAppId,
    ...(steamAppIds.length > 1 ? { steamAppIds } : {}),
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
