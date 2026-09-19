import 'dart:async';
import 'dart:convert';
import 'dart:io' show SocketException;
import 'package:http/http.dart' as http;
import '../../config/api_config.dart';
import '../feed/trailer_info.dart';

class StoreOfferInfo {
  const StoreOfferInfo({
    required this.store,
    this.storeUrl,
    this.originalPriceCents,
    this.finalPriceCents,
    this.discountPercent = 0,
    this.currency = 'BRL',
    this.isAvailable = true,
  });

  final String store;
  final String? storeUrl;
  final int? originalPriceCents;
  final int? finalPriceCents;
  final int discountPercent;
  final String currency;
  final bool isAvailable;

  bool get hasDiscount => discountPercent > 0;
  bool get hasPrice => finalPriceCents != null;
  String get formattedFinalPrice => finalPriceCents == null
      ? 'Preço indisponível'
      : finalPriceCents == 0
          ? 'Grátis'
          : 'R\$ ${(finalPriceCents! / 100).toStringAsFixed(2).replaceAll('.', ',')}';
  String? get formattedOriginalPrice => originalPriceCents == null
      ? null
      : 'R\$ ${(originalPriceCents! / 100).toStringAsFixed(2).replaceAll('.', ',')}';

  factory StoreOfferInfo.fromJson(Map<String, dynamic> json) => StoreOfferInfo(
        store: json['store']?.toString() ?? 'Outra',
        storeUrl: json['storeUrl'] as String?,
        originalPriceCents: (json['originalPriceCents'] as num?)?.toInt(),
        finalPriceCents: (json['finalPriceCents'] as num?)?.toInt(),
        discountPercent: (json['discountPercent'] as num?)?.toInt() ?? 0,
        currency: json['currency']?.toString() ?? 'BRL',
        isAvailable: json['isAvailable'] as bool? ?? true,
      );
}

enum CanonicalPlatformFamily {
  pcSteam,
  playstation,
  xbox,
  nintendo,
}

extension CanonicalPlatformFamilyExt on CanonicalPlatformFamily {
  String get label => switch (this) {
        CanonicalPlatformFamily.pcSteam => 'Steam (PC)',
        CanonicalPlatformFamily.playstation => 'PlayStation',
        CanonicalPlatformFamily.xbox => 'Xbox',
        CanonicalPlatformFamily.nintendo => 'Nintendo Switch',
      };

  String get shortLabel => switch (this) {
        CanonicalPlatformFamily.pcSteam => 'Steam',
        CanonicalPlatformFamily.playstation => 'PS Store',
        CanonicalPlatformFamily.xbox => 'Xbox Store',
        CanonicalPlatformFamily.nintendo => 'Nintendo eShop',
      };

  String get storeKey => switch (this) {
        CanonicalPlatformFamily.pcSteam => 'STEAM',
        CanonicalPlatformFamily.playstation => 'PLAYSTATION',
        CanonicalPlatformFamily.xbox => 'XBOX',
        CanonicalPlatformFamily.nintendo => 'NINTENDO',
      };
}

CanonicalPlatformFamily? matchCanonicalFamily(String input) {
  final s = input.trim().toLowerCase();
  if (s.contains('playstation') || s.contains('ps5') || s.contains('ps4') || s == 'ps') {
    return CanonicalPlatformFamily.playstation;
  }
  if (s.contains('steam') || s.contains('pc') || s.contains('windows')) {
    return CanonicalPlatformFamily.pcSteam;
  }
  if (s.contains('xbox')) {
    return CanonicalPlatformFamily.xbox;
  }
  if (s.contains('nintendo') || s.contains('switch')) {
    return CanonicalPlatformFamily.nintendo;
  }
  return null;
}


