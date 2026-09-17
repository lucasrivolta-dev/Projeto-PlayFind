import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_trailer.dart';
import 'package:nextplay/features/feed/trailer_player.dart';

class _MockFallbackPlayer extends TrailerPlayer {
  _MockFallbackPlayer({
    required this.targetVideoId,
    this.shouldFail = false,
  });

  final String targetVideoId;
  final bool shouldFail;
  static const String errorMsg = 'simulated_player_error';

  bool _isPlaying = false;
  bool _failed = false;
  bool _viewMounted = false;
  String? _requestedId;
  String? _lastError;

  @override
  String? get playingVideoId => _isPlaying ? _requestedId : null;

  @override
  String? get requestedVideoId => _requestedId;

  @override
  bool get viewMounted => _viewMounted;

  @override
  bool get failed => _failed;

  @override
  String? get lastError => _lastError;

  @override
  String get stateLabel => _failed ? 'failed' : (_isPlaying ? 'playing' : 'paused');

  @override
  Widget buildView({required VoidCallback onMounted}) => _MockView(
        key: ValueKey(this),
        onMounted: () {
          _viewMounted = true;
          onMounted();
        },
      );

  @override
  Future<void> load(String videoId) async {
    _requestedId = videoId;
    if (shouldFail) {
      _failed = true;
      _lastError = errorMsg;
      notifyListeners();
      return;
    }
    _isPlaying = true;
    notifyListeners();
  }

  @override
  Future<void> play() async {
    if (shouldFail) {
      _failed = true;
      _lastError = errorMsg;
      notifyListeners();
      return;
    }
    _isPlaying = true;
    notifyListeners();
  }

  @override
  Future<void> pause() async {
    _isPlaying = false;
    notifyListeners();
  }

  @override
  Future<void> setMuted(bool muted) async {}

  @override
  Future<void> close() async {
    _isPlaying = false;
    notifyListeners();
  }
}

class _MockView extends StatefulWidget {
  const _MockView({super.key, required this.onMounted});
  final VoidCallback onMounted;

  @override
  State<_MockView> createState() => _MockViewState();
}

class _MockViewState extends State<_MockView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onMounted();
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox(
        key: ValueKey('mock_trailer_view'),
      );
}

DiscoveryGame createMultiTrailerGame({
  required String id,
  required String title,
  required List<String> videoIds,
}) {
  return DiscoveryGame.fromJson({
    'id': id,
    'title': title,
    'primaryTrailer': videoIds.isEmpty
        ? null
        : {
            'provider': 'YOUTUBE',
            'videoId': videoIds.first,
            'url': 'https://www.youtube.com/watch?v=${videoIds.first}',
          },
    'trailerDetails': [
      for (int i = 0; i < videoIds.length; i++)
        {
          'provider': 'YOUTUBE',
          'videoId': videoIds[i],
          'url': 'https://www.youtube.com/watch?v=${videoIds[i]}',
          'sortOrder': i,
        }
    ],
  });
}

