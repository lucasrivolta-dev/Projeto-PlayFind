import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_controller.dart';
import 'package:nextplay/features/feed/feed_screen.dart';
import 'package:nextplay/features/feed/feed_trailer.dart';
import 'package:nextplay/features/feed/trailer_info.dart';
import 'package:nextplay/features/feed/trailer_player.dart';
import 'package:nextplay/design_system/components.dart';

class FakeTrailerPlayer extends TrailerPlayer {
  final calls = <String>[];
  String? loaded;
  String? _playing;
  bool error = false;
  bool closed = false;
  bool muted = true;
  bool startsPlaying = true;
  bool mounted = false;
  Completer<void>? pauseGate;
  Completer<void>? muteGate;
  final loadGates = <String, Completer<void>>{};
  final failedLoads = <String>{};
  @override
  bool get failed => error;
  @override
  String? get playingVideoId => _playing;
  @override
  String? get requestedVideoId => loaded;
  @override
  bool get viewMounted => mounted;
  @override
  String get stateLabel => _playing == null ? 'paused' : 'playing';
  @override
  Widget buildView({required VoidCallback onMounted}) => _FakePlayerView(
    key: ValueKey(this),
    onMounted: () {
      mounted = true;
      onMounted();
    },
  );
  @override
  Future<void> load(String videoId) async {
    calls.add('load:$videoId');
    loaded = videoId;
    await loadGates[videoId]?.future;
    if (failedLoads.contains(videoId)) throw StateError('load failed');
    if (loaded != videoId) return;
    if (startsPlaying) await play();
  }

  @override
  Future<void> play() async {
    calls.add('play:$loaded');
    _playing = loaded;
    notifyListeners();
  }

  @override
  Future<void> pause() async {
    calls.add('pause');
    await pauseGate?.future;
    _playing = null;
    if (!closed) notifyListeners();
  }

  @override
  Future<void> setMuted(bool value) async {
    await muteGate?.future;
    muted = value;
  }

  void fail() {
    error = true;
    notifyListeners();
  }

  @override
  Future<void> close() async {
    closed = true;
    _playing = null;
    calls.add('close');
    dispose();
  }
}

class _FakePlayerView extends StatefulWidget {
  const _FakePlayerView({super.key, required this.onMounted});
  final VoidCallback onMounted;

  @override
  State<_FakePlayerView> createState() => _FakePlayerViewState();
}

class _FakePlayerViewState extends State<_FakePlayerView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onMounted();
    });
  }

  @override
  Widget build(BuildContext context) =>
      const ColoredBox(key: ValueKey('fake-trailer-view'), color: Colors.blue);
}

DiscoveryGame game({
  String? videoId = 'abcdefghijk',
  String provider = 'YOUTUBE',
  int id = 1,
}) => DiscoveryGame.fromJson({
  'id': 'game-$id',
  'title': 'Game $id',
  'primaryTrailer': videoId == null
      ? null
      : {
          'provider': provider,
          'videoId': videoId,
          'url': 'https://www.youtube.com/watch?v=$videoId',
        },
});

