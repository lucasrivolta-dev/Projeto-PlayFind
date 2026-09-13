import { describeTrailer, trailerKey, type NormalizedGame, type NormalizedTrailer } from '../../games/normalized-game.js';
import type { SteamAppDetailsDto } from './steam.types.js';

function unique(values: (string | undefined)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

export function enrichWithSteam(
  game: NormalizedGame,
  appId: number,
  dto?: SteamAppDetailsDto,
): NormalizedGame {
  const data = dto?.success ? dto.data : undefined;
  const steamScreenshots = unique(
    (data?.screenshots ?? []).map((shot) => shot.path_full ?? shot.path_thumbnail),
  );
  const steamTrailers = unique(
    (data?.movies ?? []).map(
      (movie) => movie.mp4?.max ?? movie.webm?.max ?? movie.mp4?.['480'] ?? movie.webm?.['480'],
    ),
  );
  const existingDetails = game.trailerDetails ?? (game.trailers ?? []).map(describeTrailer);
  const trailerDetails: NormalizedTrailer[] = [...existingDetails];
  for (const url of steamTrailers) {
    const trailer = { provider: 'STEAM' as const, url };
    if (!trailerDetails.some((item) => trailerKey(item) === trailerKey(trailer))) trailerDetails.push(trailer);
  }
  const steamPlatforms = data?.platforms
    ? [
        ...(data.platforms.windows ? (['PC'] as const) : []),
        ...(data.platforms.mac ? (['PC'] as const) : []),
        ...(data.platforms.linux ? (['PC'] as const) : []),
      ]
    : [];
  return {
    ...game,
    steamAppId: appId,
    steam: {
      storeUrl: `https://store.steampowered.com/app/${appId}/`,
      priceCents: data?.price_overview?.final,
      discountPercent: data?.price_overview?.discount_percent,
      currency: data?.price_overview?.currency,
      isAvailable: Boolean(data),
    },
    coverUrl: game.coverUrl ?? data?.header_image,
    description: game.description ?? data?.short_description,
    developer: game.developer ?? data?.developers?.[0],
    publisher: game.publisher ?? data?.publishers?.[0],
    genres: game.genres.length
      ? game.genres
      : (data?.genres ?? [])
          .map((item) => item.description)
          .filter((value): value is string => Boolean(value)),
    platforms: game.platforms.length ? game.platforms : steamPlatforms,
    screenshots: unique([...game.screenshots, ...steamScreenshots]),
    trailers: unique([...(game.trailers ?? []), ...steamTrailers]),
    trailerDetails,
    isFree: game.isFree ?? data?.is_free,
  };
}
