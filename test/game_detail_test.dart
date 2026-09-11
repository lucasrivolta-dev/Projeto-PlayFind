import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/design_system/theme.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/library/library_store.dart';
import 'package:nextplay/features/game_detail/game_detail_screen.dart';

void main() {
  for (final scale in [1.0, 2.0]) {
    testWidgets('Game details layout and shared actions at scale $scale',
        (tester) async {
      tester.view.physicalSize = const Size(320, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final games = await DemoExploreRepository().load();
      final library = LibraryStore();
      addTearDown(library.dispose);
      final game = games.last;
      await tester.pumpWidget(MaterialApp(
          theme: AppTheme.dark,
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home:
              GameDetailScreen(game: game, library: library, catalog: games)));
      await tester.pumpAndSettle();
      expect(find.text('Detalhes do jogo'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Quero jogar'), 250,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('Quero jogar'));
      await tester.pumpAndSettle();
      expect(library.saved, contains(game.id));
      await tester.scrollUntilVisible(find.byTooltip('Favoritar'), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byTooltip('Favoritar'));
      await tester.pumpAndSettle();
      expect(library.favorites, contains(game.id));
      await tester.scrollUntilVisible(find.text('Comunidade & Fórum'), 350,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
