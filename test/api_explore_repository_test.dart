import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:nextplay/features/explore/explore_data.dart';

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

      expect(game.id, 1145350);
      expect(game.title, 'Hades II');
      expect(game.studio, 'Supergiant Games');
      expect(game.genre, 'Roguelike');
      expect(game.rating, '9.8');
      expect(game.platforms, ['PC', 'Switch']);
      expect(game.tags, ['Roguelike', 'Ação']);
      expect(game.offer, isTrue);
      expect(game.free, isFalse);
    });

    test('gera ID numérico consistente caso steamAppId e igdbId não existam', () {
      final json = {
        'id': 'some-uuid-string-identifier',
        'title': 'Indie Game',
      };

      final game = DiscoveryGame.fromJson(json);
      expect(game.id, isPositive);
      expect(game.title, 'Indie Game');
      expect(game.genre, 'Geral');
    });
  });

  group('ApiExploreRepository', () {
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
              }
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
      expect(games.first.id, 123456);
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
