import type { NormalizedGame } from '../games/normalized-game.js';
function normalize(value?: string) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export interface MatchResult {
  matched: boolean;
  score: number;
  reasons: string[];
}
export function matchGames(a: NormalizedGame, b: NormalizedGame): MatchResult {
  const reasons: string[] = [];
  let score = 0;
  if (normalize(a.title) === normalize(b.title)) {
    score += 50;
    reasons.push('nome normalizado');
  } else return { matched: false, score: 0, reasons: ['nome incompatível'] };
  if (a.releaseDate && b.releaseDate) {
    const releaseDistance = Math.abs(a.releaseDate.getTime() - b.releaseDate.getTime());
    if (releaseDistance > 1000 * 60 * 60 * 24 * 730) {
      // Identical names separated by more than two years are commonly remakes,
      // re-releases or different products. Keep them separate without a
      // trusted external ID instead of relying on the remaining metadata.
      return { matched: false, score, reasons: ['lançamentos distantes'] };
    }
    score += 20;
    reasons.push('lançamento próximo');
  }
  if (a.developer && b.developer && normalize(a.developer) === normalize(b.developer)) {
    score += 15;
    reasons.push('desenvolvedora');
  }
  if (a.publisher && b.publisher && normalize(a.publisher) === normalize(b.publisher)) {
    score += 10;
    reasons.push('publisher');
  }
  if (a.platforms.some((platform) => b.platforms.includes(platform))) {
    score += 5;
    reasons.push('plataforma compartilhada');
  }
  return { matched: score >= 70, score, reasons };
}
