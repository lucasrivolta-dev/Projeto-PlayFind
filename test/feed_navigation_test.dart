import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/features/feed/feed_controller.dart';
import 'package:nextplay/features/feed/feed_pager.dart';
import 'package:nextplay/features/feed/feed_screen.dart';
import 'feed_trailer_test.dart' show FakeTrailerPlayer, game;

Future<void> wheel(WidgetTester tester, double delta) async {
  tester.binding.handlePointerEvent(
    PointerScrollEvent(
      position: tester.getCenter(find.byType(PageView)),
      kind: PointerDeviceKind.mouse,
      scrollDelta: Offset(0, delta),
    ),
  );
  await tester.pump();
}

void main() {
  Future<FeedController> mount(
    WidgetTester tester, {
    FakeTrailerPlayer? player,
  }) async {
    final controller = FeedController(
      () async => [
        game(),
        game(id: 2, videoId: '12345678901'),
        game(id: 3, videoId: 'zyxwvutsrqp'),
      ],
    );
    addTearDown(controller.dispose);
    await controller.load();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedScreen(
            controller: controller,
            playerFactory: (_) => player ?? FakeTrailerPlayer(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return controller;
  }

  testWidgets(
    'ArrowDown and ArrowUp work on initial focus and keep one active trailer',
    (tester) async {
      final player = FakeTrailerPlayer();
      final controller = await mount(tester, player: player);
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.pumpAndSettle();
      expect(controller.current, 1);
      expect(player.playingVideoId, '12345678901');
      expect(player.calls, containsAllInOrder(['pause', 'load:12345678901']));
      expect(find.byKey(const ValueKey('fake-trailer-view')), findsOneWidget);
      await tester.tap(find.byTooltip('Ativar som'));
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
      await tester.pumpAndSettle();
      expect(controller.current, 0);
      expect(player.playingVideoId, 'abcdefghijk');
      await tester.pumpWidget(const SizedBox());
      expect(player.closed, isTrue);
    },
  );

  testWidgets('PageDown and PageUp respect both ends of the feed', (
    tester,
  ) async {
    final controller = await mount(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.pageUp);
    await tester.pumpAndSettle();
    expect(controller.current, 0);
    for (var i = 0; i < 3; i++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.pageDown);
      await tester.pumpAndSettle();
    }
    expect(controller.current, 2);
    await tester.sendKeyEvent(LogicalKeyboardKey.pageUp);
    await tester.pumpAndSettle();
    expect(controller.current, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'wheel advances once per burst and returns after idle, including boundaries',
    (tester) async {
      final controller = await mount(tester);
      await wheel(tester, 120);
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 80));
        await wheel(tester, 120);
      }
      await tester.pumpAndSettle();
      expect(controller.current, 1);
      await tester.pump(FeedPager.wheelIdleDuration);
      await wheel(tester, -120);
      await tester.pumpAndSettle();
      expect(controller.current, 0);
      await tester.pump(FeedPager.wheelIdleDuration);
      await wheel(tester, -120);
      await tester.pumpAndSettle();
      expect(controller.current, 0);
      for (var i = 0; i < 3; i++) {
        await tester.pump(FeedPager.wheelIdleDuration);
        await wheel(tester, 120);
        await tester.pumpAndSettle();
      }
      expect(controller.current, 2);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('keyboard events during a transition do not overlap animations', (
    tester,
  ) async {
    final controller = await mount(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.sendKeyEvent(LogicalKeyboardKey.pageDown);
    await tester.pumpAndSettle();
    expect(controller.current, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('touch swipe and mouse drag retain page navigation', (
    tester,
  ) async {
    final controller = await mount(tester);
    await tester.drag(find.byType(PageView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(controller.current, 1);
    final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
    await mouse.down(
      tester.getCenter(find.byType(PageView)) - const Offset(0, 150),
    );
    await mouse.moveBy(const Offset(0, 450));
    await mouse.up();
    await tester.pumpAndSettle();
    expect(controller.current, 0);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'text field focus does not navigate and inactive feed ignores keys',
    (tester) async {
      final focus = FocusNode();
      addTearDown(focus.dispose);
      var index = 0;
      Widget app(bool active) => MaterialApp(
        home: Scaffold(
          body: FeedPager(
            active: active,
            itemCount: 3,
            onPageChanged: (value) => index = value,
            itemBuilder: (_, i) => Center(
              child: i == 0 ? TextField(focusNode: focus) : Text('Page $i'),
            ),
          ),
        ),
      );
      await tester.pumpWidget(app(true));
      await tester.pumpAndSettle();
      focus.requestFocus();
      await tester.pump();
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.sendKeyEvent(LogicalKeyboardKey.pageDown);
      await tester.pumpAndSettle();
      expect(index, 0);
      await tester.pumpWidget(app(false));
      await tester.sendKeyEvent(LogicalKeyboardKey.pageDown);
      await tester.pumpAndSettle();
      expect(index, 0);
      focus.unfocus();
      await tester.pumpWidget(app(true));
      await tester.pump();
      await tester.sendKeyEvent(LogicalKeyboardKey.pageDown);
      await tester.pumpAndSettle();
      expect(index, 1);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'losing focus to a legitimate control does not cause feed to steal focus back',
    (tester) async {
      final buttonFocus = FocusNode(debugLabel: 'Legitimate button');
      addTearDown(buttonFocus.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                ElevatedButton(
                  focusNode: buttonFocus,
                  onPressed: () {},
                  child: const Text('Button'),
                ),
                Expanded(
                  child: FeedPager(
                    active: true,
                    itemCount: 2,
                    onPageChanged: (_) {},
                    itemBuilder: (_, i) => Text('Page $i'),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      buttonFocus.requestFocus();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(buttonFocus.hasFocus, isTrue);
    },
  );

  testWidgets('tapping inside feed restores feed focus when unfocused', (
    tester,
  ) async {
    final buttonFocus = FocusNode(debugLabel: 'Other button');
    addTearDown(buttonFocus.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              ElevatedButton(
                focusNode: buttonFocus,
                onPressed: () {},
                child: const Text('Other'),
              ),
              Expanded(
                child: FeedPager(
                  active: true,
                  itemCount: 2,
                  onPageChanged: (_) {},
                  itemBuilder: (_, i) => Text('Page $i'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    buttonFocus.requestFocus();
    await tester.pump();
    expect(buttonFocus.hasFocus, isTrue);

    await tester.tap(find.text('Page 0'));
    await tester.pump();
    expect(buttonFocus.hasFocus, isFalse);
  });
}
