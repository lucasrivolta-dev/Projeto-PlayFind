import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/features/feed/direct_trailer_player.dart';
import 'package:nextplay/features/feed/trailer_info.dart';
import 'package:nextplay/features/feed/trailer_player.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TrailerInfo.fromJson parsing', () {
    test('parses DIRECT provider in uppercase', () {
      final info = TrailerInfo.fromJson({
        'provider': 'DIRECT',
        'url': 'http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4',
      });
      expect(info, isNotNull);
      expect(info!.provider, TrailerProvider.direct);
      expect(info.url, 'http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4');
      expect(info.videoId, isNull);
    });

    test('parses DIRECT provider case-insensitively', () {
      final info = TrailerInfo.fromJson({
        'provider': 'direct',
        'url': 'https://example.com/trailer.mp4',
      });
      expect(info, isNotNull);
      expect(info!.provider, TrailerProvider.direct);
    });

    test('parses DIRECT metadata: mimeType, origin, providerLabel and maps to DirectSource', () {
      final info = TrailerInfo.fromJson({
        'provider': 'DIRECT',
        'url': 'http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4',
        'mimeType': 'video/mp4',
        'origin': 'local/dev-test',
        'providerLabel': 'NextPlay Development',
      });
      expect(info, isNotNull);
      expect(info!.mimeType, 'video/mp4');
      expect(info.origin, 'local/dev-test');
      expect(info.providerLabel, 'NextPlay Development');

      final source = info.toPlaybackSource();
      expect(source, isA<DirectSource>());
      final direct = source as DirectSource;
      expect(direct.url, 'http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4');
      expect(direct.mimeType, 'video/mp4');
      expect(direct.origin, 'local/dev-test');
      expect(direct.providerLabel, 'NextPlay Development');
    });

    test('parses YOUTUBE and STEAM providers', () {
      final yt = TrailerInfo.fromJson({
        'provider': 'YOUTUBE',
        'videoId': 'abcdefghijk',
      });
      expect(yt!.provider, TrailerProvider.youtube);
      expect(yt.videoId, 'abcdefghijk');

      final steam = TrailerInfo.fromJson({
        'provider': 'STEAM',
        'url': 'https://cdn.akamai.steamstatic.com/steam/apps/256976648/movie480_vp9.webm',
      });
      expect(steam!.provider, TrailerProvider.steam);
    });
  });

  group('TrailerInfo.toPlaybackSource resolution', () {
    test('valid YouTube videoId maps to YoutubeSource', () {
      const info = TrailerInfo(
        provider: TrailerProvider.youtube,
        videoId: 'abcdefghijk',
      );
      final source = info.toPlaybackSource();
      expect(source, isA<YoutubeSource>());
      expect((source as YoutubeSource).videoId, 'abcdefghijk');
    });

    test('invalid YouTube videoId returns null', () {
      const infoShort = TrailerInfo(
        provider: TrailerProvider.youtube,
        videoId: 'too_short',
      );
      expect(infoShort.toPlaybackSource(), isNull);

      const infoNull = TrailerInfo(
        provider: TrailerProvider.youtube,
        videoId: null,
      );
      expect(infoNull.toPlaybackSource(), isNull);
    });

    test('DIRECT provider maps to DirectSource with mimeType video/mp4', () {
      const info = TrailerInfo(
        provider: TrailerProvider.direct,
        url: 'http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4',
      );
      final source = info.toPlaybackSource();
      expect(source, isA<DirectSource>());
      final direct = source as DirectSource;
      expect(direct.url, 'http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4');
      expect(direct.mimeType, 'video/mp4');
    });

    test('DIRECT provider with empty or null URL returns null', () {
      const infoEmpty = TrailerInfo(
        provider: TrailerProvider.direct,
        url: '',
      );
      expect(infoEmpty.toPlaybackSource(), isNull);

      const infoNull = TrailerInfo(
        provider: TrailerProvider.direct,
        url: null,
      );
      expect(infoNull.toPlaybackSource(), isNull);
    });

    test('STEAM provider does NOT auto-map to DirectSource', () {
      const info = TrailerInfo(
        provider: TrailerProvider.steam,
        url: 'https://cdn.akamai.steamstatic.com/steam/apps/256976648/movie480.mp4',
      );
      // Explicit architectural constraint: Steam URLs are NOT auto-authorized.
      expect(info.toPlaybackSource(), isNull);
    });

    test('OTHER provider returns null', () {
      const info = TrailerInfo(
        provider: TrailerProvider.other,
        url: 'https://vimeo.com/12345678',
      );
      expect(info.toPlaybackSource(), isNull);
    });
  });

  group('createTrailerPlayer factory', () {
    test('routes YoutubeSource to YoutubeTrailerPlayer', () {
      const source = YoutubeSource('abcdefghijk');
      try {
        final player = createTrailerPlayer(source);
        expect(player, isA<YoutubeTrailerPlayer>());
        player.close();
      } on AssertionError catch (e) {
        // In headless unit test environment without native WebViewPlatform plugin,
        // constructing YoutubeTrailerPlayer invokes YoutubePlayerController which
        // asserts WebViewPlatform.instance != null.
        expect(e.message.toString(), contains('WebViewPlatform.instance'));
      }
    });

    test('returns DirectTrailerPlayer for DirectSource', () {
      const source = DirectSource('http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4');
      final player = createTrailerPlayer(source);
      expect(player, isA<DirectTrailerPlayer>());
      expect(player.requestedVideoId, 'http://127.0.0.1:3333/dev/trailer/dev_trailer.mp4');
      player.close();
    });
  });
}
