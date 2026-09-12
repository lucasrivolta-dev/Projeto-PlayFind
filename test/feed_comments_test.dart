import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/design_system/theme.dart';
import 'package:nextplay/features/auth/auth_controller.dart';
import 'package:nextplay/features/auth/auth_screen.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_controller.dart';
import 'package:nextplay/features/feed/feed_screen.dart';

void main() {
  testWidgets('Guest reads comments; only interactions request authentication',
      (tester) async {
    final auth = AuthController();
    final feed = FeedController(DemoExploreRepository().load);
    addTearDown(auth.dispose);
    addTearDown(feed.dispose);
    await feed.load();
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: FeedScreen(controller: feed, auth: auth)),
    ));
    await tester.tap(find.text('Comentar'));
    await tester.pumpAndSettle();
    expect(find.byType(AuthScreen), findsNothing);
    expect(find.text('Comentários'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Comentário de teste');

    for (final target in [
      find.byTooltip('Curtir comentário').first,
      find.text('Responder').first,
      find.byTooltip('Enviar comentário'),
    ]) {
      await tester.ensureVisible(target);
      await tester.tap(target);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(AuthScreen), findsOneWidget);
      await tester.ensureVisible(find.text('Continuar como visitante'));
      await tester.tap(find.text('Continuar como visitante'));
      await tester.pumpAndSettle();
      expect(find.byType(AuthScreen), findsNothing);
    }
    expect(feed.commentsFor(feed.items.first).length, 2);
    expect(
        feed.isCommentLiked(
            feed.items.first.game.id, feed.items.first.comments.first),
        isFalse);
    expect(find.text('Comentário de teste'), findsOneWidget);
    await tester.tap(find.byTooltip('Fechar comentários'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