void main() {
  testWidgets('Cenário 1: Primeiro candidato falha e segundo funciona com sucesso', (
    tester,
  ) async {
    final game = createMultiTrailerGame(
      id: 'game-multi-1',
      title: 'Multi Trailer Game',
      videoIds: ['failVideo11', 'succVideo22'],
    );

    final createdPlayers = <String, _MockFallbackPlayer>{};
    TrailerPlayer factory(String videoId) {
      final shouldFail = videoId == 'failVideo11';
      final p = _MockFallbackPlayer(
        targetVideoId: videoId,
        shouldFail: shouldFail,
      );
      createdPlayers[videoId] = p;
      return p;
    }

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedTrailer(
            game: game,
            active: true,
            playerFactory: factory,
            child: const SizedBox(),
          ),
        ),
      ),
    );

    await tester.pump();
    expect(createdPlayers.containsKey('failVideo11'), isTrue);

    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(createdPlayers.containsKey('succVideo22'), isTrue);
    final secondPlayer = createdPlayers['succVideo22']!;
    expect(secondPlayer.failed, isFalse);
    expect(secondPlayer.playingVideoId, 'succVideo22');

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('Cenário 2: Dois candidatos falham e terceiro funciona com sucesso', (
    tester,
  ) async {
    final game = createMultiTrailerGame(
      id: 'game-multi-2',
      title: 'Three Trailers Game',
      videoIds: ['failVideo01', 'failVideo02', 'succVideo03'],
    );

    final attemptedVideos = <String>[];
    TrailerPlayer factory(String videoId) {
      attemptedVideos.add(videoId);
      final shouldFail = videoId != 'succVideo03';
      return _MockFallbackPlayer(
        targetVideoId: videoId,
        shouldFail: shouldFail,
      );
    }

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedTrailer(
            game: game,
            active: true,
            playerFactory: factory,
            child: const SizedBox(),
          ),
        ),
      ),
    );

    await tester.pump();
    expect(attemptedVideos, contains('failVideo01'));

    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(attemptedVideos, contains('failVideo02'));

    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(attemptedVideos, contains('succVideo03'));

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('Cenário 3: Todos os candidatos falham -> EXHAUSTED e UI estável com badge', (
    tester,
  ) async {
    final game = createMultiTrailerGame(
      id: 'game-exhausted',
      title: 'Broken Game',
      videoIds: ['failVideoA1', 'failVideoB2'],
    );

    final attemptedVideos = <String>[];
    TrailerPlayer factory(String videoId) {
      attemptedVideos.add(videoId);
      return _MockFallbackPlayer(
        targetVideoId: videoId,
        shouldFail: true,
      );
    }

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedTrailer(
            game: game,
            active: true,
            playerFactory: factory,
            child: const SizedBox(),
          ),
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(attemptedVideos, ['failVideoA1', 'failVideoB2']);
    expect(find.text('Trailer indisponível'), findsOneWidget);
    expect(find.byKey(const Key('feed_trailer_tap_target')), findsNothing);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('Cenário 4: Mudança para próximo jogo após exaustão funciona normalmente', (
    tester,
  ) async {
    final gameBroken = createMultiTrailerGame(
      id: 'game-1-broken',
      title: 'Broken Game',
      videoIds: ['failVidAll1'],
    );
    final gameWorking = createMultiTrailerGame(
      id: 'game-2-working',
      title: 'Working Game',
      videoIds: ['worksGood02'],
    );

    TrailerPlayer factory(String videoId) {
      final shouldFail = videoId == 'failVidAll1';
      return _MockFallbackPlayer(
        targetVideoId: videoId,
        shouldFail: shouldFail,
      );
    }

    final pageController = PageController();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedTrailer(
            game: gameBroken,
            active: true,
            pageController: pageController,
            playerFactory: factory,
            child: const SizedBox(),
          ),
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Trailer indisponível'), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedTrailer(
            game: gameWorking,
            active: true,
            pageController: pageController,
            playerFactory: factory,
            child: const SizedBox(),
          ),
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('TRAILER'), findsOneWidget);
    expect(find.text('Trailer indisponível'), findsNothing);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });

  testWidgets('Cenário 5: Voltar para o jogo exaurido não cria loop infinito', (
    tester,
  ) async {
    final gameBroken = createMultiTrailerGame(
      id: 'game-broken-loop',
      title: 'Loop Test Game',
      videoIds: ['onlyOneFai1'],
    );

    int brokenAttempts = 0;
    TrailerPlayer factory(String videoId) {
      if (videoId == 'onlyOneFai1') {
        brokenAttempts++;
        return _MockFallbackPlayer(targetVideoId: videoId, shouldFail: true);
      }
      return _MockFallbackPlayer(targetVideoId: videoId, shouldFail: false);
    }

    final controller = PageController();

    // 1. Initial activation: attempts once, fails, and exhausts cleanly
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedTrailer(
            key: const ValueKey('feed_trailer_broken'),
            game: gameBroken,
            active: true,
            pageController: controller,
            playerFactory: factory,
            child: const SizedBox(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(brokenAttempts, 1);
    expect(find.text('Trailer indisponível'), findsOneWidget);

    // 2. User swipes away: becomes inactive
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedTrailer(
            key: const ValueKey('feed_trailer_broken'),
            game: gameBroken,
            active: false,
            pageController: controller,
            playerFactory: factory,
            child: const SizedBox(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(brokenAttempts, 1);

    // 3. User swipes back: reactivated, tries again cleanly without looping
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedTrailer(
            key: const ValueKey('feed_trailer_broken'),
            game: gameBroken,
            active: true,
            pageController: controller,
            playerFactory: factory,
            child: const SizedBox(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(brokenAttempts, 2);
    expect(find.text('Trailer indisponível'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });
}
