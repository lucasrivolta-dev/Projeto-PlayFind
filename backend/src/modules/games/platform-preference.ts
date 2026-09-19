import type { GamePlatform } from './normalized-game.js';

// Exact aliases for the canonical families persisted by the catalog mappers.
const aliases: Record<string, GamePlatform | 'Steam'> = {
  pc: 'PC', windows: 'PC', 'pc (microsoft windows)': 'PC',
  steam: 'Steam', 'steam (pc)': 'Steam',
  playstation: 'PlayStation', ps: 'PlayStation', ps4: 'PlayStation', ps5: 'PlayStation',
  'playstation 4': 'PlayStation', 'playstation 5': 'PlayStation',
  xbox: 'Xbox', 'xbox one': 'Xbox', 'xbox series x|s': 'Xbox',
  switch: 'Switch', nintendo: 'Switch', 'nintendo switch': 'Switch',
};

export function matchesPlatformPreference(
  preferences: string[],
  platforms: string[],
  hasSteam: boolean,
): boolean {
  const families = new Set(platforms.map((name) => aliases[name.trim().toLowerCase()]));
  return preferences.some((name) => {
    const family = aliases[name.trim().toLowerCase()];
    if (!family) return false;
    return family === 'Steam' ? hasSteam : families.has(family);
  });
}
