import 'package:flutter/foundation.dart';
import '../explore/explore_data.dart';
import '../library/library_store.dart';

class FeedComment {
  const FeedComment(
      {required this.user,
      required this.text,
      required this.time,
      this.likes = 0,
      this.reply = false});
  final String user, text, time;
  final int likes;
  final bool reply;
}

class FeedItem {
  const FeedItem(
      {required this.game,
      this.match,
      this.caption = '',
      this.comments = const []});
  final DiscoveryGame game;
  final int? match;
  final String caption;
  final List<FeedComment> comments;
}

typedef FeedLoader = Future<List<DiscoveryGame>> Function({List<String>? excludeIds, int limit});

class FeedController extends ChangeNotifier {
  FeedController(
    Future<List<DiscoveryGame>> Function() repository, {
    FeedLoader? feedLoader,
    LibraryStore? library,
  })  : repository = repository,
        _feedLoader = feedLoader ??
            (({List<String>? excludeIds, int limit = 20}) => repository()),
        library = library ?? LibraryStore(),
        _ownsLibrary = library == null {
    this.library.addListener(_emit);
  }
  final LibraryStore library;
  final bool _ownsLibrary;
  final Future<List<DiscoveryGame>> Function() repository;
  final FeedLoader _feedLoader;
  bool loading = true;
  bool error = false;
  bool loadingMore = false;
  bool hasMore = true;
  final Set<String> _seenGameIds = {};
  Set<String> get seenGameIds => Set.unmodifiable(_seenGameIds);
  List<FeedItem> items = [];
  int current = 0;
  Set<String> get liked => library.liked;
  Set<String> get saved => library.saved;
  Set<String> get played => library.played;
  final Map<String, List<FeedComment>> addedComments = {};
  final Map<String, Set<FeedComment>> _likedComments = {};

  bool isCommentLiked(String gameId, FeedComment comment) =>
      _likedComments[gameId]?.contains(comment) ?? false;

  int commentLikeCount(String gameId, FeedComment comment) =>
      comment.likes + (isCommentLiked(gameId, comment) ? 1 : 0);

  void toggleCommentLike(String gameId, FeedComment comment) {
    final likes = _likedComments.putIfAbsent(gameId, () => {});
    if (!likes.add(comment)) likes.remove(comment);
    _emit();
  }

  final Set<String> _persistedSeen = {};

  void _markAsSeen(String gameId) {
    if (_persistedSeen.add(gameId)) {
      library.markFeedSeen(gameId);
    }
  }

  bool _disposed = false;

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  final Map<String, bool> _initialLikes = {};

  int realLikeCount(DiscoveryGame game) {
    final initiallyLiked = _initialLikes[game.id] ?? false;
    final isLikedNow = liked.contains(game.id);
    final delta = (isLikedNow ? 1 : 0) - (initiallyLiked ? 1 : 0);
    final count = game.likeCount + delta;
    return count < 0 ? 0 : count;
  }

  int realCommentCount(DiscoveryGame game) {
    final added = addedComments[game.id]?.length ?? 0;
    if (game.commentCount > 0) {
      return game.commentCount + added;
    }
    for (final it in items) {
      if (it.game.id == game.id) {
        return it.comments.length + added;
      }
    }
    return added;
  }

  List<FeedItem> _buildFeedItems(List<DiscoveryGame> games) {
    library.registerGames(games);
    for (final game in games) {
      _initialLikes.putIfAbsent(game.id, () => library.liked.contains(game.id));
    }
    return games.map((game) {
      final comments = [
        FeedComment(
            user: 'marina.games',
            text: 'Esse jogo ficou muito melhor do que eu esperava.',
            time: 'há 12 min',
            likes: 18),
        FeedComment(
            user: 'joaovitor',
            text: 'A trilha sonora é absurda.',
            time: 'há 31 min',
            likes: 7,
            reply: true),
      ];
      return FeedItem(
        game: game,
        match: game.matchScore,
        caption: game.description.isNotEmpty
            ? game.description
            : 'Uma aventura que recompensa cada minuto de exploração.',
        comments: comments,
      );
    }).toList();
  }

