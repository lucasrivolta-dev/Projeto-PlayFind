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
      // External IDs are authoritative. Metadata matching is only a fallback
      // for an existing record that has not been linked yet.
      const directMatch = candidates.find(
        (candidate) =>
          (sourceGame.igdbId !== undefined && candidate.igdbId === sourceGame.igdbId) ||
          (sourceGame.steamAppId !== undefined && candidate.steamAppId === sourceGame.steamAppId),
      );
      const match = candidates
        .map((candidate) => ({ candidate, result: matchGames(sourceGame, candidate) }))
        .sort(
          (a, b) => b.result.score - a.result.score || a.candidate.id.localeCompare(b.candidate.id),
        )[0];

      let canonical: NormalizedGame;
      if (directMatch) {
        canonical = await this.repository.upsertByExternalId(sourceGame);
        linked++;
      } else if (match?.result.matched) {
        await this.repository.linkExternalIds(match.candidate.id, {
          ...(sourceGame.igdbId !== undefined ? { igdbId: sourceGame.igdbId } : {}),
          ...(sourceGame.steamAppId !== undefined ? { steamAppId: sourceGame.steamAppId } : {}),
        });
        // Linking alone would leave stale IGDB fields. The second upsert now
        // resolves through the freshly linked ID and applies the new metadata
        // to the same database row.
        canonical = await this.repository.upsertByExternalId(sourceGame);
        linked++;
      } else {
        canonical = await this.repository.upsertByExternalId(sourceGame);
        inserted++;
        unmatched++;
      }

      const enriched = steamEnricher ? await steamEnricher(canonical) : undefined;
      if (enriched && (enriched.steamAppId !== undefined || enriched.steam)) {
        await this.repository.upsertByExternalId(enriched);
      }
    }
    this.log(
      `GameSync: ${igdbGames.length} IGDB recebidos; ${inserted} novos; ${linked} associados; ${unmatched} sem matching confiável.`,
    );
    return { received: igdbGames.length, inserted, linked, unmatched };
  }
}
