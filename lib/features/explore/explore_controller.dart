import 'package:flutter/foundation.dart';
import 'explore_data.dart';
import '../library/library_store.dart';

enum ExploreStatus { loading, ready, error }

class ExploreController extends ChangeNotifier {
  ExploreController(this.repository, {LibraryStore? library})
      : library = library ?? LibraryStore(),
        _ownsLibrary = library == null {
    this.library.addListener(_emit);
  }
  final LibraryStore library;
  final bool _ownsLibrary;
  final ExploreRepository repository;
  ExploreStatus status = ExploreStatus.loading;
  List<DiscoveryGame> games = [];
  String query = '', category = 'Todos', platform = 'Todas';
  final Map<String, bool> choices = {};
  Set<String> get saved => library.saved;
  bool _disposed = false;
  void _emit() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    status = ExploreStatus.loading;
    _emit();
    try {
      games = await repository.load();
      library.registerGames(games);
      status = ExploreStatus.ready;
    } catch (_) {
      status = ExploreStatus.error;
    }
    _emit();
  }

  static String normalize(String value) {
    var result = value.toLowerCase();
    const accents = {
      'á': 'a',
      'à': 'a',
      'ã': 'a',
      'â': 'a',
      'é': 'e',
      'ê': 'e',
      'í': 'i',
      'ó': 'o',
      'ô': 'o',
      'õ': 'o',
      'ú': 'u',
      'ç': 'c'
    };
    accents.forEach((from, to) => result = result.replaceAll(from, to));
    return result;
  }

  bool get filtering =>
      query.trim().isNotEmpty || category != 'Todos' || platform != 'Todas';
  List<DiscoveryGame> get results => games.where((game) {
        final haystack = normalize(
            '${game.title} ${game.studio} ${game.genre} ${game.tags.join(' ')}');
        final words = normalize(query)
            .trim()
            .split(RegExp(r'\s+'))
            .where((word) => word.isNotEmpty);
        final categoryMatch = category == 'Todos' ||
            (category == 'Gratuitos'
                ? game.free
                : normalize(game.genre) == normalize(category) ||
                    game.tags
                        .any((tag) => normalize(tag) == normalize(category)));
        return categoryMatch &&
            (platform == 'Todas' || game.platforms.contains(platform)) &&
            words.every(haystack.contains);
      }).toList();

  DiscoveryGame? get nextGame {
    for (final game in games) {
      if (!choices.containsKey(game.id)) return game;
    }
    return null;
  }

  void search(String value) {
    query = value;
    _emit();
  }

  void selectCategory(String value) {
    category = value;
    _emit();
  }

  void selectPlatform(String value) {
    platform = value;
    _emit();
  }

  void resetFilters() {
    query = '';
    category = 'Todos';
    platform = 'Todas';
    _emit();
  }

  void choose(bool interested) {
    final game = nextGame;
    if (game == null) return;
    choices[game.id] = interested;
    _emit();
  }

  void restartChoices() {
    choices.clear();
    _emit();
  }

  DiscoveryGame? _findGame(String id) {
    for (final g in games) {
      if (g.id == id) return g;
    }
    return null;
  }

  void toggleSaved(String id, [DiscoveryGame? game]) {
    final g = game ?? _findGame(id);
    library.toggleSaved(id, g);
  }

  @override
  void dispose() {
    library.removeListener(_emit);
    if (_ownsLibrary) library.dispose();
    _disposed = true;
    super.dispose();
  }
}
