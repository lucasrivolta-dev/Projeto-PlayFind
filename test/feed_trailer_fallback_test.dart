import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_controller.dart';
import 'package:nextplay/features/feed/feed_screen.dart';
import 'package:nextplay/features/feed/feed_trailer.dart';
import 'package:nextplay/features/feed/trailer_info.dart';

import 'feed_trailer_test.dart' show FakeTrailerPlayer, game;

const _primaryYoutube = 'abcdefghijk';
const _fallbackYoutube = '12345678901';
const _directUrl = 'https://media.example/trailer.mp4';

DiscoveryGame _gameWithSources({
  List<Map<String, Object?>> details = const [],
}) => game(trailerDetails: details);

Widget _trailer({
  required DiscoveryGame game,
  required FakeTrailerPlayer Function(String source) factory,
}) => MaterialApp(
  home: FeedTrailer(
    game: game,
    active: true,
    playerFactory: factory,
    child: const SizedBox(),
  ),
);

void main() {
  test(
    'candidate order prefers authorised direct and deduplicates sources',
    () {
      final item = _gameWithSources(
        details: const [
          {
            'provider': 'DIRECT',
            'url': _directUrl,
            'origin': 'publisher-press-kit',
          },
          {'provider': 'YOUTUBE', 'videoId': _primaryYoutube},
          {'provider': 'STEAM', 'url': 'https://steam.example/movie.mp4'},
          {'provider': 'YOUTUBE', 'videoId': _fallbackYoutube},
          {'provider': 'DIRECT', 'url': _directUrl},
        ],
      );

      final candidates = trailerCandidatesFor(item);

      expect(candidates, hasLength(3));
      expect(candidates[0], isA<DirectSource>());
      expect((candidates[0] as DirectSource).url, _directUrl);
      expect((candidates[1] as YoutubeSource).videoId, _primaryYoutube);
      expect((candidates[2] as YoutubeSource).videoId, _fallbackYoutube);
    },
  );

  testWidgets('authorised direct source is loaded before primary YouTube', (
    tester,
  ) async {
    final player = FakeTrailerPlayer();
    final created = <String>[];
    await tester.pumpWidget(
      _trailer(
        game: _gameWithSources(
          details: const [
            {
              'provider': 'DIRECT',
              'url': _directUrl,
              'origin': 'publisher-press-kit',
            },
          ],
        ),
        factory: (source) {
          created.add(source);
          return player;
        },
      ),
    );
    await tester.pumpAndSettle();

    expect(created, [_directUrl]);
    expect(player.loaded, _directUrl);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('load failure advances to YouTube fallback without overlap', (
    tester,
  ) async {
    final first = FakeTrailerPlayer()..failedLoads.add(_primaryYoutube);
    final second = FakeTrailerPlayer();
    final created = <String>[];
    var overlap = false;

    await tester.pumpWidget(
      _trailer(
        game: _gameWithSources(
          details: const [
            {'provider': 'YOUTUBE', 'videoId': _fallbackYoutube},
          ],
        ),
        factory: (source) {
          if (created.isNotEmpty && !first.closed) overlap = true;
          created.add(source);
          return created.length == 1 ? first : second;
        },
      ),
    );
    await tester.pumpAndSettle();

    expect(created, [_primaryYoutube, _fallbackYoutube]);
    expect(first.closed, isTrue);
    expect(overlap, isFalse);
    expect(second.playingVideoId, _fallbackYoutube);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('player error advances once to the next candidate', (
    tester,
  ) async {
    final first = FakeTrailerPlayer();
    final second = FakeTrailerPlayer();
    var creations = 0;
    await tester.pumpWidget(
      _trailer(
        game: _gameWithSources(
          details: const [
            {'provider': 'YOUTUBE', 'videoId': _fallbackYoutube},
          ],
        ),
        factory: (_) => creations++ == 0 ? first : second,
      ),
    );
    await tester.pumpAndSettle();

    first.fail();
    await tester.pumpAndSettle();

    expect(creations, 2);
    expect(first.closed, isTrue);
    expect(second.playingVideoId, _fallbackYoutube);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('YouTube startup timeout advances after one real attempt', (
    tester,
  ) async {
    final stalled = FakeTrailerPlayer()
      ..startsPlaying = false
      ..allowPlay = false;
    final fallback = FakeTrailerPlayer();
    var creations = 0;
    await tester.pumpWidget(
      _trailer(
        game: _gameWithSources(
          details: const [
            {'provider': 'YOUTUBE', 'videoId': _fallbackYoutube},
          ],
        ),
        factory: (_) => creations++ == 0 ? stalled : fallback,
      ),
    );
    await tester.pump();
    expect(creations, 1);
    expect(find.byType(FeedArtwork), findsOneWidget);
    expect(
      tester
          .widget<AnimatedOpacity>(
            find.byKey(const Key('feed_trailer_player_visibility')),
          )
          .opacity,
      0,
    );

    await tester.pump(youtubeTrailerStartupTimeout);
    await tester.pumpAndSettle();

    expect(creations, 2);
    expect(stalled.closed, isTrue);
    expect(fallback.playingVideoId, _fallbackYoutube);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('exhausted candidates remain on artwork and are not retried', (
    tester,
  ) async {
    final first = FakeTrailerPlayer()..failedLoads.add(_primaryYoutube);
    final second = FakeTrailerPlayer()..failedLoads.add(_fallbackYoutube);
    var creations = 0;
    await tester.pumpWidget(
      _trailer(
        game: _gameWithSources(
          details: const [
            {'provider': 'YOUTUBE', 'videoId': _fallbackYoutube},
          ],
        ),
        factory: (_) => creations++ == 0 ? first : second,
      ),
    );
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 8));

    expect(creations, 2);
    expect(first.closed, isTrue);
    expect(second.closed, isTrue);
    expect(find.byType(FeedArtwork), findsOneWidget);
    expect(find.byKey(const Key('feed_trailer_tap_target')), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('disposing cancels a pending YouTube startup timeout', (
    tester,
  ) async {
    final stalled = FakeTrailerPlayer()
      ..startsPlaying = false
      ..allowPlay = false;
    var creations = 0;
    await tester.pumpWidget(
      _trailer(
        game: _gameWithSources(
          details: const [
            {'provider': 'YOUTUBE', 'videoId': _fallbackYoutube},
          ],
        ),
        factory: (_) {
          creations++;
          return stalled;
        },
      ),
    );
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 8));

    expect(creations, 1);
    expect(stalled.closed, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'page-controller layout has one control layer sharing the video transform',
    (tester) async {
      final controller = FeedController(
        () async => [game(), game(id: 2, videoId: _fallbackYoutube)],
      );
      addTearDown(controller.dispose);
      await controller.load();
      final player = FakeTrailerPlayer();
      await tester.pumpWidget(
        MaterialApp(
          home: FeedScreen(
            controller: controller,
            playerFactory: (_) => player,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(FeedTrailerControls), findsOneWidget);
      final videoTransform = tester.widget<Transform>(
        find.byKey(const Key('feed_trailer_video_transform')),
      );
      final controlsTransform = tester.widget<Transform>(
        find.byKey(const Key('feed_trailer_controls_transform')),
      );
      expect(
        videoTransform.transform.storage,
        orderedEquals(controlsTransform.transform.storage),
      );

      await tester.tap(find.byKey(const Key('feed_trailer_tap_target')));
      await tester.pump();
      expect(player.playingVideoId, isNull);
      await tester.tap(find.byKey(const Key('feed_trailer_tap_target')));
      await tester.pump();
      expect(player.playingVideoId, _primaryYoutube);

      final seekbar = find
          .descendant(
            of: find.byType(FeedTrailerControls),
            matching: find.byType(GestureDetector),
          )
          .last;
      await tester.tap(seekbar);
      await tester.drag(seekbar, const Offset(40, 0));
      await tester.pump();
      expect(player.seekCalls, isNotEmpty);

      await tester.drag(
        find.byKey(const Key('feed_trailer_tap_target')),
        const Offset(0, -500),
      );
      await tester.pumpAndSettle();
      expect(controller.current, 1);
      expect(player.playingVideoId, _fallbackYoutube);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
