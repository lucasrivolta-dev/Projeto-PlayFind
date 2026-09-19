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
  final Map<String, bool> _desiredLikes = {};
  final Set<String> _inFlightLikes = {};

  final Map<String, bool> _desiredSaved = {};
  final Set<String> _inFlightSaved = {};

  final Map<String, bool> _desiredPlayed = {};
  final Set<String> _inFlightPlayed = {};

  final Map<String, int?> _desiredRatings = {};
  final Set<String> _inFlightRatings = {};

  final Map<String, bool> _savedPreviousWasPlayed = {};
  final Map<String, int?> _savedPreviousRating = {};

  final Map<String, bool> _playedPreviousWasSaved = {};
  final Map<String, int?> _playedPreviousRating = {};

  final Map<String, int?> _ratingPreviousRating = {};
  final Map<String, bool> _ratingPreviousWasPlayed = {};
  final Map<String, bool> _ratingPreviousWasSaved = {};

  final Set<String> _pendingFavorites = {};

  // Stream de erros para feedback discreto na UI.
  final _errorController = StreamController<String>.broadcast();
  Stream<String> get errors => _errorController.stream;

  void _emitError(String message) {
    if (!_errorController.isClosed) _errorController.add(message);
  }

  /// Registra ou atualiza os metadados do jogo na biblioteca para que cards
  /// e abas possam renderizá-lo imediatamente mesmo que não esteja em cache local.
  void registerGame(DiscoveryGame game) {
    gamesById[game.id] = game;
  }

  void registerGames(Iterable<DiscoveryGame> games) {
    for (final game in games) {
      gamesById[game.id] = game;
    }
  }

  void toggleSaved(String id, [DiscoveryGame? game]) {
    if (game != null) gamesById[id] = game;
    _touch(id);
    final targetState = !saved.contains(id);
    if (targetState) {
      _savedPreviousWasPlayed.putIfAbsent(id, () => played.contains(id));
      _savedPreviousRating.putIfAbsent(id, () => ratings[id]);
      saved.add(id);
      played.remove(id);
      ratings.remove(id);
    } else {
      saved.remove(id);
    }
    _desiredSaved[id] = targetState;
    notifyListeners();

    if (_inFlightSaved.add(id)) {
      unawaited(_runSavedSync(id));
    }
  }

  Future<void> _runSavedSync(String id) async {
    while (true) {
      final desired = _desiredSaved[id];
      if (desired == null) break;
      try {
        if (desired) {
          await _repo.setStatus(id, 'WANT_TO_PLAY');
        } else {
          await _repo.remove(id);
        }
        if (_desiredSaved[id] == desired) {
          _desiredSaved.remove(id);
          _savedPreviousWasPlayed.remove(id);
          _savedPreviousRating.remove(id);
          break;
        }
      } catch (e) {
        debugPrint('[LibraryStore] Falha ao persistir status para $id: $e');
        if (_desiredSaved[id] == desired) {
          if (desired) {
            saved.remove(id);
            final wasPlayed = _savedPreviousWasPlayed.remove(id) ?? false;
            if (wasPlayed) played.add(id);
            final previousRating = _savedPreviousRating.remove(id);
            if (previousRating != null) ratings[id] = previousRating;
          } else {
            saved.add(id);
          }
          _desiredSaved.remove(id);
          notifyListeners();
          _emitError(desired
              ? 'Não foi possível salvar o jogo. Tente novamente.'
              : 'Não foi possível remover o jogo. Tente novamente.');
          break;
        }
      }
    }
    _inFlightSaved.remove(id);
  }

  void markPlayed(String id, [DiscoveryGame? game]) {
    if (game != null) gamesById[id] = game;
    if (played.contains(id)) return;
    _touch(id);
    _playedPreviousWasSaved.putIfAbsent(id, () => saved.contains(id));
    saved.remove(id);
    played.add(id);
    _desiredPlayed[id] = true;
    notifyListeners();

    if (_inFlightPlayed.add(id)) {
      unawaited(_runPlayedSync(id));
    }
  }

  void togglePlayed(String id, [DiscoveryGame? game]) {
    if (game != null) gamesById[id] = game;
    if (!played.contains(id)) {
      markPlayed(id, game);
      return;
    }
    _touch(id);
    _playedPreviousRating.putIfAbsent(id, () => ratings[id]);
    played.remove(id);
    ratings.remove(id);
    _desiredPlayed[id] = false;
    notifyListeners();

    if (_inFlightPlayed.add(id)) {
      unawaited(_runPlayedSync(id));
    }
  }

  Future<void> _runPlayedSync(String id) async {
    while (true) {
      final desired = _desiredPlayed[id];
      if (desired == null) break;
      try {
        if (desired) {
          await _repo.setStatus(id, 'PLAYED');
        } else {
          await _repo.remove(id);
        }
        if (_desiredPlayed[id] == desired) {
          _desiredPlayed.remove(id);
          _playedPreviousWasSaved.remove(id);
          _playedPreviousRating.remove(id);
          break;
        }
      } catch (e) {
        debugPrint('[LibraryStore] Falha ao persistir status jogado para $id: $e');
        if (_desiredPlayed[id] == desired) {
          if (desired) {
            played.remove(id);
            final wasSaved = _playedPreviousWasSaved.remove(id) ?? false;
            if (wasSaved) saved.add(id);
          } else {
            played.add(id);
            final previousRating = _playedPreviousRating.remove(id);
            if (previousRating != null) ratings[id] = previousRating;
          }
          _desiredPlayed.remove(id);
          notifyListeners();
          _emitError(desired
              ? 'Não foi possível marcar como jogado. Tente novamente.'
              : 'Não foi possível remover o jogo. Tente novamente.');
          break;
        }
      }
    }
    _inFlightPlayed.remove(id);
  }

  void removeRating(String id) {
    _touch(id);
    _ratingPreviousRating.putIfAbsent(id, () => ratings[id]);
    ratings.remove(id);
    _desiredRatings[id] = null;
    notifyListeners();

    if (_inFlightRatings.add(id)) {
      unawaited(_runRatingSync(id));
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

  void rate(String id, int rating, [DiscoveryGame? game]) {
    if (rating < 1 || rating > 5) return;
    if (game != null) gamesById[id] = game;
    _touch(id);
    _ratingPreviousRating.putIfAbsent(id, () => ratings[id]);
    _ratingPreviousWasPlayed.putIfAbsent(id, () => played.contains(id));
    _ratingPreviousWasSaved.putIfAbsent(id, () => saved.contains(id));
    ratings[id] = rating;
    played.add(id);
    saved.remove(id);
    _desiredRatings[id] = rating;
    notifyListeners();

    if (_inFlightRatings.add(id)) {
      unawaited(_runRatingSync(id));
    }
  }

  Future<void> _runRatingSync(String id) async {
    while (true) {
      final desired = _desiredRatings[id];
      try {
        if (desired != null) {
          await _repo.rate(id, desired);
        } else {
          await _repo.removeRating(id);
        }
        if (_desiredRatings[id] == desired) {
          _desiredRatings.remove(id);
          _ratingPreviousRating.remove(id);
          _ratingPreviousWasPlayed.remove(id);
          _ratingPreviousWasSaved.remove(id);
          break;
        }
      } catch (e) {
        debugPrint('[LibraryStore] Falha ao persistir avaliação ($desired) para $id: $e');
        if (_desiredRatings[id] == desired) {
          final previousRating = _ratingPreviousRating.remove(id);
          final wasPlayed = _ratingPreviousWasPlayed.remove(id) ?? false;
          final wasSaved = _ratingPreviousWasSaved.remove(id) ?? false;
          if (desired != null) {
            if (previousRating == null) {
              ratings.remove(id);
            } else {
              ratings[id] = previousRating;
            }
            if (!wasPlayed) played.remove(id);
            if (wasSaved) saved.add(id);
          } else {
            if (previousRating != null) ratings[id] = previousRating;
          }
          _desiredRatings.remove(id);
          notifyListeners();
          _emitError('Não foi possível atualizar a avaliação. Tente novamente.');
          break;
        }
      }
    }
    _inFlightRatings.remove(id);
  }

  void toggleLike(String id, [DiscoveryGame? game]) {
    if (game != null) gamesById[id] = game;
    _touchLike(id);
    final isLikedNow = liked.contains(id);
    final targetState = !isLikedNow;
    if (targetState) {
      liked.add(id);
    } else {
      liked.remove(id);
    }
    _desiredLikes[id] = targetState;
    notifyListeners();

    if (_inFlightLikes.add(id)) {
      unawaited(_runLikeSync(id));
    }
  }

  Future<void> _runLikeSync(String id) async {
    while (true) {
      final desired = _desiredLikes[id];
      if (desired == null) break;
      try {
        final persisted = await _repo.setLiked(id, desired);
        if (_desiredLikes[id] == desired) {
          if (persisted != desired) {
            if (persisted) {
              liked.add(id);
            } else {
              liked.remove(id);
            }
            notifyListeners();
          }
          _desiredLikes.remove(id);
          break;
        }
      } catch (e) {
        debugPrint('[LibraryStore] Falha ao persistir curtida ($desired) para $id: $e');
        if (_desiredLikes[id] == desired) {
          if (desired) {
            liked.remove(id);
          } else {
            liked.add(id);
          }
          _desiredLikes.remove(id);
          notifyListeners();
          _emitError('Não foi possível atualizar a curtida. Tente novamente.');
          break;
        }
      }
    }
    _inFlightLikes.remove(id);
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
    _desiredLikes.clear();
    _inFlightLikes.clear();
    _desiredSaved.clear();
    _inFlightSaved.clear();
    _desiredPlayed.clear();
    _inFlightPlayed.clear();
    _desiredRatings.clear();
    _inFlightRatings.clear();
    _savedPreviousWasPlayed.clear();
    _savedPreviousRating.clear();
    _playedPreviousWasSaved.clear();
    _playedPreviousRating.clear();
    _ratingPreviousRating.clear();
    _ratingPreviousWasPlayed.clear();
    _ratingPreviousWasSaved.clear();
    _pendingFavorites.clear();
    notifyListeners();
  }

  /// Inicializa o estado a partir de uma lista de itens JSON retornada
  /// por `GET /api/v1/library`. Substitui qualquer estado anterior.
  void loadFromApi(List<Map<String, dynamic>> items,
      {List<Map<String, dynamic>> likedGames = const [],
      Set<String> preserveIds = const {},
      Set<String> preserveLikedIds = const {}}) {
    final effectivePreserveIds = {
      ...preserveIds,
      ..._desiredSaved.keys,
      ..._inFlightSaved,
      ..._desiredPlayed.keys,
      ..._inFlightPlayed,
      ..._desiredRatings.keys,
      ..._inFlightRatings,
    };
    final effectivePreserveLikedIds = {
      ...preserveLikedIds,
      ..._desiredLikes.keys,
      ..._inFlightLikes,
    };
    final preservedSaved = saved.intersection(effectivePreserveIds);
    final preservedPlayed = played.intersection(effectivePreserveIds);
    final preservedFavorites = favorites.intersection(effectivePreserveIds);
    final preservedLiked = liked.intersection(effectivePreserveLikedIds);
    final preservedRatings = Map<String, int>.fromEntries(
        ratings.entries.where((entry) => effectivePreserveIds.contains(entry.key)));
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

      if (!effectivePreserveIds.contains(id)) {
        final status = item['status'] as String?;
        if (status == 'WANT_TO_PLAY') saved.add(id);
        if (status == 'PLAYED') played.add(id);
        if (item['isFavorite'] == true) favorites.add(id);
        final rating = item['rating'] as int?;
        if (rating != null) ratings[id] = rating;
      }
      if (item['liked'] == true && !effectivePreserveLikedIds.contains(id)) {
        liked.add(id);
      }
    }

    for (final game in likedGames) {
      final id = _internalGameId(game);
      if (id != null && !effectivePreserveLikedIds.contains(id)) liked.add(id);
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
