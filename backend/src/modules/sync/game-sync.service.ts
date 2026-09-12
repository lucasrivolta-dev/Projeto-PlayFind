import type { NormalizedGame } from '../games/normalized-game.js';
import { matchGames } from './game-matcher.service.js';
import type { GameRepository } from '../games/game.repository.js';
export type { GameRepository } from '../games/game.repository.js';
export class GameSyncService {
  constructor(
    private readonly repository: GameRepository,
    private readonly log: (message: string) => void = console.log,
  ) {}
  async sync(
    igdbGames: NormalizedGame[],
    steamEnricher?: (game: NormalizedGame) => Promise<NormalizedGame | undefined>,
  ) {
    let inserted = 0,
      linked = 0,
      unmatched = 0;
    for (const sourceGame of igdbGames) {
      const candidates = await this.repository.findCandidates(sourceGame);
      const match = candidates
        .map((candidate) => ({ candidate, result: matchGames(sourceGame, candidate) }))
        .sort((a, b) => b.result.score - a.result.score)[0];
      if (match?.result.matched && sourceGame.igdbId) {
        await this.repository.linkExternalIds(match.candidate.id, { igdbId: sourceGame.igdbId });
        linked++;
      } else if (!match?.result.matched) {
        await this.repository.upsertByExternalId(sourceGame);
        inserted++;
        unmatched++;
      }
      const enriched = steamEnricher ? await steamEnricher(sourceGame) : sourceGame;
      if (enriched?.steamAppId) await this.repository.upsertByExternalId(enriched);
    }
    this.log(
      `GameSync: ${igdbGames.length} IGDB recebidos; ${inserted} novos; ${linked} associados; ${unmatched} sem matching confiável.`,
    );
    return { received: igdbGames.length, inserted, linked, unmatched };
  }
}
