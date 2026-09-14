import 'dart:async';
import 'package:flutter/foundation.dart';
import 'library_repository.dart';
import '../explore/explore_data.dart';

/// Estado compartilhado da biblioteca do usuário.
///
/// Cada mutação atualiza o estado em memória imediatamente (UI responsiva)
/// e dispara a persistência no backend em segundo plano via [_repo].
/// Se [repo] for omitido, usa [NoopLibraryRepository] (somente memória).
///
/// Erros de persistência são emitidos em [errors] como mensagens legíveis.
/// A UI pode escutar esse stream para exibir feedback discreto (SnackBar).
class LibraryStore extends ChangeNotifier {
  LibraryStore({LibraryRepository? repo})
      : _repo = repo ?? const NoopLibraryRepository();

  final LibraryRepository _repo;
  int _revision = 0;
  final Map<String, int> _changedAt = {};
  final Map<String, int> _likesChangedAt = {};

  int get revision => _revision;
  Set<String> idsChangedSince(int revision) => _changedAt.entries
      .where((entry) => entry.value > revision)
      .map((entry) => entry.key)
      .toSet();
  Set<String> likedIdsChangedSince(int revision) => _likesChangedAt.entries
      .where((entry) => entry.value > revision)
      .map((entry) => entry.key)
      .toSet();

  void _touch(String id) => _changedAt[id] = ++_revision;
  void _touchLike(String id) => _likesChangedAt[id] = ++_revision;

  void reportLoadFailure() => _emitError(
      'Não foi possível carregar a biblioteca. Verifique a conexão.');

  final Set<String> saved = {};
  final Set<String> played = {};
  final Set<String> favorites = {};
  final Set<String> liked = {};
  final Map<String, int> ratings = {};
  final Map<String, DiscoveryGame> gamesById = {};
  final Set<String> _pendingLikes = {};
  final Set<String> _pendingFavorites = {};
  final Set<String> _pendingRatings = {};
  final Set<String> _pendingSaved = {};
  final Map<String, bool> _queuedSavedActions = {};
  final Set<String> _pendingPlayed = {};

  // Stream de erros para feedback discreto na UI.
  final _errorController = StreamController<String>.broadcast();
  Stream<String> get errors => _errorController.stream;

  void _emitError(String message) {
    if (!_errorController.isClosed) _errorController.add(message);
  }

  void toggleSaved(String id) {
    _touch(id);
    final added = saved.add(id);
    if (!added) saved.remove(id);
    final wasPlayed = added ? played.remove(id) : false;
    final previousRating = added ? ratings.remove(id) : null;
    notifyListeners();

    if (!_pendingSaved.add(id)) {
      _queuedSavedActions[id] = added;
      return;
    }
    unawaited(_persistSaved(id, added, wasPlayed, previousRating));
  }

  Future<void> _persistSaved(String id, bool added, bool wasPlayed, int? previousRating) async {
    try {
      if (added) {
        await _repo.setStatus(id, 'WANT_TO_PLAY');
      } else {
        await _repo.remove(id);
      }
    } catch (_) {
      if (added) {
        saved.remove(id);
        if (wasPlayed) played.add(id);
        if (previousRating != null) ratings[id] = previousRating;
      } else {
        saved.add(id);
      }
      notifyListeners();
      _emitError(added
          ? 'Não foi possível salvar o jogo. Tente novamente.'
          : 'Não foi possível remover o jogo. Tente novamente.');
    } finally {
      _pendingSaved.remove(id);
      final queued = _queuedSavedActions.remove(id);
      if (queued != null) {
        _pendingSaved.add(id);
        unawaited(_persistSaved(id, queued, false, null));
      }
    }
  }

  void markPlayed(String id) {
    if (played.contains(id) || !_pendingPlayed.add(id)) return;
    _touch(id);
    final wasSaved = saved.remove(id);
    played.add(id);
    notifyListeners();
    unawaited(_persistPlayed(id, wasSaved));
  }

  Future<void> _persistPlayed(String id, bool wasSaved) async {
    try {
      await _repo.setStatus(id, 'PLAYED');
    } catch (_) {
      played.remove(id);
      if (wasSaved) saved.add(id);
      notifyListeners();
      _emitError('Não foi possível marcar como jogado. Tente novamente.');
    } finally {
      _pendingPlayed.remove(id);
    }
  }

  void togglePlayed(String id) {
    if (!played.contains(id)) {
      markPlayed(id);
      return;
    }
    _touch(id);
    played.remove(id);
    final previousRating = ratings.remove(id);
    notifyListeners();
    _repo.remove(id).catchError((_) {
      played.add(id);
      if (previousRating != null) ratings[id] = previousRating;
      notifyListeners();
      _emitError('Não foi possível remover o jogo. Tente novamente.');
    });
  }

  void removeRating(String id) {
    if (!_pendingRatings.add(id)) return;
    _touch(id);
    final previous = ratings.remove(id);
    notifyListeners();
    unawaited(_persistRatingRemoval(id, previous));
  }

  Future<void> _persistRatingRemoval(String id, int? previous) async {
    try {
      await _repo.removeRating(id);
    } catch (_) {
      if (previous != null) ratings[id] = previous;
      notifyListeners();
      _emitError('Não foi possível remover a avaliação. Tente novamente.');
    } finally {
      _pendingRatings.remove(id);
    }
  }

