import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_controller.dart';
import 'package:nextplay/features/library/library_repository.dart';
import 'package:nextplay/features/library/library_store.dart';

void main() {
  test('Feed actions reach ApiLibraryRepository with dev-user and status',
      () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('{}', 200);
    });
    final repository = ApiLibraryRepository(
      baseUrl: 'http://localhost/api/v1',
      client: client,
    );
    final store = LibraryStore(repo: repository);
    final feed = FeedController(
      () async => const [
        DiscoveryGame(
          id: 1145360,
          title: 'Hades',
          studio: 'Supergiant Games',
          genre: 'Roguelike',
          description: 'Desc',
          rating: '9.6',
        ),
      ],
      library: store,
    );
    addTearDown(feed.dispose);

    await feed.load();
    feed.toggleSave(1145360);
    await Future<void>.delayed(Duration.zero);
    feed.markPlayed(1145360);
    await Future<void>.delayed(Duration.zero);

    expect(requests, hasLength(2));
    expect(requests[0].method, 'PUT');
    expect(requests[0].url.path, '/api/v1/library/1145360');
    expect(requests[0].headers['x-user-id'], 'dev-user');
    expect(jsonDecode(requests[0].body), {'status': 'WANT_TO_PLAY'});
    expect(requests[1].method, 'PUT');
    expect(requests[1].url.path, '/api/v1/library/1145360');
    expect(requests[1].headers['x-user-id'], 'dev-user');
    expect(jsonDecode(requests[1].body), {'status': 'PLAYED'});
  });
}
