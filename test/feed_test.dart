import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/features/explore/explore_data.dart';
import 'package:nextplay/features/feed/feed_controller.dart';

void main() {
  test('Empty feed accepts page changes', () async {
    final controller = FeedController(() async => []);
    addTearDown(controller.dispose);
    await controller.load();
    controller.setCurrent(2);
    expect(controller.current, 0);
  });

  test('Comment likes toggle their count and remain separate per game',
      () async {
    final controller = FeedController(DemoExploreRepository().load);
    addTearDown(controller.dispose);
    await controller.load();
    final item = controller.items.first;
    final comment = item.comments.first;
    controller.toggleCommentLike(item.game.id, comment);
    expect(
        controller.commentLikeCount(item.game.id, comment), comment.likes + 1);
    expect(controller.isCommentLiked(controller.items.last.game.id, comment),
        isFalse);
    expect(
        controller.isCommentLiked(
            item.game.id, controller.commentsFor(item).first),
        isTrue);
    controller.toggleCommentLike(item.game.id, comment);
    expect(controller.commentLikeCount(item.game.id, comment), comment.likes);
  });

  test('Feed loads editorial items and tracks actions per game', () async {
    final controller = FeedController(DemoExploreRepository().load);
    addTearDown(controller.dispose);
    await controller.load();
    expect(controller.items, isNotEmpty);
    final id = controller.items.first.game.id;
    controller.toggleLike(id);
    controller.toggleSave(id);
    controller.markPlayed(id);
    expect(controller.liked, contains(id));
    expect(controller.saved, isEmpty);
    expect(controller.played, contains(id));
    controller.addComment(id, 'Minha próxima descoberta.');
    expect(controller.commentsFor(controller.items.first).last.text,
        'Minha próxima descoberta.');
  });

  test('Feed choices survive page changes without duplicating items', () async {
    final controller = FeedController(DemoExploreRepository().load);
    addTearDown(controller.dispose);
    await controller.load();
    controller.setCurrent(3);
    expect(controller.current, 3);
    controller.setCurrent(999);
    expect(controller.current, controller.items.length - 1);
  });

  test('Feed exibe todos os jogos retornados pela API sem limitar a 6', () async {
    // Simula repositório com 10 jogos — reproduz o que a API real retorna.
    Future<List<DiscoveryGame>> repoWith10() async => List.generate(
          10,
          (i) => DiscoveryGame(
            id: 1000 + i,
            title: 'Game ${i + 1}',
            studio: 'Studio',
            genre: 'Ação',
            description: 'Desc',
            rating: '9.0',
            matchScore: 95,
          ),
        );

    final controller = FeedController(repoWith10);
    addTearDown(controller.dispose);
    await controller.load();

    expect(controller.items.length, 10);
    expect(controller.loading, isFalse);
    expect(controller.error, isFalse);
  });

  test('matchScore da API é usado como match no FeedItem', () async {
    Future<List<DiscoveryGame>> repoWithMatch() async => [
          const DiscoveryGame(
            id: 42,
            title: 'Jogo com Match',
            studio: 'Studio',
            genre: 'RPG',
            description: 'Desc',
            rating: '9.5',
            matchScore: 88,
          ),
        ];

    final controller = FeedController(repoWithMatch);
    addTearDown(controller.dispose);
    await controller.load();

    expect(controller.items.first.match, 88);
  });

  test('FeedController sinaliza error quando repositório lança exceção', () async {
    Future<List<DiscoveryGame>> failingRepo() async =>
        throw Exception('Conexão recusada');

    final controller = FeedController(failingRepo);
    addTearDown(controller.dispose);
    await controller.load();

    expect(controller.error, isTrue);
    expect(controller.loading, isFalse);
    expect(controller.items, isEmpty);
  });
}
