export const DEFAULT_IGDB_SYNC_QUERY =
  'fields name,slug,summary,cover.url,artworks.url,screenshots.url,videos.video_id,external_games.uid,external_games.external_game_source.name,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,total_rating; where version_parent = null; limit 50;';

/** IGDB only returns game videos when videos.video_id is requested explicitly. */
export function ensureVideoField(query: string): string {
  if (/\bvideos\.video_id\b/i.test(query)) return query;
  const fields = query.match(/^(\s*fields\s+)([^;]+)(;[\s\S]*)$/i);
  if (!fields) {
    throw new Error('IGDB_SYNC_QUERY deve começar com "fields" e terminar a lista antes de ";".');
  }
  return `${fields[1]}${fields[2].trim()},videos.video_id${fields[3]}`;
}
