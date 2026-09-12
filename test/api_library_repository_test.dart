import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:nextplay/features/library/library_store.dart';
import 'package:nextplay/features/library/library_repository.dart';

void main() {
  group('ApiLibraryRepository', () {
    test('loadInto: popula store com dados da API', () async {
      final mockClient = MockClient((request) async {
        expect(request.headers['x-user-id'], 'test-user');
        final body = jsonEncode({
          'data': [
            {
              'status': 'WANT_TO_PLAY',
              'isFavorite': false,
              'rating': null,
              'game': {'steamAppId': 1145360, 'igdbId': null},
            },
            {
              'status': 'PLAYED',
              'isFavorite': true,
              'rating': 5,
              'game': {'steamAppId': null, 'igdbId': 123},
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

      expect(store.saved, contains(1145360));
      expect(store.played, contains(123));
      expect(store.favorites, contains(123));
      expect(store.ratings[123], equals(5));
    });

    test('loadInto: fallback gracioso em erro HTTP', () async {
      final mockClient = MockClient((_) async => http.Response('', 500));
      final repo = ApiLibraryRepository(
        userId: 'test-user',
        client: mockClient,
      );
      final store = LibraryStore();
      store.saved.add(999); // estado pre-existente
      await repo.loadInto(store);

      // Estado deve permanecer intacto quando a API retorna erro.
      expect(store.saved, contains(999));
    });

    test('loadInto: fallback gracioso em falha de rede', () async {
      final mockClient = MockClient((_) async => throw Exception('offline'));
      final repo = ApiLibraryRepository(
        userId: 'test-user',
        client: mockClient,
      );
      final store = LibraryStore();
      // Não deve lançar exceção.
      await expectLater(repo.loadInto(store), completes);
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
      await repo.setStatus(1145360, 'WANT_TO_PLAY');

      expect(capturedPath, contains('1145360'));
      expect(jsonDecode(capturedBody!)['status'], equals('WANT_TO_PLAY'));
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
      await repo.toggleFavorite(1145360);

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
      await repo.rate(1145360, 4);

      expect(jsonDecode(capturedBody!)['rating'], equals(4));
    });

    test('NoopLibraryRepository: todas as operações completam sem erro', () async {
      const repo = NoopLibraryRepository();
      final store = LibraryStore();
      await expectLater(repo.loadInto(store), completes);
      await expectLater(repo.setStatus(1, 'PLAYED'), completes);
      await expectLater(repo.remove(1), completes);
      await expectLater(repo.toggleFavorite(1), completes);
      await expectLater(repo.rate(1, 5), completes);
      await expectLater(repo.removeRating(1), completes);
    });

    test('LibraryStore.loadFromApi: ignora jogos sem steamAppId nem igdbId', () {
      final store = LibraryStore();
      store.loadFromApi([
        {
          'status': 'PLAYED',
          'isFavorite': false,
          'rating': null,
          'game': {'steamAppId': null, 'igdbId': null},
        }
      ]);
      expect(store.all, isEmpty);
    });
  });
}
