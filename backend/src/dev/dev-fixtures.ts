// ⚠️ DEV-ONLY FIXTURE — Não utilizar em produção.
// Ativo apenas quando NEXTPLAY_DEV_FIXTURES=true.
// Injeta um jogo sintético de teste com source Direct para validar a arquitetura ponta a ponta.

export interface DevFixtureGameOptions {
  baseUrl: string;
}

export function createDevDirectGame(options: DevFixtureGameOptions) {
  const trailerUrl = `${options.baseUrl}/dev/trailer/dev_trailer.mp4`;

  return {
    id: 'dev:direct-poc',
    slug: 'nextplay-direct-poc',
    title: '[DEV] Direct Trailer PoC',
    studio: 'NextPlay Development',
    publisher: 'NextPlay R&D',
    description:
      'Jogo sintético de teste para validação da arquitetura Direct Trailer (MP4/HLS autorizado). ' +
      'Origin: local/dev-test. MimeType: video/mp4.',
    rating: 9.9,
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.png',
    heroUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc6r9q.jpg',
    isFree: true,
    steamAppId: null,
    igdbId: null,
    genres: ['Desenvolvimento', 'Ação'],
    platforms: ['PC', 'Android'],
    screenshots: [],
    trailers: [trailerUrl],
    trailerDetails: [
      {
        provider: 'DIRECT' as const,
        url: trailerUrl,
        mimeType: 'video/mp4',
        origin: 'local/dev-test',
        providerLabel: 'NextPlay Development',
      },
    ],
    primaryTrailer: {
      provider: 'DIRECT' as const,
      url: trailerUrl,
      mimeType: 'video/mp4',
      origin: 'local/dev-test',
      providerLabel: 'NextPlay Development',
    },
    matchScore: 99,
    steam: null,
  };
}
