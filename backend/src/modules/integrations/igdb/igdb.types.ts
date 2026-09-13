export interface IgdbGameDto {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  rating?: number;
  total_rating?: number;
  popularity?: number;
  first_release_date?: number;
  cover?: {
    url?: string;
  };
  artworks?: {
    url?: string;
  }[];
  screenshots?: {
    url?: string;
  }[];
  genres?: {
    name: string;
  }[];
  platforms?: {
    name: string;
  }[];
  videos?: {
    video_id?: string;
    name?: string;
  }[];
  external_games?: {
    uid?: string | number;
    external_game_source?: {
      name?: string;
    };
  }[];
  involved_companies?: {
    developer?: boolean;
    publisher?: boolean;
    company?: {
      name: string;
    };
  }[];
}
