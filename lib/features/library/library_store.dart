import 'package:flutter/foundation.dart';
import 'library_repository.dart';

/// Estado compartilhado da biblioteca do usuário.
///
/// Cada mutação atualiza o estado em memória imediatamente (UI responsiva)
/// e dispara a persistência no backend em segundo plano via [_repo].
/// Se [repo] for omitido, usa [NoopLibraryRepository] (somente memória).
class LibraryStore extends ChangeNotifier {
  LibraryStore({LibraryRepository? repo})
      : _repo = repo ?? const NoopLibraryRepository();

  final LibraryRepository _repo;

  final Set<int> saved = {};
  final Set<int> played = {};
  final Set<int> favorites = {};
  final Map<int, int> ratings = {};

  void toggleSaved(int id) {
    final added = saved.add(id);
    if (!added) saved.remove(id);
    notifyListeners();
    if (added) {
      _repo.setStatus(id, 'WANT_TO_PLAY');
    } else {
      _repo.remove(id);
    }
  }

  void markPlayed(int id) {
    played.add(id);
    notifyListeners();
    _repo.setStatus(id, 'PLAYED');
  }

  void togglePlayed(int id) {
    final added = played.add(id);
    if (!added) {
      played.remove(id);
      ratings.remove(id);
      notifyListeners();
      _repo.remove(id);
    } else {
      notifyListeners();
      _repo.setStatus(id, 'PLAYED');
    }
  }

  void removeRating(int id) {
    ratings.remove(id);
    notifyListeners();
    _repo.removeRating(id);
  }

  void toggleFavorite(int id) {
    if (!favorites.add(id)) favorites.remove(id);
    notifyListeners();
    _repo.toggleFavorite(id);
  }

  void rate(int id, int rating) {
    if (rating < 1 || rating > 5) return;
    ratings[id] = rating;
    played.add(id);
    notifyListeners();
    _repo.rate(id, rating);
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
}
