import 'package:flutter/foundation.dart';

/// Shared session state. A persistent repository can replace this store later.
class LibraryStore extends ChangeNotifier {
  final Set<int> saved = {};
  final Set<int> played = {};
  final Set<int> favorites = {};
  final Map<int, int> ratings = {};

  void toggleSaved(int id) {
    if (!saved.add(id)) saved.remove(id);
    notifyListeners();
  }

  void markPlayed(int id) {
    played.add(id);
    notifyListeners();
  }

  void togglePlayed(int id) {
    if (!played.add(id)) {
      played.remove(id);
      ratings.remove(id);
    }
    notifyListeners();
  }

  void removeRating(int id) {
    ratings.remove(id);
    notifyListeners();
  }

  void toggleFavorite(int id) {
    if (!favorites.add(id)) favorites.remove(id);
    notifyListeners();
  }

  void rate(int id, int rating) {
    if (rating < 1 || rating > 5) return;
    ratings[id] = rating;
    played.add(id);
    notifyListeners();
  }

  Set<int> get all => {...saved, ...played, ...favorites, ...ratings.keys};
}
