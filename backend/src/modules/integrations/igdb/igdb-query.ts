export const DEFAULT_IGDB_SYNC_QUERY =
  'fields name,slug,summary,cover.url,artworks.url,screenshots.url,videos.video_id,videos.name,external_games.uid,external_games.external_game_source.name,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,rating_count,total_rating,total_rating_count; where game_type = 0 & version_parent = null & cover != null & total_rating_count >= 10 & total_rating >= 60; sort total_rating desc; limit 50;';

export const MAX_SYNC_LIMIT = 100;
export const DISCOVER_POOL_MULTIPLIER = 5;
export const DISCOVER_POOL_MAX = 100;
export const DISCOVER_CONFIDENCE_M = 50;
export const DISCOVER_BASELINE_C = 75;
const DEFAULT_LIMIT = 20;
const RECENT_WINDOW_DAYS = 5 * 365;
const GAME_FIELDS =
  'name,slug,summary,cover.url,artworks.url,screenshots.url,videos.video_id,videos.name,external_games.uid,external_games.external_game_source.name,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,rating_count,total_rating,total_rating_count';

export type SyncMode = 'default' | 'id' | 'popular' | 'recent' | 'discover' | 'custom';
export interface SyncCliOptions {
  mode: SyncMode;
  limit: number;
  igdbId?: number;
  dryRun: boolean;
}

function parsePositiveInteger(value: string, option: string, max = MAX_SYNC_LIMIT): number {
  if (!/^\d+$/.test(value)) throw new Error(`${option} deve ser um inteiro positivo.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new Error(`${option} deve estar entre 1 e ${MAX_SYNC_LIMIT}.`);
  }
  return number;
}

function parseIgdbId(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('--id deve ser um inteiro positivo.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('--id deve ser um inteiro positivo.');
  return number;
}

export function parseSyncArgs(args: string[]): SyncCliOptions {
  if (args[0] === '--') args = args.slice(1);
  let mode: SyncMode = 'default';
  let limit = DEFAULT_LIMIT;
  let igdbId: number | undefined;
  let sawLimit = false;
  let sawMode = false;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--id') {
      if (igdbId !== undefined || index + 1 >= args.length)
        throw new Error('--id deve ser informado uma vez com um valor.');
      igdbId = parseIgdbId(args[++index]);
      mode = 'id';
    } else if (arg === '--limit') {
      if (sawLimit || index + 1 >= args.length)
        throw new Error('--limit deve ser informado uma vez com um valor.');
      limit = parsePositiveInteger(args[++index], '--limit');
      sawLimit = true;
    } else if (arg === '--mode') {
      if (sawMode || index + 1 >= args.length)
        throw new Error('--mode deve ser informado uma vez.');
      const value = args[++index];
      if (!['popular', 'recent', 'discover'].includes(value))
        throw new Error('--mode aceita apenas popular, recent ou discover.');
      mode = value as SyncMode;
      sawMode = true;
    } else if (arg === '--dry-run') {
      if (dryRun) throw new Error('--dry-run informado mais de uma vez.');
      dryRun = true;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  if (igdbId !== undefined && (sawLimit || sawMode)) {
    throw new Error('--id não pode ser combinado com --limit ou --mode.');
  }
  if (igdbId !== undefined) limit = 1;
  return { mode, limit, dryRun, ...(igdbId !== undefined ? { igdbId } : {}) };
}

export function buildSyncQuery(options: SyncCliOptions, now = new Date()): string {
  const fields = `fields ${GAME_FIELDS};`;
  if (options.mode === 'id') return `${fields} where id = ${options.igdbId}; limit 1;`;
  if (options.mode === 'popular') {
    return `${fields} where version_parent = null & cover != null & first_release_date != null & total_rating_count != null; sort total_rating_count desc; limit ${options.limit};`;
  }
  if (options.mode === 'recent') {
    const cutoff = Math.floor(now.getTime() / 1000) - RECENT_WINDOW_DAYS * 24 * 60 * 60;
    const current = Math.floor(now.getTime() / 1000);
    return `${fields} where version_parent = null & cover != null & first_release_date >= ${cutoff} & first_release_date <= ${current}; sort first_release_date desc; limit ${options.limit};`;
  }
  if (options.mode === 'discover') {
    const poolLimit = Math.min(options.limit * DISCOVER_POOL_MULTIPLIER, DISCOVER_POOL_MAX);
    const cutoff = Math.floor(now.getTime() / 1000) - RECENT_WINDOW_DAYS * 24 * 60 * 60;
    const current = Math.floor(now.getTime() / 1000);
    return `${fields} where game_type = 0 & version_parent = null & cover != null & first_release_date >= ${cutoff} & first_release_date <= ${current} & total_rating != null & total_rating >= 70 & total_rating_count >= 20 & total_rating_count <= 500; limit ${poolLimit};`;
  }
  // Modo default: catálogo de qualidade — jogos principais com capa, ao menos
  // 10 avaliações e nota >= 60/100. Elimina DLCs, expansões, títulos obsoletos
  // e entradas com dados insuficientes, acolhendo clássicos de qualquer ano.
  const current = Math.floor(now.getTime() / 1000);
  return `${fields} where game_type = 0 & version_parent = null & cover != null & first_release_date <= ${current} & total_rating_count >= 10 & total_rating >= 60; sort total_rating desc; limit ${options.limit};`;
}

export interface DiscoverCandidate {
  id: number;
  name: string;
  total_rating?: number;
  total_rating_count?: number;
  first_release_date?: number;
  [key: string]: unknown;
}

export function rankDiscoverCandidates<T extends DiscoverCandidate>(
  candidates: T[],
): Array<T & { adjustedRating: number }> {
  return candidates
    .filter(
      (candidate) =>
        Number.isFinite(candidate.total_rating) && Number.isFinite(candidate.total_rating_count),
    )
    .map((candidate) => {
      const R = candidate.total_rating as number;
      const v = candidate.total_rating_count as number;
      const adjustedRating =
        (v / (v + DISCOVER_CONFIDENCE_M)) * R +
        (DISCOVER_CONFIDENCE_M / (v + DISCOVER_CONFIDENCE_M)) * DISCOVER_BASELINE_C;
      return { ...candidate, adjustedRating };
    })
    .sort(
      (a, b) =>
        b.adjustedRating - a.adjustedRating ||
        (b.total_rating_count ?? 0) - (a.total_rating_count ?? 0) ||
        a.id - b.id,
    );
}

/** IGDB only returns game videos when videos.video_id is requested explicitly. */
export function ensureVideoField(query: string): string {
  if (/\bvideos\.video_id\b/i.test(query)) return query;
  const fields = query.match(/^(\s*fields\s+)([^;]+)(;[\s\S]*)$/i);
  if (!fields) {
    throw new Error('IGDB_SYNC_QUERY deve começar com "fields" e terminar a lista antes de ";".');
  }
  return `${fields[1]}${fields[2].trim()},videos.video_id${fields[3]}`;
}
