/**
 * IGDB Game Category / game_type semantics:
 * 0 = Main Game
 * 1 = DLC Addon
 * 2 = Expansion
 * 3 = Bundle
 * 4 = Standalone Expansion
 * 5 = Mod
 * 6 = Episode
 * 7 = Season
 * 8 = Remake
 * 9 = Remaster
 * 10 = Expanded Game
 * 11 = Port
 * 12 = Fork
 * 13 = Pack
 * 14 = Update
 *
 * NextPlay accepts standalone, complete games:
 * Main Game (0), Remake (8), Remaster (9).
 * Expanded Game (10), DLCs, mods, expansions, packs, etc. are excluded
 * to prevent redundant commercial re-releases/editions from polluting discovery.
 */
export const ELIGIBLE_IGDB_GAME_TYPES = [0, 8, 9] as const;
export const IGDB_GAME_TYPE_FILTER = 'game_type = (0, 8, 9)';

export const EDITORIAL_MIN_RATING = 60;
export const EDITORIAL_MIN_RATING_COUNT = 10;

export const DEFAULT_IGDB_SYNC_QUERY =
  `fields name,slug,game_type,summary,cover.url,artworks.url,screenshots.url,videos.video_id,videos.name,external_games.uid,external_games.external_game_source.name,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,rating_count,total_rating,total_rating_count; where ${IGDB_GAME_TYPE_FILTER} & version_parent = null & cover != null & total_rating_count >= 10 & total_rating >= 60; sort total_rating desc; limit 50;`;

export const MAX_SYNC_LIMIT = 100;
export const DISCOVER_POOL_MULTIPLIER = 5;
export const DISCOVER_POOL_MAX = 100;
export const DISCOVER_CONFIDENCE_M = 50;
export const DISCOVER_BASELINE_C = 75;
const DEFAULT_LIMIT = 20;
const RECENT_WINDOW_DAYS = 5 * 365;
const GAME_FIELDS =
  'name,slug,game_type,summary,cover.url,artworks.url,screenshots.url,videos.video_id,videos.name,external_games.uid,external_games.external_game_source.name,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,rating,rating_count,total_rating,total_rating_count,themes.name,themes.id';

export type ExposureBand = 'emerging' | 'discovery' | 'mid_tail' | 'older_gems';
export const EXPOSURE_BANDS: ExposureBand[] = ['emerging', 'discovery', 'mid_tail', 'older_gems'];

export type GenreCluster =
  | 'strategy_tactical'
  | 'simulation'
  | 'racing'
  | 'horror'
  | 'puzzle_point_click'
  | 'niche_rpg'
  | 'platform_action_indie';
export const GENRE_CLUSTERS: GenreCluster[] = [
  'strategy_tactical',
  'simulation',
  'racing',
  'horror',
  'puzzle_point_click',
  'niche_rpg',
  'platform_action_indie',
];

export interface BandConfig {
  minRating: number;
  minVotes: number;
  maxVotes: number;
  windowMinYears: number;
  windowMaxYears?: number;
  confidenceM: number;
  baselineC: number;
}

export const BAND_CONFIGS: Record<ExposureBand, BandConfig> = {
  emerging: {
    minRating: 80,
    minVotes: 10,
    maxVotes: 99,
    windowMinYears: 5,
    confidenceM: 40,
    baselineC: 75,
  },
  discovery: {
    minRating: 75,
    minVotes: 100,
    maxVotes: 499,
    windowMinYears: 5,
    confidenceM: 50,
    baselineC: 75,
  },
  mid_tail: {
    minRating: 75,
    minVotes: 500,
    maxVotes: 1500,
    windowMinYears: 6,
    confidenceM: 60,
    baselineC: 75,
  },
  older_gems: {
    minRating: 80,
    minVotes: 20,
    maxVotes: 1500,
    windowMinYears: 12,
    windowMaxYears: 6,
    confidenceM: 60,
    baselineC: 75,
  },
};

export const GENRE_CLUSTER_FILTERS: Record<GenreCluster, string> = {
  strategy_tactical: 'genres = (11, 15, 16, 24)',
  simulation: 'genres = (13)',
  racing: 'genres = (10)',
  horror: 'themes = (19)',
  puzzle_point_click: 'genres = (2, 9)',
  niche_rpg: 'genres = (12)',
  platform_action_indie: 'genres = (8, 25, 32)',
};

export function normalizeGenreCluster(input: string): GenreCluster {
  const v = input.toLowerCase().trim().replace(/[- /]/g, '_');
  if (v === 'strategy' || v === 'tactical' || v === 'strategy_tactical') return 'strategy_tactical';
  if (v === 'simulation' || v === 'simulator') return 'simulation';
  if (v === 'racing' || v === 'corrida') return 'racing';
  if (v === 'horror' || v === 'terror') return 'horror';
  if (v === 'puzzle' || v === 'point_and_click' || v === 'point_click' || v === 'puzzle_point_click')
    return 'puzzle_point_click';
  if (v === 'rpg' || v === 'niche_rpg') return 'niche_rpg';
  if (v === 'platform' || v === 'action_indie' || v === 'indie' || v === 'platform_action_indie')
    return 'platform_action_indie';
  if (GENRE_CLUSTERS.includes(v as GenreCluster)) return v as GenreCluster;
  throw new Error(`Gênero não suportado: "${input}". Clusters aceitos: ${GENRE_CLUSTERS.join(', ')}`);
}

