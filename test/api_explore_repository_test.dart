import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_controller.dart';

class _FakeHttpClient extends http.BaseClient {
  _FakeHttpClient(this._handler);
  final Future<http.Response> Function(http.BaseRequest request) _handler;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final response = await _handler(request);
    return http.StreamedResponse(
      Stream.value(response.bodyBytes),
      response.statusCode,
      headers: response.headers,
    );
  }
}

void main() {
  group('DiscoveryGame.fromJson', () {
    test('mapeia campos completos da API', () {
      final json = {
        'id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'title': 'Hades II',
        'studio': 'Supergiant Games',
        'description': 'Batalhe além do submundo.',
        'rating': 9.8,
        'steamAppId': 1145350,
        'genres': ['Roguelike', 'Ação'],
        'platforms': ['PC', 'Switch'],
        'isFree': false,
        'steam': {
          'storeUrl': 'https://store.steampowered.com/app/1145350/',
          'priceCents': 8999,
          'discountPercent': 15,
        },
      };

      final game = DiscoveryGame.fromJson(json);

      expect(game.id, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(game.title, 'Hades II');
      expect(game.studio, 'Supergiant Games');
      expect(game.genre, 'Roguelike');
      expect(game.rating, '9.8');
      expect(game.platforms, ['PC', 'Switch']);
      expect(game.tags, ['Roguelike', 'Ação']);
      expect(game.offer, isTrue);
      expect(game.free, isFalse);
      expect(game.steamStoreUrl, 'https://store.steampowered.com/app/1145350/');
      expect(game.steamPriceCents, 8999);
      expect(game.steamDiscountPercent, 15);
      expect(game.hasSteamPrice, isTrue);
      expect(game.hasSteamDiscount, isTrue);
      expect(game.hasStoreUrl, isTrue);
    });

    test('preserva ID interno mesmo sem IDs externos', () {
      final json = {'id': 'some-uuid-string-identifier', 'title': 'Indie Game'};

      final game = DiscoveryGame.fromJson(json);
      expect(game.id, 'some-uuid-string-identifier');
      expect(game.title, 'Indie Game');
      expect(game.genre, '');
      expect(game.rating, isNull);
      expect(game.hasRating, isFalse);
    });

    test('ID interno permanece igual com Steam, IGDB ou ambos', () {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      for (final externalIds in [
        {'steamAppId': 1145360, 'igdbId': 113112},
        {'steamAppId': 1145360},
        {'igdbId': 113112},
        <String, int>{},
      ]) {
        final game = DiscoveryGame.fromJson({'id': id, ...externalIds});
        expect(game.id, id);
        expect(game.steamAppId, externalIds['steamAppId']);
        expect(game.igdbId, externalIds['igdbId']);
      }
    });

    test('não inventa identidade quando a API omite ID interno', () {
      expect(
        () => DiscoveryGame.fromJson({'steamAppId': 1145360}),
        throwsFormatException,
      );
    });
  });

  group('ApiExploreRepository', () {
    const remote = 'https://projeto-playfind.onrender.com/api/v1';
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    http.Response feedResponse() => http.Response(
      jsonEncode({
        'data': [
          {'id': uuid, 'title': 'Real API game'},
        ],
      }),
      200,
    );

    test('timeouts permitem cold start e mantêm paginação curta', () {
      final repo = ApiExploreRepository(baseUrl: remote);
      expect(repo.initialFeedTimeout, const Duration(seconds: 60));
      expect(repo.timeout, const Duration(seconds: 15));
      expect(repo.initialFeedRetryDelay, const Duration(milliseconds: 750));
      repo.dispose();
    });

    test('resposta inicial após dois segundos carrega sem retry', () async {
      var calls = 0;
      final repo = ApiExploreRepository(
        baseUrl: remote,
        client: _FakeHttpClient((request) async {
          calls++;
          await Future<void>.delayed(const Duration(milliseconds: 2100));
          return feedResponse();
        }),
      );
      expect((await repo.loadFeed()).single.id, uuid);
      expect(calls, 1);
    });

    test('paginação preserva exclude, limite e UUID sem retry', () async {
      var calls = 0;
      final repo = ApiExploreRepository(
        baseUrl: remote,
        client: _FakeHttpClient((request) async {
          calls++;
          expect(request.url.queryParameters['exclude'], uuid);
          expect(request.url.queryParameters['limit'], '7');
          return feedResponse();
        }),
      );
      expect((await repo.loadFeed(excludeIds: [uuid], limit: 7)).single.id, uuid);
      expect(calls, 1);
    });

    for (final failure in [
      TimeoutException('cold start'),
      http.ClientException('connection reset'),
      const SocketException('connection reset'),
    ]) {
      test('retry inicial recupera $failure e preserva UUID', () async {
        var calls = 0;
        final repo = ApiExploreRepository(
          baseUrl: remote,
          initialFeedRetryDelay: Duration.zero,
          client: _FakeHttpClient((request) async {
            expect(request.url.host, 'projeto-playfind.onrender.com');
            if (++calls == 1) throw failure;
            return feedResponse();
          }),
        );
        final games = await repo.loadFeed();
        expect(calls, 2);
        expect(games.single.id, uuid);
      });
    }

    for (final succeeds in [true, false]) {
      test(
        'loading permanece até retry terminar (sucesso=$succeeds)',
        () async {
          var calls = 0;
          final secondAttempt = Completer<http.Response>();
          final retryStarted = Completer<void>();
          final repo = ApiExploreRepository(
            baseUrl: remote,
            initialFeedRetryDelay: Duration.zero,
            client: _FakeHttpClient((request) async {
              if (++calls == 1) throw TimeoutException('cold start');
              retryStarted.complete();
              return secondAttempt.future;
            }),
          );
          final controller = FeedController(
            repo.loadFeed,
            feedLoader: repo.loadFeed,
          );
          final loading = controller.load();
          await retryStarted.future;
          expect(controller.loading, isTrue);
          expect(controller.error, isFalse);
          if (succeeds) {
            secondAttempt.complete(feedResponse());
          } else {
            secondAttempt.completeError(TimeoutException('still offline'));
          }
          await loading;
          expect(calls, 2);
          expect(controller.loading, isFalse);
          expect(controller.error, !succeeds);
          expect(
            controller.items.map((item) => item.game.id),
            succeeds ? [uuid] : isEmpty,
          );
          controller.dispose();
        },
      );
    }

    test('timeout real limita paginação sem retry nem demo', () async {
      var calls = 0;
      final repo = ApiExploreRepository(
        baseUrl: remote,
        timeout: const Duration(milliseconds: 5),
        client: _FakeHttpClient((request) {
          calls++;
          expect(request.url.queryParameters['exclude'], uuid);
          expect(request.url.queryParameters['limit'], '7');
          return Completer<http.Response>().future;
        }),
      );
      await expectLater(
        repo.loadFeed(excludeIds: [uuid], limit: 7),
        throwsA(isA<TimeoutException>()),
      );
      expect(calls, 1);
    });

    test('timeout real inicial faz somente duas tentativas sem demo', () async {
      var calls = 0;
      final repo = ApiExploreRepository(
        baseUrl: remote,
        initialFeedTimeout: const Duration(milliseconds: 5),
        initialFeedRetryDelay: Duration.zero,
        client: _FakeHttpClient((request) {
          calls++;
          return Completer<http.Response>().future;
        }),
      );
      await expectLater(repo.loadFeed(), throwsA(isA<TimeoutException>()));
      expect(calls, 2);
    });

    for (final response in [
      http.Response('error', 503),
      http.Response('{invalid', 200),
    ]) {
      test(
        'erro HTTP ou payload inválido não faz retry nem fallback: ${response.statusCode}',
        () async {
          var calls = 0;
          final repo = ApiExploreRepository(
            baseUrl: remote,
            client: _FakeHttpClient((request) async {
              calls++;
              return response;
            }),
          );
          await expectLater(
            repo.loadFeed(),
            throwsA(anyOf(isA<StateError>(), isA<FormatException>())),
          );
          expect(calls, 1);
        },
      );
    }

    test('retorna jogos da API quando status é 200 OK', () async {
      final fakeClient = _FakeHttpClient((request) async {
        expect(request.url.path, '/api/v1/feed');
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'test-id-1',
                'title': 'API Game Test',
                'steamAppId': 123456,
                'genres': ['RPG'],
                'platforms': ['PC'],
                'rating': 9.0,
                'slug': 'api-game-test',
                'coverUrl': 'https://example.com/cover.jpg',
                'heroUrl': 'https://example.com/hero.jpg',
                'matchScore': 95,
              },
            ],
            'total': 1,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final repo = ApiExploreRepository(client: fakeClient);
      final games = await repo.load();

      expect(games.length, 1);
      expect(games.first.title, 'API Game Test');
      expect(games.first.id, 'test-id-1');
      // Campos adicionados na integração com a API real.
      expect(games.first.slug, 'api-game-test');
      expect(games.first.coverUrl, 'https://example.com/cover.jpg');
      expect(games.first.heroUrl, 'https://example.com/hero.jpg');
      expect(games.first.matchScore, 95);
      repo.dispose();
    });

    test('aciona fallback gracioso quando a API retorna erro HTTP', () async {
      final fakeClient = _FakeHttpClient((request) async {
        return http.Response('Server Error', 500);
      });

      final repo = ApiExploreRepository(client: fakeClient);
      final games = await repo.load();

      expect(games.isNotEmpty, isTrue);
      expect(games.any((g) => g.title == 'Hades'), isTrue);
      repo.dispose();
    });

    test('aciona fallback gracioso quando ocorre exceção de conexão', () async {
      final fakeClient = _FakeHttpClient((request) async {
        throw const SocketException('Falha de conexão simulada');
      });

      final repo = ApiExploreRepository(client: fakeClient);
      final games = await repo.load();

      expect(games.isNotEmpty, isTrue);
      expect(games.any((g) => g.title == 'Hades'), isTrue);
      repo.dispose();
    });
  });
}
