import assert from 'node:assert/strict';

export type MetadataStatus = 'VALID' | 'INVALID_METADATA';

export interface InvalidCompanyMetadata {
  role: string;
  name: unknown;
  companyId: number | null;
}

export interface CompanyMetadataResult {
  developer: string | null;
  publisher: string | null;
  metadataStatus: MetadataStatus;
  invalid: InvalidCompanyMetadata[];
}

export interface CompanyInput {
  developer?: boolean;
  publisher?: boolean;
  company?: { name?: unknown; id?: number };
}

/**
 * Audit and acquisition gate for developer/publisher company metadata.
 * Blocks numeric company names (e.g. "3909"), placeholders (unknown, n/a, etc.),
 * and non-string/empty names per role.
 */
export function companyMetadata(companies: CompanyInput[] = []): CompanyMetadataResult {
  const invalid: InvalidCompanyMetadata[] = [];
  const names = (role: 'developer' | 'publisher'): string | null => {
    const values = new Set<string>();
    for (const item of companies) {
      if (item[role] !== true) continue;
      const raw = item.company?.name;
      if (raw === undefined || raw === null || raw === '') continue;
      if (
        typeof raw !== 'string' ||
        /^\d+$/.test(raw.trim()) ||
        /^(unknown|n\/a|null|undefined|placeholder|tbd)$/i.test(raw.trim())
      ) {
        invalid.push({ role, name: raw, companyId: item.company?.id ?? null });
        continue;
      }
      if (raw.trim()) values.add(raw.trim());
    }
    return values.size ? [...values].join(', ') : null;
  };
  const developer = names('developer');
  const publisher = names('publisher');
  return {
    developer,
    publisher,
    metadataStatus: invalid.length ? ('INVALID_METADATA' as const) : ('VALID' as const),
    invalid,
  };
}

// Explicit PC/console evidence only, including their VR platforms. SteamVR is
// PC VR (Valve's product documentation); Quest-only is not PC evidence.
// This preserves the existing mapper's SteamVR -> PC / PSVR -> PlayStation semantics.
export const SUPPORTED_PLATFORMS = new Set([
  'pc (microsoft windows)',
  'pc',
  'linux',
  'mac',
  'steamvr',
  'windows mixed reality',
  'oculus rift',
  'playstation',
  'playstation 2',
  'playstation 3',
  'playstation 4',
  'playstation 5',
  'playstation vr',
  'playstation vr2',
  'playstation portable',
  'playstation vita',
  'xbox',
  'xbox 360',
  'xbox one',
  'xbox series x|s',
  'nintendo switch',
  'nintendo switch 2',
  'nintendo 3ds',
  'new nintendo 3ds',
  'nintendo ds',
  'nintendo dsi',
  'nintendo 64',
  'nintendo gamecube',
  'wii',
  'wii u',
  'nintendo entertainment system',
  'super nintendo entertainment system',
  'game boy',
  'game boy color',
  'game boy advance',
]);

export function supportedPlatforms(platforms: string[]): string[] {
  return platforms.filter(
    (name) => typeof name === 'string' && SUPPORTED_PLATFORMS.has(name.trim().toLowerCase()),
  );
}

export function normalizeAcquisitionTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface Identity {
  igdbId?: number | null;
  steamAppId?: number | null;
  steamAppIds?: number[];
  name?: string;
  title?: string;
  slug: string;
}

export interface SteamIdentityResult {
  steamAppIds: number[];
  steamAppId?: number;
}

export function steamIdentity(
  externalGames: Array<{ uid?: unknown; external_game_source?: { name?: string } }> = [],
): SteamIdentityResult {
  const steamAppIds = [
    ...new Set(
      externalGames.flatMap((game) => {
        if (game.external_game_source?.name?.trim().toLowerCase() !== 'steam') return [];
        const value = String(game.uid ?? '').trim();
        const id = Number(value);
        return /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? [id] : [];
      }),
    ),
  ].sort((a, b) => a - b);
  return { steamAppIds, steamAppId: steamAppIds.length === 1 ? steamAppIds[0] : undefined };
}