class DiscoveryGame {
  const DiscoveryGame(
      {required this.id,
      required this.title,
      this.studio = '',
      this.genre = '',
      this.description = '',
      this.rating,
      this.ratingCount,
      this.tags = const [],
      this.platforms = const [],
      this.stores = const [],
      this.storeOffers = const [],
      this.collection = 'destaques',
      this.offer = false,
      this.free = false,
      this.releaseDate,
      this.mode,
      this.publisher,
      this.matchScore,
      this.slug,
      this.coverUrl,
      this.heroUrl,
      this.steamAppId,
      this.igdbId,
      this.primaryTrailer,
      this.trailerDetails = const [],
      this.isOfficialTrailer = false,
      this.likeCount = 0,
      this.commentCount = 0,
      this.steamStoreUrl,
      this.steamPriceCents,
      this.steamOriginalPriceCents,
      this.steamDiscountPercent,
      this.steamCurrency,
      this.steamAvailable});
  final int? steamAppId, igdbId, ratingCount;
  final int likeCount, commentCount;
  final bool isOfficialTrailer;
  final List<String> stores;
  final List<StoreOfferInfo> storeOffers;
  final TrailerInfo? primaryTrailer;
  final List<TrailerInfo> trailerDetails;
  final String? releaseDate, mode, publisher, slug, coverUrl, heroUrl;
  final String? steamStoreUrl, steamCurrency;
  final int? steamPriceCents, steamOriginalPriceCents, steamDiscountPercent;
  final bool? steamAvailable;
  /// Identificador interno e estável de Game na API NextPlay.
  final String id;
  final String title, studio, genre, description, collection;
  final String? rating;
  final List<String> tags, platforms;
  final bool offer, free;
  /// Percentual de compatibilidade retornado pela API (0–100).
  /// Null quando o dado vem de fontes locais/mock.
  final int? matchScore;

  bool get hasRating => rating != null && rating!.trim().isNotEmpty;
  bool get hasRatingCount => ratingCount != null && ratingCount! > 0;
  bool get hasStudio => studio.trim().isNotEmpty;
  bool get hasGenre => genre.trim().isNotEmpty;
  bool get hasPlatforms => platforms.isNotEmpty;
  bool get hasStores => stores.isNotEmpty || storeOffers.isNotEmpty;
  bool get hasDescription => description.trim().isNotEmpty;
  bool get isFree => free;
  bool get hasSteamPrice => steamPriceCents != null;
  bool get hasSteamDiscount => (steamDiscountPercent ?? 0) > 0;
  bool get hasOriginalPrice =>
      steamOriginalPriceCents != null &&
      steamOriginalPriceCents! > (steamPriceCents ?? 0);
  String? get formattedOriginalPrice => steamOriginalPriceCents == null
      ? null
      : 'R\$ ${(steamOriginalPriceCents! / 100).toStringAsFixed(2).replaceAll('.', ',')}';
  bool get hasStoreUrl => steamStoreUrl != null && steamStoreUrl!.trim().isNotEmpty;
  List<String> get genres => tags;
  bool get isSteamAvailable => steamAvailable ?? false;

  bool supportsCanonicalFamily(CanonicalPlatformFamily family) {
    switch (family) {
      case CanonicalPlatformFamily.pcSteam:
        return isSteamAvailable ||
            hasSteamPrice ||
            storeOffers.any((o) => o.store == 'STEAM') ||
            platforms.any((p) => matchCanonicalFamily(p) == CanonicalPlatformFamily.pcSteam);
      case CanonicalPlatformFamily.playstation:
        return storeOffers.any((o) => o.store == 'PLAYSTATION') ||
            platforms.any((p) => matchCanonicalFamily(p) == CanonicalPlatformFamily.playstation);
      case CanonicalPlatformFamily.xbox:
        return storeOffers.any((o) => o.store == 'XBOX') ||
            platforms.any((p) => matchCanonicalFamily(p) == CanonicalPlatformFamily.xbox);
      case CanonicalPlatformFamily.nintendo:
        return storeOffers.any((o) => o.store == 'NINTENDO') ||
            platforms.any((p) => matchCanonicalFamily(p) == CanonicalPlatformFamily.nintendo);
    }
  }

  StoreOfferInfo? offerForFamily(CanonicalPlatformFamily family) {
    final key = family.storeKey;
    for (final o in storeOffers) {
      if (o.store == key) return o;
    }
    if (family == CanonicalPlatformFamily.pcSteam && (hasSteamPrice || hasStoreUrl)) {
      return StoreOfferInfo(
        store: 'STEAM',
        storeUrl: steamStoreUrl,
        originalPriceCents: steamOriginalPriceCents,
        finalPriceCents: steamPriceCents,
        discountPercent: steamDiscountPercent ?? 0,
        currency: steamCurrency ?? 'BRL',
        isAvailable: isSteamAvailable,
      );
    }
    return null;
  }

