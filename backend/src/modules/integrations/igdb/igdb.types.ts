export interface IgdbGameDto {
  id: number; name: string; slug?: string; summary?: string; rating?: number; first_release_date?: number;
  cover?: { url?: string }; artworks?: { url?: string }[]; screenshots?: { url?: string }[];
  genres?: { name: string }[]; platforms?: { name: string }[];
  involved_companies?: { developer?: boolean; publisher?: boolean; company?: { name: string } }[];
}
