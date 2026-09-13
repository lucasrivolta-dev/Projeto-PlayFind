import type { NormalizedGame } from './normalized-game.js';
export interface StoredGame extends NormalizedGame {
  id: string;
}

export interface GameRepository {
  upsertByExternalId(game: NormalizedGame): Promise<NormalizedGame>;
  findCandidates(game: NormalizedGame): Promise<StoredGame[]>;
  linkExternalIds(
    gameId: string,
    ids: {
      igdbId?: number;
      steamAppId?: number;
    },
  ): Promise<void>;
  markSynced(gameId: string): Promise<void>;
}
