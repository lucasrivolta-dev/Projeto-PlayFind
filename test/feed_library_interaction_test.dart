import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nextplay/design_system/theme.dart';
import 'package:nextplay/features/explore/explore_controller.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_controller.dart';
import 'package:nextplay/features/library/library_repository.dart';
import 'package:nextplay/features/library/library_screen.dart';
import 'package:nextplay/features/library/library_store.dart';

void main() {
  DiscoveryGame makeGame(int index, {String? customId, String? customTitle}) {
    final id = customId ?? 'uuid-game-$index';
    final title = customTitle ?? 'Game Title $index';
    return DiscoveryGame(
      id: id,
      title: title,
      studio: 'Studio $index',
      genre: 'Action',
      description: 'Description for $title',
      rating: '8.$index',
      coverUrl: 'https://example.com/$id.jpg',
    );
  }

  group('Feed Interactions & Library Sync (Bug 2 verification)', () {
    testWidgets(
        '1. Primeiro jogo do Feed marcado como "Quero jogar" aparece imediatamente na Biblioteca',
        (tester) async {
      final game1 = makeGame(1, customTitle: 'Primeiro Jogo Feed');
      final feedGames = [game1, makeGame(2)];

      final store = LibraryStore();
      final exploreController = ExploreController(
        DemoExploreRepository(),
        library: store,
      );
      final feedController = FeedController(
        () async => feedGames,
        library: store,
      );

      addTearDown(() {
        feedController.dispose();
        exploreController.dispose();
        store.dispose();
      });

      await feedController.load();
      await exploreController.load();

      // Interage com o 1º jogo do feed passando o DiscoveryGame real
      feedController.toggleSave(game1.id, game1);

      expect(store.saved, contains(game1.id));
      expect(store.gamesById[game1.id], isNotNull);

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: LibraryScreen(
            controller: exploreController,
            onExplore: () {},
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // Aba padrão é "Quero jogar" -> deve encontrar o 1º jogo
      expect(find.text('Primeiro Jogo Feed'), findsWidgets);
    });

    testWidgets(
        '2. Jogo além do 20º do Feed marcado como "Quero jogar" aparece imediatamente na Biblioteca',
        (tester) async {
      // Explore só tem os primeiros 20 jogos (índices 1 a 20)
      final exploreCatalog = [for (int i = 1; i <= 20; i++) makeGame(i)];
      final game25 = makeGame(25, customTitle: 'Super Gem Além do Vigésimo');

      // Feed contém jogos até além do 20º
      final feedGames = [...exploreCatalog, game25];

      final store = LibraryStore();
      final exploreController = ExploreController(
        DemoExploreRepository(),
        library: store,
      );
      final feedController = FeedController(
        () async => feedGames,
        library: store,
      );

      addTearDown(() {
        feedController.dispose();
        exploreController.dispose();
        store.dispose();
      });

      await feedController.load();
      await exploreController.load();

      // Garante que controller.games de Explore NÃO contém game25
      expect(
        exploreController.games.any((g) => g.id == game25.id),
        isFalse,
      );

      // Marca o 25º jogo como "Quero jogar" no Feed
      feedController.toggleSave(game25.id, game25);

      // Confirma que LibraryStore registrou game25 imediatamente
      expect(store.saved, contains(game25.id));
      expect(store.gamesById[game25.id]?.title, 'Super Gem Além do Vigésimo');

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: LibraryScreen(
            controller: exploreController,
            onExplore: () {},
          ),
        ),
      ));
      await tester.pump();

      // A Biblioteca consegue renderizar o card de game25 mesmo ele estando além dos 20 primeiros
      expect(find.text('Super Gem Além do Vigésimo'), findsWidgets);
    });

    testWidgets(
        '3. Jogo além do 20º marcado como "Curtir" aparece imediatamente na aba Curtidos',
        (tester) async {
      final game30 = makeGame(30, customTitle: 'Jogo Curtido 30');
      final store = LibraryStore();
      final exploreController = ExploreController(
        DemoExploreRepository(),
        library: store,
      );
      final feedController = FeedController(
        () async => [game30],
        library: store,
      );

      addTearDown(() {
        feedController.dispose();
        exploreController.dispose();
        store.dispose();
      });

      await feedController.load();
      await exploreController.load();

      // Marca Curtir
      feedController.toggleLike(game30.id, game30);

      expect(store.liked, contains(game30.id));
      expect(store.gamesById[game30.id]?.title, 'Jogo Curtido 30');

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: LibraryScreen(
            controller: exploreController,
            onExplore: () {},
          ),
        ),
      ));
      await tester.pump();

      // Troca para a aba "Curtidos"
      await tester.tap(find.textContaining('Curtidos'));
      await tester.pump();

      expect(find.text('Jogo Curtido 30'), findsWidgets);
    });

    testWidgets(
        '4. Jogo além do 20º marcado como "Já joguei" aparece imediatamente na aba Já joguei',
        (tester) async {
      final game40 = makeGame(40, customTitle: 'Jogo Já Jogado 40');
      final store = LibraryStore();
      final exploreController = ExploreController(
        DemoExploreRepository(),
        library: store,
      );
      final feedController = FeedController(
        () async => [game40],
        library: store,
      );

      addTearDown(() {
        feedController.dispose();
        exploreController.dispose();
        store.dispose();
      });

      await feedController.load();
      await exploreController.load();

      // Marca Já joguei
      feedController.markPlayed(game40.id, game40);

      expect(store.played, contains(game40.id));
      expect(store.gamesById[game40.id]?.title, 'Jogo Já Jogado 40');

      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: LibraryScreen(
            controller: exploreController,
            onExplore: () {},
          ),
        ),
      ));
      await tester.pump();

      // Troca para a aba "Já joguei"
      await tester.tap(find.textContaining('Já joguei'), warnIfMissed: false);
      await tester.pump();

      expect(find.text('Jogo Já Jogado 40'), findsWidgets);
    });

    test(
        '5. Persistência HTTP: ações do Feed enviam o UUID interno exato para /library/:gameId',
        () async {
      final capturedRequests = <http.Request>[];
      final mockHttpClient = MockClient((request) async {
        capturedRequests.add(request);
        if (request.url.path.endsWith('/like')) {
          return http.Response(jsonEncode({'liked': true}), 200);
        }
        return http.Response(jsonEncode({'ok': true}), 200);
      });

      final repo = ApiLibraryRepository(
        baseUrl: 'http://localhost:3000/api/v1',
        client: mockHttpClient,
        userId: 'test-user-firebase-uid',
      );
      final store = LibraryStore(repo: repo);
      final testGame = makeGame(55, customId: 'a1b2c3d4-0000-0000-0000-000000000055');
      final feedController = FeedController(
        () async => [testGame],
        library: store,
      );

      addTearDown(() {
        feedController.dispose();
        store.dispose();
      });

      await feedController.load();

      // 1. Quero jogar -> PUT /library/:gameId com {status: WANT_TO_PLAY}
      feedController.toggleSave(testGame.id, testGame);
      await Future<void>.delayed(Duration.zero);

      // 2. Já joguei -> PUT /library/:gameId com {status: PLAYED}
      feedController.markPlayed(testGame.id, testGame);
      await Future<void>.delayed(Duration.zero);

      // 3. Curtir -> POST /library/:gameId/like
      feedController.toggleLike(testGame.id, testGame);
      await Future<void>.delayed(Duration.zero);

      expect(capturedRequests, hasLength(3));

      // Requisição 1: Salvar Quero jogar
      expect(capturedRequests[0].method, 'PUT');
      expect(
        capturedRequests[0].url.path,
        '/api/v1/library/a1b2c3d4-0000-0000-0000-000000000055',
      );
      expect(
        jsonDecode(capturedRequests[0].body),
        {'status': 'WANT_TO_PLAY'},
      );

      // Requisição 2: Marcar Já joguei
      expect(capturedRequests[1].method, 'PUT');
      expect(
        capturedRequests[1].url.path,
        '/api/v1/library/a1b2c3d4-0000-0000-0000-000000000055',
      );
      expect(
        jsonDecode(capturedRequests[1].body),
        {'status': 'PLAYED'},
      );

      // Requisição 3: Curtir (POST sem body para toggle)
      expect(capturedRequests[2].method, 'POST');
      expect(
        capturedRequests[2].url.path,
        '/api/v1/library/a1b2c3d4-0000-0000-0000-000000000055/like',
      );
    });

    test('6. Reload / Reabertura da Biblioteca preserva dados de gamesById',
        () async {
      final store = LibraryStore();
      addTearDown(store.dispose);

      final game = makeGame(99, customTitle: 'Jogo Persistido');
      store.registerGame(game);

      // Simula reload da API
      store.loadFromApi([
        {
          'game': {
            'id': game.id,
            'title': game.title,
            'studio': game.studio,
            'genres': [game.genre],
            'platforms': ['PC'],
          },
          'status': 'WANT_TO_PLAY',
          'liked': true,
          'isFavorite': false,
          'rating': 5,
        }
      ]);

      expect(store.saved, contains(game.id));
      expect(store.liked, contains(game.id));
      expect(store.ratings[game.id], 5);
      expect(store.gamesById[game.id]?.title, 'Jogo Persistido');
    });

    test('7. Comportamento de visitante / tokenProvider nulo ou sem login',
        () async {
      final capturedRequests = <http.Request>[];
      final mockHttpClient = MockClient((request) async {
        capturedRequests.add(request);
        return http.Response(jsonEncode({'status': 'WANT_TO_PLAY'}), 200);
      });

      // Token provider retornando null (usuário visitante deslogado)
      final repo = ApiLibraryRepository(
        baseUrl: 'http://localhost:3000/api/v1',
        client: mockHttpClient,
        tokenProvider: () async => null,
      );

      final store = LibraryStore(repo: repo);
      final testGame = makeGame(77);
      store.toggleSaved(testGame.id, testGame);
      await Future<void>.delayed(Duration.zero);

      expect(capturedRequests, hasLength(1));
      // Quando tokenProvider retorna null, não deve enviar Authorization nem x-user-id legado
      expect(capturedRequests[0].headers.containsKey('authorization'), isFalse);
      expect(capturedRequests[0].headers.containsKey('x-user-id'), isFalse);
    });
  });
}
