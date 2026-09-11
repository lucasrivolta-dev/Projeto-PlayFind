import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/design_system/components.dart';
import 'package:nextplay/design_system/theme.dart';
import 'package:nextplay/features/explore/explore_controller.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/explore/explore_screen.dart';
import 'package:nextplay/features/explore/explore_widgets.dart';
import 'package:nextplay/main.dart';

void main() {
  test('Search combines accent-insensitive text, category and platform',
      () async {
    final controller = ExploreController(DemoExploreRepository());
    addTearDown(controller.dispose);
    await controller.load();
    controller.search('phasmophobia');
    controller.selectCategory('Terror');
    expect(controller.results.single.title, 'Phasmophobia');
    controller.selectPlatform('Switch');
    expect(controller.results, isEmpty);
    controller.resetFilters();
    controller.search('acao');
    expect(controller.results.map((game) => game.title), contains('Hades'));
    controller.search('jogo inexistente');
    expect(controller.results, isEmpty);
  });

  test('Choices finish without repeating and saved games toggle once',
      () async {
    final controller = ExploreController(DemoExploreRepository());
    addTearDown(controller.dispose);
    await controller.load();
    final ids = <int>{};
    while (controller.nextGame != null) {
      expect(ids.add(controller.nextGame!.id), isTrue);
      controller.choose(true);
    }
    expect(controller.choices.length, controller.games.length);
    controller.choose(false);
    expect(controller.choices.length, controller.games.length);
    controller.restartChoices();
    expect(controller.nextGame, isNotNull);
    controller.toggleSaved(ids.first);
    expect(controller.saved.length, 1);
    controller.toggleSaved(ids.first);
    expect(controller.saved, isEmpty);
  });

  testWidgets('All footer positions remain fixed while selection turns purple',
      (tester) async {
    final positions = <AppDestination, Offset>{};
    for (final selected in AppDestination.values) {
      await tester.pumpWidget(MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
              bottomNavigationBar: AppBottomNavigation(
                  selected: selected, onSelected: (_) {}))));
      await tester.pumpAndSettle();
      for (final destination in AppDestination.values) {
        final target = find.byKey(ValueKey(destination));
        positions.putIfAbsent(destination, () => tester.getCenter(target));
        expect(tester.getCenter(target), positions[destination]);
      }
      final active = tester.widget<AnimatedContainer>(find.descendant(
          of: find.byKey(ValueKey(selected)),
          matching: find.byType(AnimatedContainer)));
      expect((active.decoration! as BoxDecoration).color, AppColors.primary);
    }
  });

  for (final width in [320.0, 390.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Explore full page at $width with text scale $scale',
          (tester) async {
        final previousErrorHandler = FlutterError.onError;
        FlutterError.onError = (details) {
          debugPrint(details.toString());
          previousErrorHandler?.call(details);
        };
        addTearDown(() => FlutterError.onError = previousErrorHandler);
        tester.view.physicalSize = Size(width, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final controller = ExploreController(DemoExploreRepository());
        addTearDown(controller.dispose);
        await controller.load();
        await tester.pumpWidget(MaterialApp(
            theme: AppTheme.dark,
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!),
            home: Scaffold(body: ExploreScreen(controller: controller))));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        for (var i = 0; i < 18; i++) {
          await tester.drag(find.byType(ListView), const Offset(0, -450));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
      });
    }
  }

  testWidgets(
      'Explore search, saving and Profile navigation share session state',
      (tester) async {
    await tester.pumpWidget(const NextPlayApp());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey(AppDestination.explore)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Hades');
    await tester.pumpAndSettle();
    expect(find.text('1 jogo encontrado'), findsOneWidget);
    await tester.ensureVisible(find.byType(ExploreGameCard));
    await tester.tap(find.byType(ExploreGameCard));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Quero jogar'), 250, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Quero jogar'));
    await tester.pumpAndSettle();
    expect(find.text('Salvo em Quero jogar'), findsOneWidget);
    Navigator.of(tester.element(find.text('Salvo em Quero jogar'))).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey(AppDestination.profile)));
    await tester.pumpAndSettle();
    expect(find.text('Lucas'), findsOneWidget);
    expect(find.text('39'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey(AppDestination.explore)));
    await tester.pumpAndSettle();
    expect(find.text('Hades'), findsWidgets);
    expect(find.text('1 jogo encontrado'), findsOneWidget);
  });
}

