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

  final Set<int> saved = {};
  final Set<int> played = {};
  final Set<int> favorites = {};
  final Map<int, int> ratings = {};
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
    final added = played.add(id);
    if (!added) {
      played.remove(id);
      ratings.remove(id);
      notifyListeners();
      _repo.remove(id).catchError((_) {
        played.add(id);
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
    ratings.remove(id);
    notifyListeners();
    _repo.removeRating(id).catchError((_) {
      // Não reverte rating porque não temos o valor anterior aqui;
      // simplesmente informa o erro.
      _emitError('Não foi possível remover a avaliação. Tente novamente.');
    });
  }

  void toggleFavorite(int id) {
    if (!favorites.add(id)) favorites.remove(id);
    notifyListeners();
    _repo.toggleFavorite(id).catchError((_) {
      // Reverte o toggle.
      if (!favorites.remove(id)) favorites.add(id);
      notifyListeners();
      _emitError('Não foi possível atualizar favorito. Tente novamente.');
    });
  }

  void rate(int id, int rating) {
    if (rating < 1 || rating > 5) return;
    ratings[id] = rating;
    played.add(id);
    notifyListeners();
    _repo.rate(id, rating).catchError((_) {
      ratings.remove(id);
      notifyListeners();
      _emitError('Não foi possível salvar a avaliação. Tente novamente.');
    });
  }

  Set<int> get all => {...saved, ...played, ...favorites, ...ratings.keys};

  /// Inicializa o estado a partir de uma lista de itens JSON retornada
  /// por `GET /api/v1/library`. Substitui qualquer estado anterior.
  void loadFromApi(List<Map<String, dynamic>> items) {
    saved.clear();
    played.clear();
    favorites.clear();
    ratings.clear();

    for (final item in items) {
      // Resolve o id numérico a partir de steamAppId → igdbId.
      final game = item['game'] as Map<String, dynamic>?;
      final steamAppId = game?['steamAppId'] as int?;
      final igdbId = game?['igdbId'] as int?;
      final int id;
      if (steamAppId != null && steamAppId > 0) {
        id = steamAppId;
      } else if (igdbId != null && igdbId > 0) {
        id = igdbId;
      } else {
        continue; // Jogo sem id utilizável é ignorado.
      }

      final status = item['status'] as String?;
      if (status == 'WANT_TO_PLAY') saved.add(id);
      if (status == 'PLAYED') played.add(id);

      if (item['isFavorite'] == true) favorites.add(id);

      final rating = item['rating'] as int?;
      if (rating != null) ratings[id] = rating;
    }

    notifyListeners();
  }

  @override
  void dispose() {
    _errorController.close();
    super.dispose();
  }
}
