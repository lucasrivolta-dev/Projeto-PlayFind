import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/design_system/theme.dart';
import 'package:nextplay/features/explore/explore_controller.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_controller.dart';
import 'package:nextplay/features/library/library_store.dart';
import 'package:nextplay/features/library/library_screen.dart';

void main() {
  test('Feed and Explore share saves, played games and ratings', () async {
    final store = LibraryStore();
    final explore = ExploreController(DemoExploreRepository(), library: store);
    final feed = FeedController(DemoExploreRepository().load, library: store);
    await explore.load();
    await feed.load();
    final id = feed.items.first.game.id;
    feed.toggleSave(id);
    expect(explore.saved, contains(id));
    explore.toggleSaved(id);
    expect(feed.saved, isEmpty);
    store.rate(id, 4);
    expect(feed.played, contains(id));
    store.togglePlayed(id);
    expect(store.ratings, isEmpty);
    feed.dispose();
    explore.dispose();
    store.dispose();
  });
  for (final scale in [1.0, 2.0]) {
    testWidgets('Library collection and editor fit at text scale $scale',
        (tester) async {
      tester.view.physicalSize = const Size(320, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = ExploreController(DemoExploreRepository());
      await controller.load();
      controller.toggleSaved(controller.games.first.id);
      addTearDown(controller.dispose);
      await tester.pumpWidget(MaterialApp(
          theme: AppTheme.dark,
          home: MediaQuery(
              data: MediaQueryData(
                  size: const Size(320, 844),
                  textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                  body: LibraryScreen(
                      controller: controller, onExplore: () {})))));
      await tester.pumpAndSettle();
      expect(find.text('Minha Biblioteca'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Hades').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hades').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Avaliar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Avaliar'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip('4 estrelas'));
      await tester.tap(find.byTooltip('4 estrelas'));
      await tester.pumpAndSettle();
      expect(controller.library.ratings[controller.games.first.id], 4);
      expect(tester.takeException(), isNull);
    });
  }
}
