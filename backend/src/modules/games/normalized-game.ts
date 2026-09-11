export type GamePlatform = 'PC' | 'PlayStation' | 'Xbox' | 'Switch' | 'Mobile' | 'Other';

export interface NormalizedGame {
  title: string;
  slug?: string;
  description?: string;
  coverUrl?: string;
  heroUrl?: string;
  screenshots: string[];
  genres: string[];
  platforms: GamePlatform[];
  releaseDate?: Date;
  developer?: string;
  publisher?: string;
  rating?: number;
  igdbId?: number;
  steamAppId?: number;
  steam?: { storeUrl: string; priceCents?: number; discountPercent?: number; currency?: string; isAvailable: boolean };
}
