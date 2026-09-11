class DiscoveryGame {
  const DiscoveryGame(
      {required this.id,
      required this.title,
      required this.studio,
      required this.genre,
      required this.description,
      required this.rating,
      this.tags = const [],
      this.platforms = const ['PC'],
      this.collection = 'destaques',
      this.offer = false,
      this.free = false,
      this.releaseDate,
      this.mode,
      this.publisher});
  final String? releaseDate, mode, publisher;
  final int id;
  final String title, studio, genre, description, rating, collection;
  final List<String> tags, platforms;
  final bool offer, free;
}

abstract interface class ExploreRepository {
  Future<List<DiscoveryGame>> load();
}

/// Editorial demo catalog. No live prices or personalized ranking are claimed.
class DemoExploreRepository implements ExploreRepository {
  @override
  Future<List<DiscoveryGame>> load() async => const [
        DiscoveryGame(
            id: 1145360,
            title: 'Hades',
            studio: 'Supergiant Games',
            genre: 'Roguelike',
            description:
                'Desafie o deus dos mortos e encontre sua saída do submundo. Cada tentativa conta uma nova história.',
            rating: '9.6',
            tags: ['Indies', 'Ação', 'RPG'],
            platforms: ['PC', 'PlayStation', 'Xbox', 'Switch']),
        DiscoveryGame(
            id: 2679460,
            title: 'Metaphor: ReFantazio',
            studio: 'ATLUS',
            genre: 'RPG',
            rating: '9.4',
            description:
                'Uma jornada de fantasia em que laços, escolhas e coragem mudam o destino de um reino.',
            platforms: ['PC', 'PlayStation', 'Xbox'],
            collection: 'destaques'),
        DiscoveryGame(
            id: 1938090,
            title: 'Call of Duty: Warzone',
            studio: 'Activision',
            genre: 'FPS',
            rating: '8.0',
            description:
                'Reúna seu esquadrão e encare uma disputa de sobrevivência em equipe.',
            tags: ['Co-op', 'Multiplayer'],
            platforms: ['PC', 'PlayStation', 'Xbox'],
            free: true),
        DiscoveryGame(
            id: 813230,
            title: 'Animal Well',
            studio: 'Shared Memory',
            genre: 'Metroidvania',
            rating: '9.2',
            description:
                'Explore um labirinto vivo de segredos, criaturas e enigmas. Observe. Experimente. Descubra.',
            tags: ['Indies', 'Exploração'],
            platforms: ['PC', 'PlayStation', 'Switch'],
            collection: 'hidden'),
        DiscoveryGame(
            id: 2379780,
            title: 'Balatro',
            studio: 'LocalThunk',
            genre: 'Roguelike',
            rating: '9.5',
            description:
                'Mãos de pôquer, curingas imprevisíveis e combinações que quebram todas as regras.',
            tags: ['Indies', 'Estratégia'],
            platforms: ['PC', 'PlayStation', 'Xbox', 'Switch'],
            collection: 'hidden'),
        DiscoveryGame(
            id: 1091500,
            title: 'Cyberpunk 2077',
            studio: 'CD PROJEKT RED',
            genre: 'RPG',
            rating: '9.0',
            description:
                'Construa sua lenda nas ruas de Night City, uma metrópole obcecada por poder e tecnologia.',
            tags: ['Mundo aberto'],
            platforms: ['PC', 'PlayStation', 'Xbox'],
            offer: true),
        DiscoveryGame(
            id: 1245620,
            title: 'Elden Ring',
            studio: 'FromSoftware',
            genre: 'RPG',
            rating: '9.6',
            description:
                'Encontre seu caminho pelas Terras Intermédias. Grandes desafios esperam além de cada horizonte.',
            tags: ['Mundo aberto', 'Co-op'],
            platforms: ['PC', 'PlayStation', 'Xbox'],
            offer: true),
        DiscoveryGame(
            id: 553850,
            title: 'Helldivers 2',
            studio: 'Arrowhead',
            genre: 'Ação',
            rating: '8.8',
            description:
                'Encare missões caóticas com seu esquadrão. A sobrevivência depende do trabalho em equipe.',
            tags: ['Co-op', 'Multiplayer'],
            platforms: ['PC', 'PlayStation'],
            collection: 'amigos'),
        DiscoveryGame(
            id: 1426210,
            title: 'It Takes Two',
            studio: 'Hazelight',
            genre: 'Aventura',
            rating: '9.5',
            description:
                'Uma aventura feita para dois, cheia de mundos imaginativos e desafios para resolver juntos.',
            tags: ['Co-op'],
            platforms: ['PC', 'PlayStation', 'Xbox', 'Switch'],
            collection: 'amigos'),
        DiscoveryGame(
            id: 739630,
            title: 'Phasmophobia',
            studio: 'Kinetic Games',
            genre: 'Terror',
            rating: '9.0',
            description:
                'Investigue locais assombrados com até quatro jogadores. Cada pista pode revelar o inesperado.',
            tags: ['Co-op', 'Indies'],
            platforms: ['PC', 'PlayStation', 'Xbox'],
            collection: 'amigos'),
        DiscoveryGame(
            id: 1966720,
            title: 'Lethal Company',
            studio: 'Zeekerss',
            genre: 'Terror',
            rating: '9.3',
            description:
                'Vasculhe luas abandonadas com seus amigos e tente voltar para a nave com tudo inteiro.',
            tags: ['Co-op', 'Indies'],
            collection: 'hidden'),
        DiscoveryGame(
            id: 1458140,
            title: 'Pacific Drive',
            studio: 'Ironwood Studios',
            publisher: 'Kepler Interactive',
            genre: 'Sobrevivência / Corrida',
            releaseDate: '22 Fev 2024',
            mode: 'Single-player',
            rating: '9.0',
            platforms: ['PC', 'PlayStation'],
            tags: ['Sobrevivência', 'Exploração'],
            description:
                'Pacific Drive é um jogo de sobrevivência em primeira pessoa baseado em viagens de carro, ambientado na misteriosa e surreal Zona de Exclusão Olímpica. Sua única companhia e salvação é uma perua vintage que você deve customizar, consertar e proteger contra anomalias radioativas sobrenaturais.'),
      ];
}