export type SyncMode = 'default' | 'id' | 'popular' | 'recent' | 'discover' | 'custom';
export interface SyncCliOptions {
  mode: SyncMode;
  limit: number;
  igdbId?: number;
  dryRun: boolean;
  band?: ExposureBand;
  genre?: GenreCluster;
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
  let band: ExposureBand | undefined;
  let genre: GenreCluster | undefined;
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
    } else if (arg === '--band') {
      if (band !== undefined || index + 1 >= args.length)
        throw new Error('--band deve ser informado uma vez com um valor.');
      const value = args[++index].toLowerCase().trim() as ExposureBand;
      if (!EXPOSURE_BANDS.includes(value)) {
        throw new Error(`--band aceita apenas: ${EXPOSURE_BANDS.join(', ')}.`);
      }
      band = value;
      if (!sawMode) mode = 'discover';
    } else if (arg === '--genre') {
      if (genre !== undefined || index + 1 >= args.length)
        throw new Error('--genre deve ser informado uma vez com um valor.');
      genre = normalizeGenreCluster(args[++index]);
      if (!sawMode) mode = 'discover';
    } else if (arg === '--dry-run') {
      if (dryRun) throw new Error('--dry-run informado mais de uma vez.');
      dryRun = true;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  if (igdbId !== undefined && (sawLimit || sawMode || band !== undefined || genre !== undefined)) {
    throw new Error('--id não pode ser combinado com --limit, --mode, --band ou --genre.');
  }
  if (igdbId !== undefined) limit = 1;
  return {
    mode,
    limit,
    dryRun,
    ...(igdbId !== undefined ? { igdbId } : {}),
    ...(band !== undefined ? { band } : {}),
    ...(genre !== undefined ? { genre } : {}),
  };
}

export function buildSyncQuery(options: SyncCliOptions, now = new Date()): string {
  const fields = `fields ${GAME_FIELDS};`;
  if (options.mode === 'id') return `${fields} where id = ${options.igdbId}; limit 1;`;
  if (options.mode === 'popular') {
    return `${fields} where ${IGDB_GAME_TYPE_FILTER} & version_parent = null & cover != null & first_release_date != null & total_rating_count != null; sort total_rating_count desc; limit ${options.limit};`;
  }
  if (options.mode === 'recent') {
    const cutoff = Math.floor(now.getTime() / 1000) - RECENT_WINDOW_DAYS * 24 * 60 * 60;
    const current = Math.floor(now.getTime() / 1000);
    return `${fields} where ${IGDB_GAME_TYPE_FILTER} & version_parent = null & cover != null & first_release_date >= ${cutoff} & first_release_date <= ${current} & total_rating_count >= ${EDITORIAL_MIN_RATING_COUNT} & total_rating >= ${EDITORIAL_MIN_RATING}; sort first_release_date desc; limit ${options.limit};`;
  }

  // Segmented Discovery by Exposure Band or Genre Cluster
  if (options.band !== undefined || options.genre !== undefined || options.mode === 'discover') {
    const poolLimit = Math.min(options.limit * DISCOVER_POOL_MULTIPLIER, DISCOVER_POOL_MAX);
    const genreFilter = options.genre ? ` & ${GENRE_CLUSTER_FILTERS[options.genre]}` : '';

    if (options.band) {
      const config = BAND_CONFIGS[options.band];
      const minCutoff = Math.floor(now.getTime() / 1000) - config.windowMinYears * 365 * 24 * 60 * 60;
      const maxCutoff = config.windowMaxYears
        ? Math.floor(now.getTime() / 1000) - config.windowMaxYears * 365 * 24 * 60 * 60
        : Math.floor(now.getTime() / 1000);

      return `${fields} where ${IGDB_GAME_TYPE_FILTER} & version_parent = null & cover != null & first_release_date >= ${minCutoff} & first_release_date <= ${maxCutoff} & total_rating != null & total_rating >= ${config.minRating} & total_rating_count >= ${config.minVotes} & total_rating_count <= ${config.maxVotes}${genreFilter}; sort total_rating desc; limit ${poolLimit};`;
    }

    // Default legacy discover mode
    const cutoff = Math.floor(now.getTime() / 1000) - RECENT_WINDOW_DAYS * 24 * 60 * 60;
    const current = Math.floor(now.getTime() / 1000);
    return `${fields} where ${IGDB_GAME_TYPE_FILTER} & version_parent = null & cover != null & first_release_date >= ${cutoff} & first_release_date <= ${current} & total_rating != null & total_rating >= 70 & total_rating_count >= 20 & total_rating_count <= 500${genreFilter}; sort total_rating desc; limit ${poolLimit};`;
  }

  // Modo default: catálogo de qualidade — jogos principais, remakes e remasters
  const current = Math.floor(now.getTime() / 1000);
  return `${fields} where ${IGDB_GAME_TYPE_FILTER} & version_parent = null & cover != null & first_release_date <= ${current} & total_rating_count >= ${EDITORIAL_MIN_RATING_COUNT} & total_rating >= ${EDITORIAL_MIN_RATING}; sort total_rating desc; limit ${options.limit};`;
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
  band?: ExposureBand,
): Array<T & { adjustedRating: number }> {
  const confidenceM = band ? BAND_CONFIGS[band].confidenceM : DISCOVER_CONFIDENCE_M;
  const baselineC = band ? BAND_CONFIGS[band].baselineC : DISCOVER_BASELINE_C;

  return candidates
    .filter(
      (candidate) =>
        Number.isFinite(candidate.total_rating) && Number.isFinite(candidate.total_rating_count),
    )
    .map((candidate) => {
      const R = candidate.total_rating as number;
      const v = candidate.total_rating_count as number;
      const adjustedRating =
        (v / (v + confidenceM)) * R +
        (confidenceM / (v + confidenceM)) * baselineC;
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
