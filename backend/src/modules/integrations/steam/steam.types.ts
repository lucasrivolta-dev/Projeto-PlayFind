export interface SteamAppDetailsDto {
  success: boolean;
  data?: {
    name?: string;
    steam_appid?: number;
    short_description?: string;
    header_image?: string;
    screenshots?: {
      path_thumbnail?: string;
      path_full?: string;
    }[];
    movies?: {
      id?: number;
      thumbnail?: string;
      webm?: { max?: string; ['480']?: string };
      mp4?: { max?: string; ['480']?: string };
    }[];
    developers?: string[];
    publishers?: string[];
    release_date?: {
      date?: string;
    };
    genres?: {
      description?: string;
    }[];
    platforms?: {
      windows?: boolean;
      mac?: boolean;
      linux?: boolean;
    };
    price_overview?: {
      final?: number;
      discount_percent?: number;
      currency?: string;
    };
    is_free?: boolean;
  };
}