  int _loadGeneration = 0;

  Future<void> load() async {
    final generation = ++_loadGeneration;
    loading = true;
    loadingMore = false;
    error = false;
    _seenGameIds.clear();
    _persistedSeen.clear();
    hasMore = true;
    _emit();
    try {
      final rawGames = await _feedLoader(excludeIds: null, limit: 20);
      if (generation != _loadGeneration) return;
      final games = <DiscoveryGame>[];
      for (final g in rawGames) {
        if (_seenGameIds.add(g.id)) {
          games.add(g);
        }
      }
      if (games.isEmpty) {
        hasMore = false;
      }
      items = _buildFeedItems(games);
      // Loading replaces the PageView; its first page and trailer must agree.
      current = 0;
      if (items.isNotEmpty) {
        _markAsSeen(items[0].game.id);
      }
    } catch (e, s) {
      debugPrint('[FeedController] load error: $e\n$s');
      if (generation != _loadGeneration) return;
      error = true;
    } finally {
      if (generation == _loadGeneration) {
        loading = false;
        _emit();
      }
    }
  }

  Future<void> loadMore() async {
    if (loading || loadingMore || !hasMore) return;
    final generation = _loadGeneration;
    loadingMore = true;
    _emit();
    try {
      final rawGames = await _feedLoader(
        excludeIds: _seenGameIds.toList(),
        limit: 20,
      );
      if (generation != _loadGeneration) return;
      final newGames = <DiscoveryGame>[];
      for (final g in rawGames) {
        if (_seenGameIds.add(g.id)) {
          newGames.add(g);
        }
      }
      if (newGames.isEmpty) {
        hasMore = false;
      } else {
        final newItems = _buildFeedItems(newGames);
        items.addAll(newItems);
      }
    } catch (_) {
      // Falhas de rede ou timeout durante loadMore não quebram o feed nem apagam itens.
    } finally {
      if (generation == _loadGeneration) {
        loadingMore = false;
        _emit();
      }
    }
  }

  void setCurrent(int index) {
    current = items.isEmpty ? 0 : index.clamp(0, items.length - 1);
    _emit();
    if (items.isNotEmpty && current >= 0 && current < items.length) {
      _markAsSeen(items[current].game.id);
    }
    // Prefetching contínuo ao se aproximar dos últimos itens da lista
    final shouldPrefetch = items.length >= 4
        ? (index >= items.length - 4)
        : (items.isNotEmpty && index == items.length - 1);
    if (shouldPrefetch && hasMore && !loadingMore && !loading) {
      loadMore();
    }
  }

  DiscoveryGame? _findGame(String id) {
    for (final item in items) {
      if (item.game.id == id) return item.game;
    }
    return null;
  }

  void toggleLike(String id, [DiscoveryGame? game]) {
    final g = game ?? _findGame(id);
    library.toggleLike(id, g);
  }

  void toggleSave(String id, [DiscoveryGame? game]) {
    final g = game ?? _findGame(id);
    library.toggleSaved(id, g);
  }

  void markPlayed(String id, [DiscoveryGame? game]) {
    final g = game ?? _findGame(id);
    library.markPlayed(id, g);
  }

  void addComment(String id, String text) {
    final value = text.trim();
    if (value.isEmpty) return;
    (addedComments[id] ??= [])
        .add(FeedComment(user: 'você', text: value, time: 'agora'));
    _emit();
  }

  List<FeedComment> commentsFor(FeedItem item) =>
      [...item.comments, ...?addedComments[item.game.id]];
  @override
  void dispose() {
    library.removeListener(_emit);
    if (_ownsLibrary) library.dispose();
    _disposed = true;
    super.dispose();
  }
}
