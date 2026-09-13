import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/features/library/library_repository.dart';
import 'package:nextplay/features/library/library_store.dart';

class _FakeLibraryRepository implements LibraryRepository {
  _FakeLibraryRepository({this.error});

  final Object? error;
  final List<String> statuses = [];
  final List<int> ids = [];
  final List<int> likedIds = [];
  final List<int> favoriteIds = [];
  final List<int> ratedIds = [];
  final Completer<void> request = Completer<void>();

  @override
  Future<void> loadInto(LibraryStore store) async {}

  @override
  Future<void> setStatus(int gameId, String status) async {
    ids.add(gameId);
    statuses.add(status);
    if (error != null) throw error!;
    request.complete();
  }

  @override
  Future<void> remove(int gameId) async {
    if (error != null) throw error!;
  }

  @override
  Future<void> toggleFavorite(int gameId, {bool? isFavorite}) async {
    favoriteIds.add(gameId);
    if (error != null) throw error!;
  }

  @override
  Future<bool?> toggleLike(int gameId) async {
    likedIds.add(gameId);
    if (error != null) throw error!;
    return null;
  }

  @override
  Future<void> rate(int gameId, int rating) async {
    ratedIds.add(gameId);
    if (error != null) throw error!;
  }

  @override
  Future<void> removeRating(int gameId) async {}
}

void main() {
  test('markPlayed sends PLAYED and moves WANT_TO_PLAY to played', () async {
    final repository = _FakeLibraryRepository();
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.saved.add(42);

    store.markPlayed(42);
    await repository.request.future;

    expect(repository.ids, [42]);
    expect(repository.statuses, ['PLAYED']);
    expect(store.saved, isEmpty);
    expect(store.played, {42});
  });

  test('markPlayed ignores duplicate calls while request is pending', () async {
    final repository = _FakeLibraryRepository();
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);

    store.markPlayed(42);
    store.markPlayed(42);
    await repository.request.future;

    expect(repository.ids, [42]);
    expect(store.played, {42});
  });

  test('markPlayed rolls back PLAYED and restores WANT_TO_PLAY on HTTP error',
      () async {
    final repository = _FakeLibraryRepository(error: StateError('server'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.saved.add(42);
    final errors = <String>[];
    final subscription = store.errors.listen(errors.add);
    addTearDown(subscription.cancel);

    store.markPlayed(42);
    await Future<void>.delayed(Duration.zero);

    expect(store.played, isEmpty);
    expect(store.saved, {42});
    expect(errors, ['Não foi possível marcar como jogado. Tente novamente.']);
  });

  test('markPlayed handles network failure without throwing', () async {
    final repository = _FakeLibraryRepository(error: Exception('offline'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);

    expect(() => store.markPlayed(7), returnsNormally);
    await Future<void>.delayed(Duration.zero);
    expect(store.played, isEmpty);
  });

  test('favorite and rating preserve the current library collections',
      () async {
    final repository = _FakeLibraryRepository();
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.saved.add(42);

    store.toggleFavorite(42);
    store.rate(42, 4);
    await Future<void>.delayed(Duration.zero);

    expect(repository.favoriteIds, [42]);
    expect(repository.ratedIds, [42]);
    expect(store.favorites, {42});
    expect(store.ratings[42], 4);
    expect(store.played, {42});
    expect(store.saved, isEmpty);
  });

  test('favorite and rating rollback on repository failure', () async {
    final repository = _FakeLibraryRepository(error: StateError('server'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.saved.add(42);
    final errors = <String>[];
    final subscription = store.errors.listen(errors.add);
    addTearDown(subscription.cancel);

    store.toggleFavorite(42);
    store.rate(42, 4);
    await Future<void>.delayed(Duration.zero);

    expect(store.favorites, isEmpty);
    expect(store.ratings, isEmpty);
    expect(store.played, isEmpty);
    expect(store.saved, {42});
    expect(errors, hasLength(2));
  });

  test('remover jogo jogado restaura nota se a API falhar', () async {
    final repository = _FakeLibraryRepository(error: StateError('server'));
    final store = LibraryStore(repo: repository);
    addTearDown(store.dispose);
    store.played.add(42);
    store.ratings[42] = 5;

    store.togglePlayed(42);
    await Future<void>.delayed(Duration.zero);

    expect(store.played, {42});
    expect(store.ratings[42], 5);
  });

  test('logout limpa apenas o estado privado em memória', () {
    final store = LibraryStore();
    addTearDown(store.dispose);
    store.saved.add(1);
    store.played.add(2);
    store.favorites.add(3);
    store.liked.add(4);
    store.ratings[5] = 4;
    store.clearPrivateState();
    expect(store.all, isEmpty);
  });
}
