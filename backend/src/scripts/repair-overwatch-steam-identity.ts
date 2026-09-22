import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { SteamClient } from '../modules/integrations/steam/steam.client.js';
import { matchSteamCandidate } from '../modules/sync/steam-matcher.service.js';

export interface RepairOverwatchOptions {
  apply?: boolean;
  expectedIgdbId?: number;
  expectedWrongSteamAppId?: number;
}

export interface RepairOverwatchResult {
  status: 'SUCCESS' | 'ALREADY_CLEAN' | 'ABORTED';
  reason?: string;
  catalogCountBefore: number;
  catalogCountAfter: number;
  gameId?: string;
  igdbId?: number | null;
  steamAppIdBefore?: number | null;
  steamAppIdAfter?: number | null;
  steamOffersCountBefore?: number;
  steamOffersCountAfter?: number;
  storeOffersCountBefore?: number;
  storeOffersCountAfter?: number;
  matcherStatus?: string;
}

export async function repairOverwatchSteamIdentity(
  prisma: PrismaClient,
  steamClient: SteamClient,
  options: RepairOverwatchOptions = {},
): Promise<RepairOverwatchResult> {
  const expectedIgdbId = options.expectedIgdbId ?? 8173;
  const expectedWrongSteamAppId = options.expectedWrongSteamAppId ?? 2357570;
  const apply = options.apply === true;

  const catalogCountBefore = await prisma.game.count();

  // 1. Pre-flight read-only: query game strictly by strong identity igdbId
  const game = await prisma.game.findUnique({
    where: { igdbId: expectedIgdbId },
    include: {
      steamOffers: true,
      storeOffers: true,
    },
  });

  if (!game) {
    return {
      status: 'ABORTED',
      reason: `Game with igdbId ${expectedIgdbId} not found in database.`,
      catalogCountBefore,
      catalogCountAfter: catalogCountBefore,
    };
  }

  // Idempotency check: if already clean
  const isAlreadyClean =
    game.steamAppId === null &&
    game.steamOffers.length === 0 &&
    !game.storeOffers.some(
      (o) => o.store === 'STEAM' || o.externalProductId === String(expectedWrongSteamAppId),
    );

  if (isAlreadyClean) {
    return {
      status: 'ALREADY_CLEAN',
      reason: 'Game is already clean (steamAppId is null and no Steam offers exist).',
      catalogCountBefore,
      catalogCountAfter: catalogCountBefore,
      gameId: game.id,
      igdbId: game.igdbId,
      steamAppIdBefore: null,
      steamAppIdAfter: null,
      steamOffersCountBefore: 0,
      steamOffersCountAfter: 0,
      storeOffersCountBefore: game.storeOffers.length,
      storeOffersCountAfter: game.storeOffers.length,
      matcherStatus: 'NO_MATCH',
    };
  }

  // 2. Strict validation of current state before proceeding
  if (!game.title.toLowerCase().includes('overwatch')) {
    return {
      status: 'ABORTED',
      reason: `Title mismatch: expected Overwatch, found "${game.title}".`,
      catalogCountBefore,
      catalogCountAfter: catalogCountBefore,
      gameId: game.id,
      igdbId: game.igdbId,
      steamAppIdBefore: game.steamAppId,
    };
  }

  if (game.steamAppId !== expectedWrongSteamAppId) {
    return {
      status: 'ABORTED',
      reason: `steamAppId mismatch: expected ${expectedWrongSteamAppId}, found ${game.steamAppId}.`,
      catalogCountBefore,
      catalogCountAfter: catalogCountBefore,
      gameId: game.id,
      igdbId: game.igdbId,
      steamAppIdBefore: game.steamAppId,
    };
  }

  // 3. Matcher verification: must return NO_MATCH for candidate vs 2357570
  let matcherStatus = 'UNKNOWN';
  try {
    const steamDetails = await steamClient.details(expectedWrongSteamAppId);
    if (steamDetails?.data) {
      const parsedReleaseDate =
        game.releaseDate instanceof Date
          ? game.releaseDate
          : typeof game.releaseDate === 'string'
            ? new Date(game.releaseDate)
            : null;
      const matchResult = matchSteamCandidate(
        {
          name: game.title,
          releaseDate: parsedReleaseDate,
          releaseYear: parsedReleaseDate ? parsedReleaseDate.getUTCFullYear() : 2016,
          developer: game.studio,
          publisher: game.publisher,
        },
        {
          appId: expectedWrongSteamAppId,
          name: steamDetails.data.name ?? '',
          type: steamDetails.data.type,
          releaseDateRaw: steamDetails.data.release_date?.date,
          developers: steamDetails.data.developers,
          publishers: steamDetails.data.publishers,
        },
      );
      matcherStatus = matchResult.status;
    }
  } catch (err: any) {
    matcherStatus = `ERROR: ${err?.message ?? err}`;
  }

  if (matcherStatus !== 'NO_MATCH') {
    return {
      status: 'ABORTED',
      reason: `Matcher safety check failed: expected NO_MATCH, got ${matcherStatus}.`,
      catalogCountBefore,
      catalogCountAfter: catalogCountBefore,
      gameId: game.id,
      igdbId: game.igdbId,
      steamAppIdBefore: game.steamAppId,
      matcherStatus,
    };
  }

  if (!apply) {
    return {
      status: 'ABORTED',
      reason: 'Dry-run: write was not applied (--apply not specified).',
      catalogCountBefore,
      catalogCountAfter: catalogCountBefore,
      gameId: game.id,
      igdbId: game.igdbId,
      steamAppIdBefore: game.steamAppId,
      steamOffersCountBefore: game.steamOffers.length,
      storeOffersCountBefore: game.storeOffers.length,
      matcherStatus,
    };
  }

  // 4. Atomic transaction: clean SteamAppId and remove Steam offers for 2357570
  await prisma.$transaction(async (tx) => {
    // Remove steamOffers for this game
    await tx.steamOffer.deleteMany({
      where: {
        gameId: game.id,
      },
    });

    // Remove storeOffers specifically linked to STEAM or externalProductId 2357570
    await tx.storeOffer.deleteMany({
      where: {
        gameId: game.id,
        OR: [
          { store: 'STEAM' },
          { externalProductId: String(expectedWrongSteamAppId) },
        ],
      },
    });

    // Update game: clear steamAppId
    await tx.game.update({
      where: { id: game.id },
      data: { steamAppId: null },
    });
  });

  // 5. Post-write verification
  const catalogCountAfter = await prisma.game.count();
  const refreshed = await prisma.game.findUnique({
    where: { id: game.id },
    include: {
      steamOffers: true,
      storeOffers: true,
    },
  });

  if (!refreshed) {
    throw new Error(`CRITICAL: Game ${game.id} could not be retrieved post-write.`);
  }

  if (catalogCountBefore !== catalogCountAfter) {
    throw new Error(
      `CRITICAL: Catalog count changed! Before: ${catalogCountBefore}, After: ${catalogCountAfter}`,
    );
  }

  if (refreshed.steamAppId !== null) {
    throw new Error(`CRITICAL: steamAppId was not cleared (current: ${refreshed.steamAppId}).`);
  }

  if (refreshed.steamOffers.length !== 0) {
    throw new Error(`CRITICAL: steamOffers still exist (${refreshed.steamOffers.length}).`);
  }

  return {
    status: 'SUCCESS',
    catalogCountBefore,
    catalogCountAfter,
    gameId: refreshed.id,
    igdbId: refreshed.igdbId,
    steamAppIdBefore: game.steamAppId,
    steamAppIdAfter: refreshed.steamAppId,
    steamOffersCountBefore: game.steamOffers.length,
    steamOffersCountAfter: refreshed.steamOffers.length,
    storeOffersCountBefore: game.storeOffers.length,
    storeOffersCountAfter: refreshed.storeOffers.length,
    matcherStatus,
  };
}

