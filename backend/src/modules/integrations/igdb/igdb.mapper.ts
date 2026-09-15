import type { IgdbGameDto } from './igdb.types.js';
import {
  trailerKey,
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

function ratingCount(value?: number) {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
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
  // Ordenar por relevância do nome:
  // 1. Trailers oficiais / teasers / reveals no topo (0)
  // 2. Trailers gerais (1)
  // 3. Gameplay / preview / demo (2)
  // 4. Vídeos genéricos / sem nome (3)
  // 5. Penalizar fortemente guias, detonados, tutoriais, reviews, let's play e trilha sonora (99)
  const videoNames = new Map<string, string>(
    (dto.videos ?? [])
      .filter((v) => v.video_id?.trim() && v.name?.trim())
      .map((v) => [v.video_id!.trim(), v.name!.trim().toLowerCase()]),
  );
  function trailerNamePriority(videoId: string): number {
    const name = videoNames.get(videoId) ?? '';
    if (!name) return 3;

    // Termos desqualificantes: detonados, tutoriais, reviews, let's play, guias, etc.
    if (isDisqualifiedTrailer(name)) return 99;

    // Trailers oficiais explícitos
    if (
      /\b(launch trailer|official trailer|reveal trailer|cinematic trailer|announcement trailer|teaser trailer)\b/.test(
        name,
      )
    )
      return 0;

    // Trailers e teasers gerais
    if (/\b(trailer|teaser|reveal|announce|announcement|cinematic)\b/.test(name)) return 1;

    // Gameplay e previews
    if (/\b(gameplay|demo|preview|first look)\b/.test(name)) return 2;

    return 3;
  }
  trailerDetails.sort((a, b) =>
    trailerNamePriority(a.videoId ?? '') - trailerNamePriority(b.videoId ?? ''),
  );
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