void main() {
  testWidgets('pending runtime mute does not block first load or Play', (
    tester,
  ) async {
    final mute = Completer<void>();
    final player = FakeTrailerPlayer()
      ..startsPlaying = false
      ..muteGate = mute;
    await tester.pumpWidget(
      MaterialApp(
        home: FeedTrailer(
          game: game(),
          active: true,
          child: const SizedBox(),
          playerFactory: (_) => player,
        ),
      ),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('fake-trailer-view')), findsOneWidget);
    expect(player.viewMounted, isTrue);
    expect(
      player.calls.where((call) => call == 'load:abcdefghijk'),
      hasLength(1),
    );

    await tester.tap(find.byTooltip('Reproduzir trailer'));
    await tester.pump();
    expect(player.playingVideoId, 'abcdefghijk');

    mute.complete();
    await tester.pumpAndSettle();
    expect(
      player.calls.where((call) => call == 'load:abcdefghijk'),
      hasLength(1),
    );
    expect(player.playingVideoId, 'abcdefghijk');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a stale video command cannot replace the current video', (
    tester,
  ) async {
    final gate = Completer<void>();
    final player = FakeTrailerPlayer()..loadGates['abcdefghijk'] = gate;
    Widget build(DiscoveryGame value) => MaterialApp(
      home: FeedTrailer(
        game: value,
        active: true,
        child: const SizedBox(),
        playerFactory: (_) => player,
      ),
    );
    await tester.pumpWidget(build(game()));
    await tester.pump();
    expect(player.loaded, 'abcdefghijk');
    await tester.pumpWidget(build(game(videoId: '12345678901')));
    await tester.pump();
    expect(player.loaded, '12345678901');
    expect(player.playingVideoId, '12345678901');
    gate.complete();
    await tester.pumpAndSettle();
    expect(player.loaded, '12345678901');
    expect(player.playingVideoId, '12345678901');
    expect(
      player.calls.where((call) => call == 'load:abcdefghijk'),
      hasLength(1),
    );
    expect(
      player.calls.where((call) => call == 'load:12345678901'),
      hasLength(1),
    );
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a failed load does not freeze a fresh retry', (tester) async {
    final failed = FakeTrailerPlayer()..failedLoads.add('abcdefghijk');
    final recovered = FakeTrailerPlayer();
    var attempts = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: FeedTrailer(
          game: game(),
          active: true,
          child: const SizedBox(),
          playerFactory: (_) => attempts++ == 0 ? failed : recovered,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('Reproduzir trailer'), findsOneWidget);
    await tester.tap(find.byTooltip('Reproduzir trailer'));
    await tester.pumpAndSettle();
    expect(attempts, 2);
    expect(recovered.loaded, 'abcdefghijk');
    expect(recovered.playingVideoId, 'abcdefghijk');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('failed initialization can be retried with a fresh player', (
    tester,
  ) async {
    var attempts = 0;
    final player = FakeTrailerPlayer();
    await tester.pumpWidget(
      MaterialApp(
        home: FeedTrailer(
          game: game(),
          active: true,
          child: const SizedBox(),
          playerFactory: (_) {
            if (attempts++ == 0) throw StateError('Initialization failed');
            return player;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('Reproduzir trailer'), findsOneWidget);
    await tester.tap(find.byTooltip('Reproduzir trailer'));
    await tester.pumpAndSettle();
    expect(player.loaded, 'abcdefghijk');
    expect(player.playingVideoId, 'abcdefghijk');
    expect(attempts, 2);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('IGDB-only artwork never synthesizes a Steam URL', (
    tester,
  ) async {
    final item = DiscoveryGame.fromJson({
      'id': 'database-id',
      'igdbId': 196770,
      'steamAppId': null,
      'title': 'IGDB only',
      'heroUrl': 'https://images.example/hero.jpg',
    });
    expect(item.igdbId, 196770);
    expect(item.steamAppId, isNull);
    await tester.pumpWidget(
      MaterialApp(
        home: GameArtwork(
          appId: item.steamAppId,
          heroUrl: item.heroUrl,
          coverUrl: item.coverUrl,
          title: item.title,
        ),
      ),
    );
    final image = tester.widget<Image>(find.byType(Image));
    expect((image.image as NetworkImage).url, item.heroUrl);
    final context = tester.element(find.byType(GameArtwork));
    expect(
      image.errorBuilder!(context, StateError('offline'), null),
      isA<ColoredBox>(),
    );
    await tester.pumpWidget(const SizedBox());
    final steam = DiscoveryGame.fromJson({
      'id': 'steam-game-id',
      'igdbId': 194821,
      'steamAppId': 1809540,
    });
    expect(steam.steamAppId, 1809540);
    expect(steam.igdbId, 194821);
  });

  testWidgets(
    'manual playback loads first, resumes only after load, and pauses',
    (tester) async {
      final player = FakeTrailerPlayer()..startsPlaying = false;
      await tester.pumpWidget(
        MaterialApp(
          home: FeedTrailer(
            game: game(),
            active: true,
            child: const SizedBox(),
            playerFactory: (_) => player,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(player.calls, ['pause', 'load:abcdefghijk']);
      await tester.tap(find.byTooltip('Reproduzir trailer'));
      await tester.pumpAndSettle();
      expect(player.calls.last, 'play:abcdefghijk');
      expect(find.byTooltip('Pausar trailer'), findsOneWidget);
      await tester.tap(find.byTooltip('Pausar trailer'));
      await tester.pumpAndSettle();
      expect(player.playingVideoId, isNull);
      expect(find.byTooltip('Reproduzir trailer'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  test(
    'reload resets the active trailer to the recreated first page',
    () async {
      var games = [game(), game(id: 2)];
      final controller = FeedController(() async => games);
      addTearDown(controller.dispose);
      await controller.load();
      controller.setCurrent(1);
      games = [game()];
      await controller.load();
      expect(controller.current, 0);
      expect(controller.items.single.game.id, 'game-1');
    },
  );

  testWidgets('poster stays visible until playback starts', (tester) async {
    final player = FakeTrailerPlayer()..startsPlaying = false;
    await tester.pumpWidget(
      MaterialApp(
        home: FeedTrailer(
          game: game(),
          active: true,
          child: const SizedBox(),
          playerFactory: (_) => player,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(FeedArtwork), findsNWidgets(2));
    expect(
      tester
          .widget<AnimatedOpacity>(
            find.byKey(const ValueKey('trailer-fallback-overlay')),
          )
          .opacity,
      1,
    );
    await tester.tap(find.byTooltip('Reproduzir trailer'));
    await tester.pumpAndSettle();
    expect(player.playingVideoId, 'abcdefghijk');
    expect(
      tester
          .widget<AnimatedOpacity>(
            find.byKey(const ValueKey('trailer-fallback-overlay')),
          )
          .opacity,
      0,
    );
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'artwork prefers hero, falls back to cover, then local placeholder',
    (tester) async {
      final item = DiscoveryGame.fromJson({
        'id': 'artwork-game-id',
        'title': 'Artwork game',
        'heroUrl': 'https://images.example/hero.jpg',
        'coverUrl': 'https://images.example/cover.jpg',
      });
      await tester.pumpWidget(MaterialApp(home: FeedArtwork(game: item)));
      final hero = tester.widget<Image>(find.byType(Image));
      expect((hero.image as NetworkImage).url, item.heroUrl);
      // Exercise each errorBuilder directly, without any network dependency.
      final context = tester.element(find.byType(FeedArtwork));
      final cover =
          hero.errorBuilder!(context, StateError('hero failed'), null) as Image;
      expect((cover.image as NetworkImage).url, item.coverUrl);
      final placeholder = cover.errorBuilder!(
        context,
        StateError('cover failed'),
        null,
      );
      expect(placeholder, isA<ColoredBox>());
      await tester.pumpWidget(const SizedBox());
    },
  );

  test(
    'typed trailer parsing preserves providers and tolerates missing data',
    () {
      expect(game().primaryTrailer?.isPlayableYoutube, isTrue);
      expect(game().primaryTrailer?.provider, TrailerProvider.youtube);
      expect(
        game().primaryTrailer?.url,
        'https://www.youtube.com/watch?v=abcdefghijk',
      );
      expect(DiscoveryGame.fromJson({'id': 'trailer-game-id'}).primaryTrailer, isNull);
      expect(game(videoId: null).primaryTrailer, isNull);
      for (final id in [
        null,
        '',
        'short',
        'a b c d e f',
        'abcdefghijkl',
        '<bad-id>',
      ]) {
        final trailer = TrailerInfo.fromJson({
          'provider': 'YOUTUBE',
          'videoId': id,
        });
        expect(trailer?.isPlayableYoutube, isFalse);
      }
      expect(
        TrailerInfo.fromJson({'provider': 'Steam'})?.provider,
        TrailerProvider.steam,
      );
      expect(
        TrailerInfo.fromJson({'provider': 'FUTURE'})?.provider,
        TrailerProvider.other,
      );
      expect(TrailerInfo.fromJson('malformed'), isNull);
    },
  );

  test(
    'feed maps trailers in one request, with no detail requests or demo fallback',
    () async {
      final paths = <String>[];
      final client = MockClient((request) async {
        paths.add(request.url.path);
        return http.Response(
          jsonEncode({
            'data': [
              {
                'id': 'uuid',
                'igdbId': 23,
                'title': 'IGDB only',
                'primaryTrailer': {
                  'provider': 'YOUTUBE',
                  'videoId': 'abcdefghijk',
                },
              },
            ],
          }),
          200,
        );
      });
      addTearDown(client.close);
      final repo = ApiExploreRepository(
        client: client,
        baseUrl: 'https://api.example/api/v1',
      );
      final games = await repo.loadFeed();
      expect(paths, ['/api/v1/feed']);
      expect(games.single.id, 'uuid');
      expect(games.single.primaryTrailer?.videoId, 'abcdefghijk');
      final broken = MockClient((_) async => http.Response('error', 500));
      addTearDown(broken.close);
      await expectLater(
        ApiExploreRepository(client: broken).loadFeed(),
        throwsStateError,
      );
      final empty = MockClient((_) async => http.Response('{"data":[]}', 200));
      addTearDown(empty.close);
      expect(await ApiExploreRepository(client: empty).loadFeed(), isEmpty);
    },
  );

  testWidgets(
    'invalid or absent trailers show artwork without creating a player',
    (tester) async {
      for (final id in [null, 'invalid']) {
        await tester.pumpWidget(
          MaterialApp(
            home: FeedTrailer(
              game: game(videoId: id),
              active: true,
              child: const SizedBox(),
              playerFactory: (_) =>
                  throw StateError('Must not create a player'),
            ),
          ),
        );
        expect(find.byType(FeedArtwork), findsOneWidget);
        expect(find.byKey(const ValueKey('fake-trailer-view')), findsNothing);
        expect(tester.takeException(), isNull);
      }
      await tester.pumpWidget(
        MaterialApp(
          home: FeedTrailer(
            game: game(provider: 'STEAM'),
            active: true,
            child: const SizedBox(),
            playerFactory: (_) => throw StateError('Must not create a player'),
          ),
        ),
      );
      expect(find.byKey(const ValueKey('fake-trailer-view')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'valid trailer uses one muted player; page changes pause then reuse it',
    (tester) async {
      final player = FakeTrailerPlayer();
      var creations = 0;
      Widget build(DiscoveryGame item, {bool active = true}) => MaterialApp(
        home: FeedTrailer(
          game: item,
          active: active,
          child: const SizedBox(),
          playerFactory: (_) {
            creations++;
            return player;
          },
        ),
      );
      await tester.pumpWidget(build(game()));
      await tester.pumpAndSettle();
      expect(player.playingVideoId, 'abcdefghijk');
      expect(player.muted, isTrue);
      expect(find.byKey(const ValueKey('fake-trailer-view')), findsOneWidget);
      await tester.tap(find.byTooltip('Ativar som'));
      await tester.pumpAndSettle();
      expect(player.muted, isFalse);
      player.calls.clear();
      await tester.pumpWidget(build(game(id: 2, videoId: '12345678901')));
      await tester.pumpAndSettle();
      expect(player.calls, ['pause', 'load:12345678901', 'play:12345678901']);
      expect(creations, 1);
      await tester.pumpWidget(
        build(game(id: 2, videoId: '12345678901'), active: false),
      );
      await tester.pumpAndSettle();
      expect(player.playingVideoId, isNull);
      await tester.pumpWidget(build(game(videoId: null)));
      await tester.pumpAndSettle();
      expect(player.playingVideoId, isNull);
      await tester.pumpWidget(const SizedBox());
      expect(player.closed, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'initialization and playback failures retain the image fallback',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: FeedTrailer(
            game: game(),
            active: true,
            child: const SizedBox(),
            playerFactory: (_) => throw StateError('Initialization failed'),
          ),
        ),
      );
      expect(find.byType(FeedArtwork), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      final player = FakeTrailerPlayer();
      await tester.pumpWidget(
        MaterialApp(
          home: FeedTrailer(
            game: game(),
            active: true,
            child: const SizedBox(),
            playerFactory: (_) => player,
          ),
        ),
      );
      await tester.pumpAndSettle();
      player.fail();
      await tester.pumpAndSettle();
      expect(find.byType(FeedArtwork), findsNWidgets(2));
      expect(player.playingVideoId, isNull);
      expect(
        tester
            .widget<AnimatedOpacity>(
              find.byKey(const ValueKey('trailer-fallback-overlay')),
            )
            .opacity,
        1,
      );
      await tester.pumpWidget(const SizedBox());
      expect(player.closed, isTrue);
    },
  );

  testWidgets(
    'pending playback cannot restart after hiding or disposing the feed',
    (tester) async {
      final gate = Completer<void>();
      final player = FakeTrailerPlayer()..pauseGate = gate;
      Widget build(bool active) => MaterialApp(
        home: FeedTrailer(
          game: game(),
          active: active,
          child: const SizedBox(),
          playerFactory: (_) => player,
        ),
      );
      await tester.pumpWidget(build(true));
      await tester.pumpWidget(build(false));
      gate.complete();
      await tester.pumpAndSettle();
      expect(
        player.calls.where((call) => call == 'load:abcdefghijk'),
        hasLength(1),
      );
      expect(player.playingVideoId, isNull);
      await tester.pumpWidget(const SizedBox());
      expect(player.closed, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'feed swipe, route coverage and lifecycle control playback without blocking likes',
    (tester) async {
      final player = FakeTrailerPlayer();
      final controller = FeedController(
        () async => [game(), game(id: 2, videoId: '12345678901')],
      );
      addTearDown(controller.dispose);
      await controller.load();
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: navigator,
          home: Scaffold(
            body: FeedScreen(
              controller: controller,
              playerFactory: (_) => player,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(player.playingVideoId, 'abcdefghijk');
      await tester.tap(find.text('Curtir').first);
      await tester.pumpAndSettle();
      expect(controller.liked, contains('game-1'));
      await tester.drag(find.byType(PageView), const Offset(0, -500));
      await tester.pumpAndSettle();
      expect(controller.current, 1);
      expect(player.playingVideoId, '12345678901');
      navigator.currentState!.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Details')),
        ),
      );
      await tester.pumpAndSettle();
      expect(player.playingVideoId, isNull);
      navigator.currentState!.pop();
      await tester.pumpAndSettle();
      expect(player.playingVideoId, '12345678901');
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pumpAndSettle();
      expect(player.playingVideoId, isNull);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(player.playingVideoId, '12345678901');
      await tester.pumpWidget(const SizedBox());
      expect(player.closed, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}
