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
    expect(controller.saved, contains(id));
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
}
