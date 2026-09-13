import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/design_system/theme.dart';
import 'package:nextplay/features/forum/forum_controller.dart';
import 'package:nextplay/features/forum/forum_screen.dart';

void main() {
  test('Forum filters, validates topics and preserves reply relationships',
      () async {
    final controller = ForumController(DemoForumRepository());
    await controller.load();
    controller.search('hades');
    expect(controller.results.single.game, 'Hades');
    controller.selectCategory('Perguntas');
    expect(controller.results, isEmpty);
    expect(controller.create(title: '', body: '', category: 'Geral'), isNull);
    final topic = controller.create(
        title: 'Uma pergunta',
        body: 'Qual o seu jogo favorito?',
        category: 'Geral')!;
    controller.like(topic);
    controller.like(topic);
    expect(topic.likeCount, 0);
    expect(controller.reply(topic, '   '), isFalse);
    controller.reply(topic, 'Primeira resposta');
    controller.reply(topic, 'Outra resposta', parentId: topic.replies.first.id);
    expect(topic.replies.last.parentId, topic.replies.first.id);
    expect(controller.reply(topic, 'Inválida', parentId: -1), isFalse);
    controller.dispose();
  });
  for (final scale in [1.0, 2.0]) {
    testWidgets('Forum creation and discussion at 320px, scale $scale',
        (tester) async {
      tester.view.physicalSize = const Size(320, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = ForumController(DemoForumRepository());
      await controller.load();
      addTearDown(controller.dispose);
      await tester.pumpWidget(MaterialApp(
          theme: AppTheme.dark,
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home: Scaffold(
              body: ForumScreen(controller: controller, games: const []))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Criar tópico'));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byType(TextFormField).at(0), 'Minha descoberta');
      await tester.enterText(find.byType(TextFormField).at(1),
          'Encontrei um jogo muito interessante.');
      await tester.scrollUntilVisible(find.text('Publicar tópico'), 300,
          scrollable: find
              .descendant(
                  of: find.byType(CreateTopicScreen),
                  matching: find.byType(Scrollable))
              .first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Publicar tópico'));
      await tester.pumpAndSettle();
      expect(find.text('Minha descoberta'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Gostei da recomendação!');
      await tester.tap(find.byTooltip('Enviar resposta'));
      await tester.pumpAndSettle();
      expect(controller.topics.first.replies.single.text,
          'Gostei da recomendação!');
      expect(tester.takeException(), isNull);
    });
  }
}
