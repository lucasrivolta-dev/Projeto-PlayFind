import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/features/library/library_repository.dart';
import 'package:nextplay/features/library/library_store.dart';

class _FakeLibraryRepository implements LibraryRepository {
  _FakeLibraryRepository({this.error});

  final Object? error;
  final List<String> statuses = [];
  final List<String> ids = [];
  final List<String> likedIds = [];
  final List<String> favoriteIds = [];
  final List<String> ratedIds = [];
  final Completer<void> request = Completer<void>();

  @override
  Future<void> loadInto(LibraryStore store) async {}

  @override
  Future<void> setStatus(String gameId, String status) async {
    ids.add(gameId);
    statuses.add(status);
    if (error != null) throw error!;
    request.complete();
  }

  @override
  Future<void> remove(String gameId) async {
    if (error != null) throw error!;
  }

  @override
  Future<void> toggleFavorite(String gameId, {bool? isFavorite}) async {
    favoriteIds.add(gameId);
    if (error != null) throw error!;
  }

  @override
  Future<bool?> toggleLike(String gameId) async {
    likedIds.add(gameId);
    if (error != null) throw error!;
    return null;
  }

  @override
  Future<void> rate(String gameId, int rating) async {
    ratedIds.add(gameId);
    if (error != null) throw error!;
  }

  @override
  Future<void> removeRating(String gameId) async {}
}

void main() {
  test('markPlayed sends PLAYED and moves WANT_TO_PLAY to played', () async {
    final repository = _FakeLibraryRepository();
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.saved.add('game-42');

    store.markPlayed('game-42');
    await repository.request.future;

    expect(repository.ids, ['game-42']);
    expect(repository.statuses, ['PLAYED']);
    expect(store.saved, isEmpty);
    expect(store.played, {'game-42'});
  });

  test('markPlayed ignores duplicate calls while request is pending', () async {
    final repository = _FakeLibraryRepository();
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);

    store.markPlayed('game-42');
    store.markPlayed('game-42');
    await repository.request.future;

    expect(repository.ids, ['game-42']);
    expect(store.played, {'game-42'});
  });

  test('markPlayed rolls back PLAYED and restores WANT_TO_PLAY on HTTP error',
      () async {
    final repository = _FakeLibraryRepository(error: StateError('server'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.saved.add('game-42');
    final errors = <String>[];
    final subscription = store.errors.listen(errors.add);
    addTearDown(subscription.cancel);

    store.markPlayed('game-42');
    await Future<void>.delayed(Duration.zero);

    expect(store.played, isEmpty);
    expect(store.saved, {'game-42'});
    expect(errors, ['Não foi possível marcar como jogado. Tente novamente.']);
  });

  test('markPlayed handles network failure without throwing', () async {
    final repository = _FakeLibraryRepository(error: Exception('offline'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);

    expect(() => store.markPlayed('game-7'), returnsNormally);
    await Future<void>.delayed(Duration.zero);
    expect(store.played, isEmpty);
  });

  test('favorite and rating preserve the current library collections',
      () async {
    final repository = _FakeLibraryRepository();
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.saved.add('game-42');

    store.toggleFavorite('game-42');
    store.rate('game-42', 4);
    await Future<void>.delayed(Duration.zero);

    expect(repository.favoriteIds, ['game-42']);
    expect(repository.ratedIds, ['game-42']);
    expect(store.favorites, {'game-42'});
    expect(store.ratings['game-42'], 4);
    expect(store.played, {'game-42'});
    expect(store.saved, isEmpty);
  });

  test('favorite and rating rollback on repository failure', () async {
    final repository = _FakeLibraryRepository(error: StateError('server'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.saved.add('game-42');
    final errors = <String>[];
    final subscription = store.errors.listen(errors.add);
    addTearDown(subscription.cancel);

    store.toggleFavorite('game-42');
    store.rate('game-42', 4);
    await Future<void>.delayed(Duration.zero);

    expect(store.favorites, isEmpty);
    expect(store.ratings, isEmpty);
    expect(store.played, isEmpty);
    expect(store.saved, {'game-42'});
    expect(errors, hasLength(2));
  });

  test('remover jogo jogado restaura nota se a API falhar', () async {
    final repository = _FakeLibraryRepository(error: StateError('server'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.played.add('game-42');
    store.ratings['game-42'] = 5;

    store.togglePlayed('game-42');
    await Future<void>.delayed(Duration.zero);

    expect(store.played, {'game-42'});
    expect(store.ratings['game-42'], 5);
  });

  test('logout limpa apenas o estado privado em memória', () {
    final store = LibraryStore();
    addTearDown(store.dispose);
    store.saved.add('game-1');
    store.played.add('game-2');
    store.favorites.add('game-3');
    store.liked.add('game-4');
    store.ratings['game-5'] = 4;
    store.clearPrivateState();
    expect(store.all, isEmpty);
  });

  test('jogo apenas curtido aparece em Todos e some ao descurtir', () async {
    final store = LibraryStore(repo: _FakeLibraryRepository());
    addTearDown(store.dispose);
    store.loadFromApi([
      {
        'game': {'id': 'game-194821', 'igdbId': 194821},
        'status': null,
        'liked': true,
        'isFavorite': false,
        'rating': null,
      }
    ]);
    expect(store.liked, {'game-194821'});
    expect(store.all, {'game-194821'});
    expect(store.saved, isEmpty);
    store.toggleLike('game-194821');
    await Future<void>.delayed(Duration.zero);
    expect(store.liked, isEmpty);
    expect(store.all, isEmpty);
  });

  test('trocar Já joguei por Quero jogar limpa nota e mantém status único', () async {
    final repository = _FakeLibraryRepository();
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.played.add('game-42');
    store.ratings['game-42'] = 5;
    store.toggleSaved('game-42');
    await repository.request.future;
    expect(repository.statuses, ['WANT_TO_PLAY']);
    expect(store.saved, {'game-42'});
    expect(store.played, isEmpty);
    expect(store.ratings, isEmpty);
  });

  test('falha ao trocar status restaura Já joguei e nota', () async {
    final repository = _FakeLibraryRepository(error: StateError('server'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.played.add('game-42');
    store.ratings['game-42'] = 5;
    store.toggleSaved('game-42');
    await Future<void>.delayed(Duration.zero);
    expect(store.saved, isEmpty);
    expect(store.played, {'game-42'});
    expect(store.ratings['game-42'], 5);
  });
}
