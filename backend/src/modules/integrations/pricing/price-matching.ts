import type { PriceGame } from './store-price.provider.js';
import type { JsonRecord } from './v2-client.js';

export const normalized = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .replace(/[™®©]/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : '';
const baseTitle = (value: unknown) =>
  normalized(value).replace(/\s+(standard edition|edicao padrao)$/, '');
const nonBase =
  /\b(dlc|add on|addon|bundle|pack|demo|trial|soundtrack|season pass|upgrade|collection)\b/;
const editions =
  /\b(deluxe|ultimate|premium|gold|complete|definitive|goty|game of the year|collector)\b/;

export function matchesBaseGame(game: PriceGame, item: JsonRecord, knownId?: string): boolean {
  if (item.IsDLC !== 0 || item.IsDemoOrSoundtrack !== 0) return false;
  if (item.StoreClass != null && item.StoreClass !== 'FULL_GAME') return false;
  const title = baseTitle(item.ProductName);
  const expected = baseTitle(game.title);
  if (!title || title !== expected || nonBase.test(title)) return false;
  const edition = normalized(item.EditionName || item.EditionType);
  const editionMetadata = `${normalized(item.EditionName)} ${normalized(item.EditionType)}`;
  if (nonBase.test(editionMetadata)) return false;
  if (game.edition) {
    if (normalized(game.edition) !== edition) return false;
  } else if (editions.test(editionMetadata) && !editions.test(expected)) return false;
  // Stable product ID is the strongest identity; still enforce title/edition/base type.
  if (knownId) return true;
  // Name alone is never sufficient. Publisher and release must independently agree.
  if (!normalized(game.publisher) || normalized(game.publisher) !== normalized(item.Publisher))
    return false;
  if (
    !game.releaseDate ||
    typeof item.ReleaseDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(item.ReleaseDate) ||
    item.ReleaseDate === '2000-01-01'
  )
    return false;
  const release = Date.parse(item.ReleaseDate);
  return (
    Number.isFinite(release) && Math.abs(release - game.releaseDate.getTime()) <= 366 * 86400000
  );
}
