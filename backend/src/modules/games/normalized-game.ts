export type GamePlatform = 'PC' | 'PlayStation' | 'Xbox' | 'Switch' | 'Mobile' | 'Other';
export type TrailerProvider = 'YOUTUBE' | 'STEAM' | 'OTHER';
export interface NormalizedTrailer {
  provider: TrailerProvider;
  url: string;
  videoId?: string;
  thumbnailUrl?: string;
}

export function describeTrailer(url: string): NormalizedTrailer {
  const value = url.trim();
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const id = parsed.searchParams.get('v') ?? parsed.pathname.split('/').filter(Boolean).pop();
      return { provider: 'YOUTUBE', url: value, ...(id ? { videoId: id } : {}) };
    }
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return { provider: 'YOUTUBE', url: value, ...(id ? { videoId: id } : {}) };
    }
    if (host.includes('steampowered.com') || host.includes('akamaihd.net')) {
      return { provider: 'STEAM', url: value };
    }
  } catch {
    // Invalid legacy URLs remain available as opaque media.
  }
  return { provider: 'OTHER', url: value };
}

export function trailerKey(trailer: NormalizedTrailer): string {
  return trailer.provider === 'YOUTUBE' && trailer.videoId
    ? `youtube:${trailer.videoId.toLowerCase()}`
    : `${trailer.provider}:${trailer.url}`;
}

export interface NormalizedGame {
  title: string;
  slug?: string;
  description?: string;
  coverUrl?: string;
  heroUrl?: string;
  screenshots: string[];
  /** Trailer/gameplay URLs normalized from the external source. */
  trailers?: string[];
  /** Structured metadata retained alongside legacy URL arrays. */
  trailerDetails?: NormalizedTrailer[];
  genres: string[];
  platforms: GamePlatform[];
  releaseDate?: Date;
  developer?: string;
  publisher?: string;
  rating?: number;
  isFree?: boolean;
  igdbId?: number;
  steamAppId?: number;
  steam?: {
    storeUrl: string;
    priceCents?: number;
    discountPercent?: number;
    currency?: string;
    isAvailable: boolean;
  };
}
