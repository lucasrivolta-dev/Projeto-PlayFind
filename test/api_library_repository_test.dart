import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:nextplay/features/library/library_store.dart';
import 'package:nextplay/features/library/library_repository.dart';
import 'package:nextplay/features/feed/feed_controller.dart';

void main() {
  group('ApiLibraryRepository', () {
    test('loadInto: usa dev-user e mantém biblioteca vazia', () async {
      String? capturedPath;
      final mockClient = MockClient((request) async {
        capturedPath = request.url.path;
        expect(request.headers['x-user-id'], 'dev-user');
        return http.Response(jsonEncode({'data': [], 'total': 0}), 200);
      });

      final repo = ApiLibraryRepository(client: mockClient);
      final store = LibraryStore();
      await repo.loadInto(store);

      expect(capturedPath, '/api/v1/library');
      expect(store.saved, isEmpty);
      expect(store.played, isEmpty);
    });

    test('loadInto: popula store com dados da API', () async {
      final mockClient = MockClient((request) async {
        expect(request.headers['x-user-id'], 'test-user');
        final body = jsonEncode({
          'data': [
            {
              'status': 'WANT_TO_PLAY',
              'isFavorite': false,
              'rating': null,
              'game': {'id': 'game-1145360', 'steamAppId': 1145360, 'igdbId': null},
            },
            {
              'status': 'PLAYED',
              'isFavorite': true,
              'rating': 5,
              'game': {'id': 'game-123', 'steamAppId': null, 'igdbId': 123},
            },
          ],
          'total': 2,
        });
        return http.Response(body, 200);
      });

      final repo = ApiLibraryRepository(
        userId: 'test-user',
        client: mockClient,
      );
      final store = LibraryStore();
      await repo.loadInto(store);

      expect(store.saved, contains('game-1145360'));
      expect(store.played, contains('game-123'));
      expect(store.favorites, contains('game-123'));
      expect(store.ratings['game-123'], equals(5));
    });

    test('like salvo reidrata e os dois primeiros toques seguem o banco', () async {
      var persistedLike = true;
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        expect(request.headers['x-user-id'], 'dev-user');
        if (request.method == 'GET') {
          return http.Response(jsonEncode({
            'data': [],
            'likes': persistedLike ? [{'gameId': 'game-1145360', 'steamAppId': 1145360, 'igdbId': null}] : [],
            'total': 0,
          }), 200);
        }
        persistedLike = !persistedLike;
        return http.Response(jsonEncode({'liked': persistedLike}), 200);
      });
      final repo = ApiLibraryRepository(client: client);
      final store = LibraryStore(repo: repo);
      final feed = FeedController(() async => [], library: store);
      addTearDown(feed.dispose);
      addTearDown(store.dispose);

      await repo.loadInto(store); // Mesmo estado de uma nova sessão após F5.
      expect(feed.liked, contains('game-1145360'));

      feed.toggleLike('game-1145360');
      expect(feed.liked, isNot(contains('game-1145360'))); // Otimista.
      await Future<void>.delayed(Duration.zero);
      expect(persistedLike, isFalse);
      expect(feed.liked, isNot(contains('game-1145360')));

      feed.toggleLike('game-1145360');
      await Future<void>.delayed(Duration.zero);
      expect(persistedLike, isTrue);
      expect(feed.liked, contains('game-1145360'));
      expect(requests.map((request) => request.method), ['GET', 'POST', 'POST']);
    });

    test('falha HTTP ao descurtir restaura a curtida reidratada', () async {
      final client = MockClient((request) async {
        if (request.method == 'GET') {
          return http.Response(jsonEncode({
            'data': [], 'likes': [{'gameId': 'game-123', 'igdbId': 123}], 'total': 0,
          }), 200);
        }
        return http.Response('{}', 500);
      });
      final repo = ApiLibraryRepository(client: client);
      final store = LibraryStore(repo: repo);
      addTearDown(store.dispose);
      await repo.loadInto(store);
      expect(store.liked, contains('game-123'));

      store.toggleLike('game-123');
      expect(store.liked, isNot(contains('game-123')));
      await Future<void>.delayed(Duration.zero);
      expect(store.liked, contains('game-123'));
    });

    test('GET reidrata jogo só com igdbId, favorito e rating', () async {
      final client = MockClient((_) async => http.Response(jsonEncode({
        'data': [{
          'status': 'PLAYED', 'isFavorite': true, 'rating': 4,
          'game': {'id': 'game-123', 'steamAppId': null, 'igdbId': 123},
        }],
        'likes': [{'gameId': 'game-123', 'steamAppId': null, 'igdbId': 123}],
        'total': 1,
      }), 200));
      final store = LibraryStore();
      addTearDown(store.dispose);
      await ApiLibraryRepository(client: client).loadInto(store);
      expect(store.played, {'game-123'});
      expect(store.favorites, {'game-123'});
      expect(store.ratings['game-123'], 4);
      expect(store.liked, {'game-123'});
    });

    test('loadInto: não duplica jogos repetidos na mesma categoria', () async {
      final mockClient = MockClient((_) async {
        return http.Response(jsonEncode({
          'data': [
            {
              'status': 'WANT_TO_PLAY',
              'game': {'id': 'game-1145360', 'steamAppId': 1145360},
            },
            {
              'status': 'WANT_TO_PLAY',
              'game': {'id': 'game-1145360', 'steamAppId': 1145360},
            },
            {
              'status': 'PLAYED',
              'game': {'id': 'game-123', 'igdbId': 123},
            },
            {
              'status': 'PLAYED',
              'game': {'id': 'game-123', 'igdbId': 123},
            },
          ],
          'total': 4,
        }), 200);
      });

      final repo = ApiLibraryRepository(client: mockClient);
      final store = LibraryStore();
      await repo.loadInto(store);

      expect(store.saved, {'game-1145360'});
      expect(store.played, {'game-123'});
    });

    test('loadInto: resposta antiga não apaga ação feita durante o GET', () async {
      final response = Completer<http.Response>();
      final client = MockClient((_) => response.future);
      final repo = ApiLibraryRepository(client: client);
      final store = LibraryStore();
      addTearDown(store.dispose);

      final loading = repo.loadInto(store);
      store.toggleSaved('game-1145360');
      response.complete(http.Response(jsonEncode({'data': [], 'total': 0}), 200));
      await loading;

      expect(store.saved, {'game-1145360'});
    });

    test('curtir durante GET preserva curtida e carrega status do mesmo jogo', () async {
      final response = Completer<http.Response>();
      final client = MockClient((request) async {
        if (request.method == 'GET') return response.future;
        return http.Response(jsonEncode({'liked': true}), 200);
      });
      final repo = ApiLibraryRepository(client: client);
      final store = LibraryStore(repo: repo);
      addTearDown(store.dispose);

      final loading = repo.loadInto(store);
      store.toggleLike('game-1145360');
      response.complete(http.Response(jsonEncode({
        'data': [{
          'status': 'WANT_TO_PLAY',
          'game': {'id': 'game-1145360', 'steamAppId': 1145360, 'igdbId': null},
        }],
        'likes': [],
        'total': 1,
      }), 200));
      await loading;
      expect(store.saved, {'game-1145360'});
      expect(store.liked, {'game-1145360'});
    });

    test('loadInto: preserva estado e propaga erro HTTP', () async {
      final mockClient = MockClient((_) async => http.Response('', 500));
      final repo = ApiLibraryRepository(
        userId: 'test-user',
        client: mockClient,
      );
      final store = LibraryStore();
      store.saved.add('game-999'); // estado pre-existente
      await expectLater(repo.loadInto(store), throwsStateError);

      // Estado deve permanecer intacto quando a API retorna erro.
      expect(store.saved, contains('game-999'));
    });

    test('loadInto: propaga falha de rede', () async {
      final mockClient = MockClient((_) async => throw Exception('offline'));
      final repo = ApiLibraryRepository(
        userId: 'test-user',
        client: mockClient,
      );
      final store = LibraryStore();
      await expectLater(repo.loadInto(store), throwsException);
    });

    test('setStatus: envia PUT com status correto', () async {
      String? capturedBody;
      String? capturedPath;
      final mockClient = MockClient((request) async {
        capturedBody = request.body;
        capturedPath = request.url.path;
        return http.Response('{}', 200);
      });

      final repo = ApiLibraryRepository(
        userId: 'test-user',
        client: mockClient,
      );
      await repo.setStatus('game-1145360', 'WANT_TO_PLAY');

      expect(capturedPath, contains('game-1145360'));
      expect(jsonDecode(capturedBody!)['status'], equals('WANT_TO_PLAY'));
    });

    test('favorite, like e rating usam as rotas da API', () async {
      final requests = <http.Request>[];
      final mockClient = MockClient((request) async {
        requests.add(request);
        return http.Response(request.url.path.endsWith('/like')
            ? jsonEncode({'liked': true})
            : '{}', 200);
      });
      final repo = ApiLibraryRepository(client: mockClient);

      await repo.toggleFavorite('game-1145360', isFavorite: true);
      await repo.toggleLike('game-1145360');
      await repo.rate('game-1145360', 4);
      await repo.removeRating('game-1145360');

      expect(requests[0].method, 'POST');
      expect(requests[0].url.path, '/api/v1/library/game-1145360/favorite');
      expect(jsonDecode(requests[0].body), {'isFavorite': true});
      expect(requests[0].headers['x-user-id'], 'dev-user');
      expect(requests[1].url.path, '/api/v1/library/game-1145360/like');
      expect(requests[2].url.path, '/api/v1/library/game-1145360/rate');
      expect(jsonDecode(requests[2].body), {'rating': 4});
      expect(requests[3].method, 'DELETE');
      expect(requests[3].url.path, '/api/v1/library/game-1145360/rate');
    });

    test('ações da API lançam erro em resposta HTTP', () async {
      final mockClient = MockClient((_) async => http.Response('{}', 500));
      final repo = ApiLibraryRepository(client: mockClient);

      await expectLater(repo.toggleFavorite('game-1'), throwsStateError);
      await expectLater(repo.toggleLike('game-1'), throwsStateError);
      await expectLater(repo.rate('game-1', 4), throwsStateError);
      await expectLater(repo.removeRating('game-1'), throwsStateError);
    });

    test('toggleFavorite: envia POST para /favorite', () async {
      String? capturedPath;
      String? capturedMethod;
      final mockClient = MockClient((request) async {
        capturedPath = request.url.path;
        capturedMethod = request.method;
        return http.Response('{}', 200);
      });

      final repo = ApiLibraryRepository(
        userId: 'test-user',
        client: mockClient,
      );
      await repo.toggleFavorite('game-1145360');

      expect(capturedPath, contains('favorite'));
      expect(capturedMethod, equals('POST'));
    });

    test('rate: envia POST com rating correto', () async {
      String? capturedBody;
      final mockClient = MockClient((request) async {
        capturedBody = request.body;
        return http.Response('{}', 200);
      });

      final repo = ApiLibraryRepository(
        userId: 'test-user',
        client: mockClient,
      );
      await repo.rate('game-1145360', 4);

      expect(jsonDecode(capturedBody!)['rating'], equals(4));
    });

    test('NoopLibraryRepository: todas as operações completam sem erro', () async {
      const repo = NoopLibraryRepository();
      final store = LibraryStore();
      await expectLater(repo.loadInto(store), completes);
      await expectLater(repo.setStatus('game-1', 'PLAYED'), completes);
      await expectLater(repo.remove('game-1'), completes);
      await expectLater(repo.toggleFavorite('game-1'), completes);
      await expectLater(repo.rate('game-1', 5), completes);
      await expectLater(repo.removeRating('game-1'), completes);
    });

    test('requisições autenticadas usam Bearer e só enviam Content-Type com body', () async {
      final requests = <http.Request>[];
      final repo = ApiLibraryRepository(
        client: MockClient((request) async {
          requests.add(request);
          return http.Response(request.url.path.endsWith('/like') ? jsonEncode({'liked': true}) : jsonEncode({'data': [], 'likes': [], 'total': 0}), 200);
        }),
        tokenProvider: () async => 'fake-token',
      );
      await repo.loadInto(LibraryStore());
      await repo.toggleLike('game-1');
      await repo.remove('game-1');
      await repo.removeRating('game-1');
      await repo.setStatus('game-1', 'PLAYED');
      for (final request in requests.take(4)) {
        expect(request.headers['authorization'], 'Bearer fake-token');
        expect(request.headers.containsKey('x-user-id'), isFalse);
        expect(request.headers['content-type'], isNull);
      }
      expect(requests.last.headers['authorization'], 'Bearer fake-token');
      expect(requests.last.headers.containsKey('x-user-id'), isFalse);
      expect(requests.last.headers['content-type'], 'application/json');
    });

    test('LibraryStore.loadFromApi: aceita jogo sem IDs externos com ID interno', () {
      final store = LibraryStore();
      store.loadFromApi([
        {
          'status': 'PLAYED',
          'isFavorite': false,
          'rating': null,
          'game': {'id': 'game-no-external', 'steamAppId': null, 'igdbId': null},
        }
      ]);
      expect(store.all, {'game-no-external'});
    });

    test('IDs externos iguais não misturam jogos distintos após reload', () async {
      const firstId = '11111111-1111-4111-8111-111111111111';
      const secondId = '22222222-2222-4222-8222-222222222222';
      final response = jsonEncode({
        'data': [
          {
            'gameId': firstId,
            'game': {'id': firstId, 'title': 'Steam game', 'steamAppId': 123},
            'status': 'WANT_TO_PLAY',
          },
          {
            'gameId': secondId,
            'game': {'id': secondId, 'title': 'IGDB game', 'igdbId': 123},
            'status': 'PLAYED',
            'liked': true,
          },
        ],
        'likes': [{'gameId': secondId, 'steamAppId': null, 'igdbId': 123}],
        'total': 2,
      });
      final repo = ApiLibraryRepository(
        client: MockClient((_) async => http.Response(response, 200)),
      );
      final store = LibraryStore();
      addTearDown(store.dispose);
      await repo.loadInto(store);
      expect(store.saved, {firstId});
      expect(store.played, {secondId});
      expect(store.liked, {secondId});
      expect(store.gamesById.keys.toSet(), {firstId, secondId});
      store.clearPrivateState();
      await repo.loadInto(store);
      expect(store.saved, {firstId});
      expect(store.played, {secondId});
      expect(store.liked, {secondId});
    });
  });
}