function steamIds(identity: Identity): number[] {
  return [...(identity.steamAppIds ?? []), ...(identity.steamAppId ? [identity.steamAppId] : [])];
}

export type DedupeStatus = 'NEW' | 'ALREADY_EXISTS' | 'AMBIGUOUS';

export interface DedupeCandidateResult {
  dedupeStatus: DedupeStatus;
  dedupeReason?: string;
}

export function dedupeCandidate(candidate: Identity, existing: Identity[]): DedupeCandidateResult {
  const title = normalizeAcquisitionTitle(candidate.name ?? candidate.title ?? '');
  const exact = existing.filter(
    (g) =>
      (candidate.igdbId && candidate.igdbId === g.igdbId) ||
      steamIds(candidate).some((id) => steamIds(g).includes(id)) ||
      [g.name ?? g.title ?? '', g.slug].some((v) => title === normalizeAcquisitionTitle(v)) ||
      (candidate.slug && candidate.slug === g.slug),
  );
  if (exact.length) {
    const conflicts =
      exact.length > 1 ||
      exact.some((g) => {
        const other = normalizeAcquisitionTitle(g.name ?? g.title ?? '');
        return !(title === other || title.includes(other) || other.includes(title));
      });
    return {
      dedupeStatus: conflicts ? ('AMBIGUOUS' as const) : ('ALREADY_EXISTS' as const),
      dedupeReason: `ID/title/slug: ${exact.map((g) => g.name ?? g.title).join(', ')}`,
    };
  }
  const similar = existing.find((g) => {
    const other = normalizeAcquisitionTitle(g.name ?? g.title ?? '');
    // Preserve the previous explicitly reviewed distinction between these sequels.
    if ([title, other].sort().join('|') === 'slaythespire|slaythespireii') return false;
    const delta = Math.abs(title.length - other.length);
    return (
      other.length > 0 &&
      (title.startsWith(other) || other.startsWith(title)) &&
      delta >= 2 &&
      delta <= 12
    );
  });
  return similar
    ? {
        dedupeStatus: 'AMBIGUOUS' as const,
        dedupeReason: `Similar title: ${similar.name ?? similar.title}`,
      }
    : { dedupeStatus: 'NEW' as const, dedupeReason: undefined };
}

export interface CandidatePartition<T> {
  ALREADY_EXISTS: T[];
  AMBIGUOUS: T[];
  NEW_WITHOUT_TRAILER: T[];
  NEW_ELIGIBLE: T[];
}

export function partitionCandidates<
  T extends { igdbId: number; dedupeStatus: string; trailerStatus: string },
>(candidates: T[]): CandidatePartition<T> {
  const groups: CandidatePartition<T> = {
    ALREADY_EXISTS: [] as T[],
    AMBIGUOUS: [] as T[],
    NEW_WITHOUT_TRAILER: [] as T[],
    NEW_ELIGIBLE: [] as T[],
  };
  assert.equal(
    new Set(candidates.map((g) => g.igdbId)).size,
    candidates.length,
    'RAW must contain unique IGDB IDs',
  );
  for (const c of candidates) {
    if (c.dedupeStatus === 'ALREADY_EXISTS') groups.ALREADY_EXISTS.push(c);
    else if (c.dedupeStatus === 'AMBIGUOUS') groups.AMBIGUOUS.push(c);
    else {
      assert.equal(c.dedupeStatus, 'NEW');
      groups[c.trailerStatus === 'PLAYABLE_TRAILER' ? 'NEW_ELIGIBLE' : 'NEW_WITHOUT_TRAILER'].push(
        c,
      );
    }
  }
  assert.equal(
    Object.values(groups).reduce((n, g) => n + g.length, 0),
    candidates.length,
  );
  return groups;
}