  factory DiscoveryGame.fromJson(Map<String, dynamic> json) {
    final steamAppId = json['steamAppId'] as int?;
    final igdbId = json['igdbId'] as int?;
    final rawId = json['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException('Jogo sem ID interno da API.');
    }

    final genres = (json['genres'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        const [];
    final platforms = (json['platforms'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        const [];
    final stores = (json['stores'] as List<dynamic>?)
            ?.map((e) => e is Map ? (e['name']?.toString() ?? '') : e.toString())
            .where((s) => s.isNotEmpty)
            .toList() ??
        const [];
    final rating = json['rating']?.toString();
    final ratingCount = (json['ratingCount'] as num?)?.toInt();
    final likeCount = (json['likeCount'] as num?)?.toInt() ?? 0;
    final commentCount = (json['commentCount'] as num?)?.toInt() ?? 0;
    final primaryTrailer = TrailerInfo.fromJson(json['primaryTrailer']);
    final isOfficialTrailer = primaryTrailer?.isOfficial ??
        (json['isOfficialTrailer'] as bool? ?? false);
    final steam = json['steam'] as Map<String, dynamic>?;
    final steamStoreUrl = steam?['storeUrl'] as String?;
    final steamPriceCents = steam?['priceCents'] as int?;
    final steamDiscountPercent = steam?['discountPercent'] as int?;
    final steamCurrency = steam?['currency'] as String?;
    final steamAvailable = steam?['isAvailable'] as bool?;
    final offer = (steamDiscountPercent ?? 0) > 0;
    final free = json['isFree'] as bool? ?? false;

    final steamOriginalPriceCents =
        (steam?['originalPriceCents'] as num?)?.toInt();
    final rawStoreOffers = json['storeOffers'] as List<dynamic>?;
    final storeOffers = rawStoreOffers
            ?.whereType<Map<String, dynamic>>()
            .map(StoreOfferInfo.fromJson)
            .toList() ??
        const [];

    return DiscoveryGame(
      id: rawId,
      steamAppId: steamAppId,
      igdbId: igdbId,
      title: json['title'] as String? ?? 'Sem título',
      studio: json['studio'] as String? ??
          json['developer'] as String? ??
          '',
      genre: genres.isNotEmpty ? genres.first : '',
      description: json['description'] as String? ?? '',
      rating: rating,
      ratingCount: ratingCount,
      likeCount: likeCount,
      commentCount: commentCount,
      isOfficialTrailer: isOfficialTrailer,
      tags: genres,
      platforms: platforms,
      stores: stores,
      storeOffers: storeOffers,
      collection: offer ? 'ofertas' : 'destaques',
      offer: offer,
      free: free,
      releaseDate: json['releaseDate']?.toString(),
      mode: json['mode'] as String?,
      publisher: json['publisher'] as String?,
      matchScore: json['matchScore'] as int?,
      slug: json['slug'] as String?,
      coverUrl: json['coverUrl'] as String?,
      heroUrl: json['heroUrl'] as String?,
      primaryTrailer: primaryTrailer,
      trailerDetails: _parseTrailerDetails(json['trailerDetails']),
      steamStoreUrl: steamStoreUrl,
      steamPriceCents: steamPriceCents,
      steamOriginalPriceCents: steamOriginalPriceCents,
      steamDiscountPercent: steamDiscountPercent,
      steamCurrency: steamCurrency,
      steamAvailable: steamAvailable,
    );
  }

  static List<TrailerInfo> _parseTrailerDetails(Object? value) {
    if (value is! List) return const [];
    return value
        .map(TrailerInfo.fromJson)
        .whereType<TrailerInfo>()
        .toList(growable: false);
  }
}

abstract interface class ExploreRepository {
  Future<List<DiscoveryGame>> load();
}

/// Editorial demo catalog. No live prices or personalized ranking are claimed.
class DemoExploreRepository implements ExploreRepository {
  const DemoExploreRepository();
  @override
  Future<List<DiscoveryGame>> load() async => const [
        DiscoveryGame(
            id: 'demo:1145360',
            steamAppId: 1145360,
            title: 'Hades',
            studio: 'Supergiant Games',
            genre: 'Roguelike',
            description:
                'Desafie o deus dos mortos e encontre sua saída do submundo. Cada tentativa conta uma nova história.',
            rating: '9.6',
            tags: ['Indies', 'Ação', 'RPG'],
            platforms: ['PC', 'PlayStation', 'Xbox', 'Switch']),
        DiscoveryGame(
            id: 'demo:2679460',
            steamAppId: 2679460,
            title: 'Metaphor: ReFantazio',
            studio: 'ATLUS',
            genre: 'RPG',
            rating: '9.4',
            description:
                'Uma jornada de fantasia em que laços, escolhas e coragem mudam o destino de um reino.',
            platforms: ['PC', 'PlayStation', 'Xbox'],
            collection: 'destaques'),
        DiscoveryGame(
            id: 'demo:1938090',
            steamAppId: 1938090,
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
            id: 'demo:813230',
            steamAppId: 813230,
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
            id: 'demo:2379780',
            steamAppId: 2379780,
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
            id: 'demo:1091500',
            steamAppId: 1091500,
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
            id: 'demo:1245620',
            steamAppId: 1245620,
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
            id: 'demo:553850',
            steamAppId: 553850,
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
            id: 'demo:1426210',
            steamAppId: 1426210,
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
            id: 'demo:739630',
            steamAppId: 739630,
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
            id: 'demo:1966720',
            steamAppId: 1966720,
            title: 'Lethal Company',
            studio: 'Zeekerss',
            genre: 'Terror',
            rating: '9.3',
            description:
                'Vasculhe luas abandonadas com seus amigos e tente voltar para a nave com tudo inteiro.',
            tags: ['Co-op', 'Indies'],
            collection: 'hidden'),
        DiscoveryGame(
            id: 'demo:1458140',
            steamAppId: 1458140,
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

class ApiExploreRepository implements ExploreRepository {
  ApiExploreRepository({
    String? baseUrl,
    http.Client? client,
    this.fallback = const DemoExploreRepository(),
    this.timeout = const Duration(seconds: 15),
    this.initialFeedTimeout = const Duration(seconds: 60),
    this.initialFeedRetryDelay = const Duration(milliseconds: 750),
    this.platformPreferencesProvider,
  }) : baseUrl = baseUrl ?? ApiConfig.baseUrl,
       _client = client ?? http.Client(),
       _ownsClient = client == null;

  final String baseUrl;
  final http.Client _client;
  final bool _ownsClient;
  final ExploreRepository fallback;
  final Duration timeout;
  final Duration initialFeedTimeout;
  final Duration initialFeedRetryDelay;
  final List<String> Function()? platformPreferencesProvider;

  @override
  Future<List<DiscoveryGame>> load() => _load(allowFallback: true);

  /// The real feed must never silently replace the API catalog with demo games.
  Future<List<DiscoveryGame>> loadFeed({
    List<String>? excludeIds,
    List<String>? platforms,
    int limit = 20,
  }) async {
    // FeedController sends null only for the initial load, including manual retry.
    final initialLoad = excludeIds == null;
    final effectivePlatforms =
        platforms ?? platformPreferencesProvider?.call();
    for (var attempt = 0; ; attempt++) {
      try {
        return await _load(
          allowFallback: false,
          excludeIds: excludeIds,
          platforms: effectivePlatforms,
          limit: limit,
          requestTimeout: initialLoad ? initialFeedTimeout : timeout,
        );
      } catch (error) {
        final transient =
            error is TimeoutException ||
            error is http.ClientException ||
            error is SocketException;
        if (!initialLoad || attempt >= 1 || !transient) rethrow;
        await Future<void>.delayed(initialFeedRetryDelay);
      }
    }
  }

  Future<List<DiscoveryGame>> _load({
    required bool allowFallback,
    List<String>? excludeIds,
    List<String>? platforms,
    int limit = 20,
    Duration? requestTimeout,
  }) async {
    try {
      final queryParams = <String, String>{'limit': '$limit'};
      if (excludeIds != null && excludeIds.isNotEmpty) {
        queryParams['exclude'] = excludeIds.join(',');
      }
      if (platforms != null && platforms.isNotEmpty) {
        queryParams['platforms'] = platforms.join(',');
      }
      final uri = Uri.parse(
        '$baseUrl/feed',
      ).replace(queryParameters: queryParams);
      final response = await _client
          .get(uri)
          .timeout(requestTimeout ?? timeout);

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        final List<dynamic>? rawList;
        if (decoded is Map<String, dynamic> && decoded['data'] is List) {
          rawList = decoded['data'] as List<dynamic>;
        } else if (decoded is List) {
          rawList = decoded;
        } else {
          rawList = null;
        }

        if (rawList != null) {
          return rawList
              .whereType<Map<String, dynamic>>()
              .map(DiscoveryGame.fromJson)
              .toList();
        }
      }
      throw StateError('Resposta inválida ao carregar o catálogo.');
    } catch (_) {
      if (!allowFallback) rethrow;
      // Fallback gracioso quando a API estiver offline ou em caso de timeout.
    }

    return fallback.load();
  }

  void dispose() {
    if (_ownsClient) {
      _client.close();
    }
  }
}
