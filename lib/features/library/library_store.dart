import 'dart:async';
import 'package:flutter/foundation.dart';
import 'library_repository.dart';

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
  final Map<int, int> _changedAt = {};
  final Map<int, int> _likesChangedAt = {};

  int get revision => _revision;
  Set<int> idsChangedSince(int revision) => _changedAt.entries
      .where((entry) => entry.value > revision)
      .map((entry) => entry.key)
      .toSet();
  Set<int> likedIdsChangedSince(int revision) => _likesChangedAt.entries
      .where((entry) => entry.value > revision)
      .map((entry) => entry.key)
      .toSet();

  void _touch(int id) => _changedAt[id] = ++_revision;
  void _touchLike(int id) => _likesChangedAt[id] = ++_revision;

  void reportLoadFailure() => _emitError(
      'Não foi possível carregar a biblioteca. Verifique a conexão.');

  final Set<int> saved = {};
  final Set<int> played = {};
  final Set<int> favorites = {};
  final Set<int> liked = {};
  final Map<int, int> ratings = {};
  final Set<int> _pendingLikes = {};
  final Set<int> _pendingFavorites = {};
  final Set<int> _pendingRatings = {};
  final Set<int> _pendingSaved = {};
  final Map<int, bool> _queuedSavedActions = {};
  final Set<int> _pendingPlayed = {};

  // Stream de erros para feedback discreto na UI.
  final _errorController = StreamController<String>.broadcast();
  Stream<String> get errors => _errorController.stream;

  void _emitError(String message) {
    if (!_errorController.isClosed) _errorController.add(message);
  }

  void toggleSaved(int id) {
    _touch(id);
    final added = saved.add(id);
    if (!added) saved.remove(id);
    notifyListeners();

    if (!_pendingSaved.add(id)) {
      _queuedSavedActions[id] = added;
      return;
    }
    unawaited(_persistSaved(id, added));
  }

  Future<void> _persistSaved(int id, bool added) async {
    try {
      if (added) {
        await _repo.setStatus(id, 'WANT_TO_PLAY');
      } else {
        await _repo.remove(id);
      }
    } catch (_) {
      if (added) {
        saved.remove(id);
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
        unawaited(_persistSaved(id, queued));
      }
    }
  }

  void markPlayed(int id) {
    if (played.contains(id) || !_pendingPlayed.add(id)) return;
    _touch(id);
    final wasSaved = saved.remove(id);
    played.add(id);
    notifyListeners();
    unawaited(_persistPlayed(id, wasSaved));
  }

  Future<void> _persistPlayed(int id, bool wasSaved) async {
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

  void togglePlayed(int id) {
    _touch(id);
    final added = played.add(id);
    if (!added) {
      played.remove(id);
      final previousRating = ratings.remove(id);
      notifyListeners();
      _repo.remove(id).catchError((_) {
        played.add(id);
        if (previousRating != null) ratings[id] = previousRating;
        notifyListeners();
        _emitError('Não foi possível remover o jogo. Tente novamente.');
      });
    } else {
      notifyListeners();
      _repo.setStatus(id, 'PLAYED').catchError((_) {
        played.remove(id);
        notifyListeners();
        _emitError('Não foi possível marcar como jogado. Tente novamente.');
      });
    }
  }

  void removeRating(int id) {
    if (!_pendingRatings.add(id)) return;
    _touch(id);
    final previous = ratings.remove(id);
    notifyListeners();
    unawaited(_persistRatingRemoval(id, previous));
  }

  Future<void> _persistRatingRemoval(int id, int? previous) async {
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

  void toggleFavorite(int id) {
    if (!_pendingFavorites.add(id)) return;
    _touch(id);
    if (!favorites.add(id)) favorites.remove(id);
    final value = favorites.contains(id);
    notifyListeners();
    unawaited(_persistFavorite(id, value));
  }

  Future<void> _persistFavorite(int id, bool value) async {
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

  void rate(int id, int rating) {
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

  Future<void> _persistRating(int id, int rating, int? previous,
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

  void toggleLike(int id) {
    if (!_pendingLikes.add(id)) return;
    _touchLike(id);
    final optimistic = liked.add(id);
    if (!optimistic) liked.remove(id);
    notifyListeners();
    unawaited(_persistLike(id, optimistic));
  }

  Future<void> _persistLike(int id, bool optimistic) async {
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

  Set<int> get all => {...saved, ...played, ...favorites, ...ratings.keys};

  /// Inicializa o estado a partir de uma lista de itens JSON retornada
  /// por `GET /api/v1/library`. Substitui qualquer estado anterior.
  void loadFromApi(List<Map<String, dynamic>> items,
      {List<Map<String, dynamic>> likedGames = const [],
      Set<int> preserveIds = const {},
      Set<int> preserveLikedIds = const {}}) {
    final preservedSaved = saved.intersection(preserveIds);
    final preservedPlayed = played.intersection(preserveIds);
    final preservedFavorites = favorites.intersection(preserveIds);
    final preservedLiked = liked.intersection(preserveLikedIds);
    final preservedRatings = Map<int, int>.fromEntries(
        ratings.entries.where((entry) => preserveIds.contains(entry.key)));
    saved.clear();
    played.clear();
    favorites.clear();
    liked.clear();
    ratings.clear();

    for (final item in items) {
      // Resolve o id numérico a partir de steamAppId → igdbId.
      final game = item['game'] as Map<String, dynamic>?;
      final id = _externalGameId(game);
      if (id == null) continue;

      if (preserveIds.contains(id)) continue;

      final status = item['status'] as String?;
      if (status == 'WANT_TO_PLAY') saved.add(id);
      if (status == 'PLAYED') played.add(id);

      if (item['isFavorite'] == true) favorites.add(id);

      final rating = item['rating'] as int?;
      if (rating != null) ratings[id] = rating;
    }

    for (final game in likedGames) {
      final id = _externalGameId(game);
      if (id != null && !preserveLikedIds.contains(id)) liked.add(id);
    }

    saved.addAll(preservedSaved);
    played.addAll(preservedPlayed);
    favorites.addAll(preservedFavorites);
    liked.addAll(preservedLiked);
    ratings.addAll(preservedRatings);

    notifyListeners();
  }

  static int? _externalGameId(Map<String, dynamic>? game) {
    final steamAppId = game?['steamAppId'] as int?;
    if (steamAppId != null && steamAppId > 0) return steamAppId;
    final igdbId = game?['igdbId'] as int?;
    if (igdbId != null && igdbId > 0) return igdbId;
    return null;
  }

  @override
  void dispose() {
    _errorController.close();
    super.dispose();
  }
}