  void toggleFavorite(String id) {
    if (!_pendingFavorites.add(id)) return;
    _touch(id);
    if (!favorites.add(id)) favorites.remove(id);
    final value = favorites.contains(id);
    notifyListeners();
    unawaited(_persistFavorite(id, value));
  }

  Future<void> _persistFavorite(String id, bool value) async {
    try {
      await _repo.toggleFavorite(id, isFavorite: value);
    } catch (_) {
      if (value) {
        favorites.remove(id);
      } else {
        favorites.add(id);
      }
      notifyListeners();
      _emitError('Não foi possível atualizar favorito. Tente novamente.');
    } finally {
      _pendingFavorites.remove(id);
    }
  }

  void rate(String id, int rating) {
    if (rating < 1 || rating > 5) return;
    if (!_pendingRatings.add(id)) return;
    _touch(id);
    final previous = ratings[id];
    final wasPlayed = played.contains(id);
    final wasSaved = saved.contains(id);
    ratings[id] = rating;
    played.add(id);
    saved.remove(id);
    notifyListeners();
    unawaited(_persistRating(id, rating, previous, wasPlayed, wasSaved));
  }

  Future<void> _persistRating(String id, int rating, int? previous,
      bool wasPlayed, bool wasSaved) async {
    try {
      await _repo.rate(id, rating);
    } catch (_) {
      if (previous == null) {
        ratings.remove(id);
      } else {
        ratings[id] = previous;
      }
      if (!wasPlayed) played.remove(id);
      if (wasSaved) saved.add(id);
      notifyListeners();
      _emitError('Não foi possível salvar a avaliação. Tente novamente.');
    } finally {
      _pendingRatings.remove(id);
    }
  }

  void toggleLike(String id) {
    if (!_pendingLikes.add(id)) return;
    _touchLike(id);
    final optimistic = liked.add(id);
    if (!optimistic) liked.remove(id);
    notifyListeners();
    unawaited(_persistLike(id, optimistic));
  }

  Future<void> _persistLike(String id, bool optimistic) async {
    try {
      final persisted = await _repo.toggleLike(id);
      if (persisted != null && persisted != optimistic) {
        if (persisted) {
          liked.add(id);
        } else {
          liked.remove(id);
        }
        notifyListeners();
      }
    } catch (_) {
      if (optimistic) {
        liked.remove(id);
      } else {
        liked.add(id);
      }
      notifyListeners();
      _emitError('Não foi possível atualizar a curtida. Tente novamente.');
    } finally {
      _pendingLikes.remove(id);
    }
  }

  Set<String> get all => {...saved, ...played, ...liked, ...ratings.keys};

  /// Removes only the in-memory private state when the authenticated user changes.
  /// Persisted data remains untouched in the backend.
  void clearPrivateState() {
    saved.clear();
    played.clear();
    favorites.clear();
    liked.clear();
    ratings.clear();
    gamesById.clear();
    _pendingLikes.clear();
    _pendingFavorites.clear();
    _pendingRatings.clear();
    _pendingSaved.clear();
    _queuedSavedActions.clear();
    _pendingPlayed.clear();
    notifyListeners();
  }

  /// Inicializa o estado a partir de uma lista de itens JSON retornada
  /// por `GET /api/v1/library`. Substitui qualquer estado anterior.
  void loadFromApi(List<Map<String, dynamic>> items,
      {List<Map<String, dynamic>> likedGames = const [],
      Set<String> preserveIds = const {},
      Set<String> preserveLikedIds = const {}}) {
    final preservedSaved = saved.intersection(preserveIds);
    final preservedPlayed = played.intersection(preserveIds);
    final preservedFavorites = favorites.intersection(preserveIds);
    final preservedLiked = liked.intersection(preserveLikedIds);
    final preservedRatings = Map<String, int>.fromEntries(
        ratings.entries.where((entry) => preserveIds.contains(entry.key)));
    saved.clear();
    played.clear();
    favorites.clear();
    liked.clear();
    ratings.clear();

    for (final item in items) {
      final game = item['game'] as Map<String, dynamic>?;
      final id = _internalGameId(game) ?? _internalGameId(item);
      if (id == null) continue;
      if (game != null) gamesById[id] = DiscoveryGame.fromJson({...game, 'id': id});

      if (!preserveIds.contains(id)) {
        final status = item['status'] as String?;
        if (status == 'WANT_TO_PLAY') saved.add(id);
        if (status == 'PLAYED') played.add(id);
        if (item['isFavorite'] == true) favorites.add(id);
        final rating = item['rating'] as int?;
        if (rating != null) ratings[id] = rating;
      }
      if (item['liked'] == true && !preserveLikedIds.contains(id)) {
        liked.add(id);
      }
    }

    for (final game in likedGames) {
      final id = _internalGameId(game);
      if (id != null && !preserveLikedIds.contains(id)) liked.add(id);
    }

    saved.addAll(preservedSaved);
    played.addAll(preservedPlayed);
    favorites.addAll(preservedFavorites);
    liked.addAll(preservedLiked);
    ratings.addAll(preservedRatings);

    notifyListeners();
  }

  static String? _internalGameId(Map<String, dynamic>? value) {
    final id = value?['id'] ?? value?['gameId'];
    return id is String && id.trim().isNotEmpty ? id : null;
  }

  @override
  void dispose() {
    _errorController.close();
    super.dispose();
  }
}
