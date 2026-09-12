import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/library/library_repository.dart';
import 'package:nextplay/main.dart';

void main() {
  testWidgets('coração real exige login simulado e alterna a curtida no backend',
      (tester) async {
    var liked = false;
    var likePosts = 0;
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/feed')) {
        return http.Response(jsonEncode({
          'data': [{
            'id': '9bd2cb0e-1145-4000-8000-000000000001',
            'steamAppId': 1145360,
            'igdbId': 123,
            'title': 'Hades',
            'studio': 'Supergiant Games',
            'description': 'Teste',
            'rating': 9.6,
            'platforms': ['PC'],
          }],
        }), 200);
      }
      expect(request.headers['x-user-id'], 'dev-user');
      if (request.method == 'GET') {
        return http.Response(jsonEncode({
          'data': [],
          'likes': liked ? [{'steamAppId': 1145360, 'igdbId': 123}] : [],
          'total': 0,
        }), 200);
      }
      expect(request.url.path, '/api/v1/library/1145360/like');
      likePosts++;
      liked = !liked;
      return http.Response(jsonEncode({'liked': liked}), 200);
    });
    await tester.pumpWidget(NextPlayApp(
      exploreRepository: ApiExploreRepository(client: client),
      libraryRepository: ApiLibraryRepository(client: client),
    ));
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.favorite_border), findsOneWidget);
    await tester.tap(find.byIcon(Icons.favorite_border));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(const ValueKey('auth-google')), findsOneWidget);
    expect(likePosts, 0);
    await tester.tap(find.byKey(const ValueKey('auth-google')));
    await tester.pumpAndSettle();
    expect(likePosts, 1);
    expect(liked, isTrue);
    expect(find.byIcon(Icons.favorite), findsOneWidget);

    await tester.tap(find.byIcon(Icons.favorite));
    await tester.pumpAndSettle();
    expect(likePosts, 2);
    expect(liked, isFalse);
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);
  });

  testWidgets('curtida hidratada descurte no primeiro toque e falha faz rollback',
      (tester) async {
    var liked = true;
    var failNext = false;
    var likePosts = 0;
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/feed')) {
        return http.Response(jsonEncode({
          'data': [{
            'steamAppId': 1145360,
            'title': 'Hades',
            'studio': 'Supergiant Games',
            'description': 'Teste',
            'rating': 9.6,
            'platforms': ['PC'],
          }],
        }), 200);
      }
      expect(request.headers['x-user-id'], 'dev-user');
      if (request.method == 'GET') {
        return http.Response(jsonEncode({
          'data': [],
          'likes': liked ? [{'steamAppId': 1145360}] : [],
          'total': 0,
        }), 200);
      }
      expect(request.url.path, '/api/v1/library/1145360/like');
      likePosts++;
      if (failNext) return http.Response('{}', 500);
      liked = !liked;
      return http.Response(jsonEncode({'liked': liked}), 200);
    });
    await tester.pumpWidget(NextPlayApp(
      exploreRepository: ApiExploreRepository(client: client),
      libraryRepository: ApiLibraryRepository(client: client),
    ));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.favorite), findsOneWidget);

    await tester.tap(find.text('Curtir'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(const ValueKey('auth-google')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('auth-google')));
    await tester.pumpAndSettle();
    expect(likePosts, 1);
    expect(liked, isFalse);
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);

    failNext = true;
    await tester.tap(find.text('Curtir'));
    await tester.pumpAndSettle();
    expect(likePosts, 2);
    expect(liked, isFalse);
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);
  });
}
