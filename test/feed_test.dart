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
            id: 'game-${1000 + i}',
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
            id: 'game-42',
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

  test('FeedController rastreia seenGameIds na sessão e envia excludeIds no loadMore', () async {
    final calls = <List<String>?>[];
    Future<List<DiscoveryGame>> mockFeedLoader({List<String>? excludeIds, int limit = 20}) async {
      calls.add(excludeIds);
      if (excludeIds == null) {
        return List.generate(
          5,
          (i) => DiscoveryGame(
            id: 'batch1-$i',
            title: 'Batch 1 Game $i',
            studio: 'Studio',
            genre: 'Action',
            description: 'Desc',
            rating: '9.0',
          ),
        );
      }
      return List.generate(
        3,
        (i) => DiscoveryGame(
          id: 'batch2-$i',
          title: 'Batch 2 Game $i',
          studio: 'Studio',
          genre: 'RPG',
          description: 'Desc',
          rating: '8.8',
        ),
      );
    }

    final controller = FeedController(
      () => mockFeedLoader(),
      feedLoader: mockFeedLoader,
    );
    addTearDown(controller.dispose);

    await controller.load();
    expect(controller.items.length, 5);
    expect(controller.seenGameIds, containsAll(['batch1-0', 'batch1-1', 'batch1-2', 'batch1-3', 'batch1-4']));
    expect(calls.first, isNull);

    controller.setCurrent(2);
    expect(controller.current, 2);

    await controller.loadMore();
    expect(controller.items.length, 8);
    expect(controller.current, 2, reason: 'loadMore não deve resetar o índice atual');
    expect(calls.last, isNotNull);
    expect(calls.last, containsAll(['batch1-0', 'batch1-1', 'batch1-2', 'batch1-3', 'batch1-4']));
    expect(controller.seenGameIds.length, 8);
  });

  test('loadMore deduplica IDs já vistos e seta hasMore=false quando não há novos jogos', () async {
    int callCount = 0;
    Future<List<DiscoveryGame>> mockFeedLoader({List<String>? excludeIds, int limit = 20}) async {
      callCount++;
      if (callCount == 1) {
        return [
          const DiscoveryGame(
            id: 'g-1',
            title: 'Game 1',
            studio: 'Studio',
            genre: 'Action',
            description: 'Desc',
            rating: '9.0',
          ),
        ];
      }
      // Segundo retorno traz o mesmo ID já visto
      return [
        const DiscoveryGame(
          id: 'g-1',
          title: 'Game 1 (Duplicate)',
          studio: 'Studio',
          genre: 'Action',
          description: 'Desc',
          rating: '9.0',
        ),
      ];
    }

    final controller = FeedController(
      () => mockFeedLoader(),
      feedLoader: mockFeedLoader,
    );
    addTearDown(controller.dispose);

    await controller.load();
    expect(controller.items.length, 1);
    expect(controller.hasMore, isTrue);

    await controller.loadMore();
    // Como era duplicata de g-1, não foi adicionado e hasMore virou false
    expect(controller.items.length, 1);
    expect(controller.hasMore, isFalse);
  });

  test('loadMore falhando em rede preserva itens carregados e não quebra o feed', () async {
    int callCount = 0;
    Future<List<DiscoveryGame>> flakyLoader({List<String>? excludeIds, int limit = 20}) async {
      callCount++;
      if (callCount == 1) {
        return [
          const DiscoveryGame(
            id: 'stable-1',
            title: 'Stable Game',
            studio: 'Studio',
            genre: 'Action',
            description: 'Desc',
            rating: '9.0',
          ),
        ];
      }
      throw Exception('Network timeout');
    }

    final controller = FeedController(
      () => flakyLoader(),
      feedLoader: flakyLoader,
    );
    addTearDown(controller.dispose);

    await controller.load();
    expect(controller.items.length, 1);
    expect(controller.error, isFalse);

    // loadMore lança exceção em rede
    await controller.loadMore();

    // Itens anteriores continuam intactos e loadingMore é restaurado para false
    expect(controller.items.length, 1);
    expect(controller.items.first.game.id, 'stable-1');
    expect(controller.loadingMore, isFalse);
  });

  test('setCurrent próximo ao fim da lista dispara loadMore em background', () async {
    int loadMoreCalled = 0;
    Future<List<DiscoveryGame>> mockLoader({List<String>? excludeIds, int limit = 20}) async {
      if (excludeIds != null) {
        loadMoreCalled++;
        return [
          const DiscoveryGame(
            id: 'extra-game',
            title: 'Extra Game',
            studio: 'Studio',
            genre: 'Action',
            description: 'Desc',
            rating: '9.0',
          ),
        ];
      }
      return List.generate(
        6,
        (i) => DiscoveryGame(
          id: 'initial-$i',
          title: 'Initial $i',
          studio: 'Studio',
          genre: 'Action',
          description: 'Desc',
          rating: '9.0',
        ),
      );
    }

    final controller = FeedController(
      () => mockLoader(),
      feedLoader: mockLoader,
    );
    addTearDown(controller.dispose);

    await controller.load();
    expect(controller.items.length, 6);
    expect(loadMoreCalled, 0);

    // Itens.length = 6. Limiar de prefetch é items.length - 4 = 2.
    // Navegar até o índice 2 deve disparar loadMore
    controller.setCurrent(2);
    // Aguardar microtasks para processar o loadMore
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(loadMoreCalled, 1);
    expect(controller.items.length, 7);
  });
}