async function runCli() {
  const isApply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const steamKey = process.env.STEAM_API_KEY || '';
  const steamClient = new SteamClient(steamKey);

  console.log('='.repeat(80));
  console.log(`REPARAÇÃO OPERACIONAL: OVERWATCH STEAM IDENTITY (${isApply ? 'APPLY' : 'DRY-RUN'})`);
  console.log('='.repeat(80));

  try {
    const result = await repairOverwatchSteamIdentity(prisma, steamClient, {
      apply: isApply,
    });

    console.log('\nRESULTADO DA OPERAÇÃO:');
    console.log(`Status: ${result.status}`);
    if (result.reason) console.log(`Motivo: ${result.reason}`);
    console.log(`CATALOG_COUNT_BEFORE: ${result.catalogCountBefore}`);
    console.log(`CATALOG_COUNT_AFTER:  ${result.catalogCountAfter}`);
    console.log(`Overwatch UUID:       ${result.gameId}`);
    console.log(`IGDB ID:              ${result.igdbId}`);
    console.log(`steamAppId BEFORE:    ${result.steamAppIdBefore}`);
    console.log(`steamAppId AFTER:     ${result.steamAppIdAfter}`);
    console.log(`Steam offers BEFORE:  ${result.steamOffersCountBefore}`);
    console.log(`Steam offers AFTER:   ${result.steamOffersCountAfter}`);
    console.log(`Store offers BEFORE:  ${result.storeOffersCountBefore}`);
    console.log(`Store offers AFTER:   ${result.storeOffersCountAfter}`);
    console.log(`Matcher result:       ${result.matcherStatus}`);
    console.log('='.repeat(80));
  } finally {
    await prisma.$disconnect();
  }
}

// Only execute CLI if directly run
const isMain = process.argv[1]?.endsWith('repair-overwatch-steam-identity.ts');
if (isMain) {
  runCli().catch(console.error);
}
