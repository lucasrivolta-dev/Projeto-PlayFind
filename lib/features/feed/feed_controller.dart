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
      required this.match,
      required this.caption,
      required this.comments});
  final DiscoveryGame game;
  final int match;
  final String caption;
  final List<FeedComment> comments;
}

class FeedController extends ChangeNotifier {
  FeedController(this.repository, {LibraryStore? library})
      : library = library ?? LibraryStore(),
        _ownsLibrary = library == null {
    this.library.addListener(_emit);
  }
  final LibraryStore library;
  final bool _ownsLibrary;
  final Future<List<DiscoveryGame>> Function() repository;
  bool loading = true;
  bool error = false;
  List<FeedItem> items = [];
  int current = 0;
  Set<int> get liked => library.liked;
  Set<int> get saved => library.saved;
  Set<int> get played => library.played;
  final Map<int, List<FeedComment>> addedComments = {};
  final Map<int, Set<FeedComment>> _likedComments = {};

  bool isCommentLiked(int gameId, FeedComment comment) =>
      _likedComments[gameId]?.contains(comment) ?? false;

  int commentLikeCount(int gameId, FeedComment comment) =>
      comment.likes + (isCommentLiked(gameId, comment) ? 1 : 0);

  void toggleCommentLike(int gameId, FeedComment comment) {
    final likes = _likedComments.putIfAbsent(gameId, () => {});
    if (!likes.add(comment)) likes.remove(comment);
    _emit();
  }

  bool _disposed = false;

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    loading = true;
    error = false;
    _emit();
    try {
      final games = await repository();
      items = games.asMap().entries.map((entry) {
        final index = entry.key;
        final game = entry.value;
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
        // Captions editoriais rotativos — funcionam para qualquer N de jogos.
        const captions = [
          'Uma aventura que recompensa cada minuto de exploração.',
          'Quando você quer uma história para esquecer do mundo por algumas horas.',
          'Encontre seu esquadrão. A próxima missão começa agora.',
          'Pequeno no tamanho. Gigante nos segredos.',
          'Uma mão nunca é igual à outra.',
          'O mundo está esperando por você.',
          'Horas se passam sem você perceber.',
          'Difícil de largár depois do primeiro nível.',
          'Uma experiência que fica na memória.',
          'Descubra o que está além do horizonte.',
        ];
        // matchScore vem da API quando disponível; caso contrário usa valor editorial rotativo.
        const fallbackMatches = [94, 87, 91, 82, 89, 78, 85, 92, 88, 80];
        final match =
            game.matchScore ?? fallbackMatches[index % fallbackMatches.length];
        return FeedItem(
            game: game,
            match: match,
            caption: captions[index % captions.length],
            comments: comments);
      }).toList();
    } catch (_) {
      error = true;
    }
    loading = false;
    _emit();
  }

  void setCurrent(int index) {
    current = items.isEmpty ? 0 : index.clamp(0, items.length - 1);
    _emit();
  }

  void toggleLike(int id) {
    library.toggleLike(id);
  }

  void toggleSave(int id) {
    library.toggleSaved(id);
  }

  void markPlayed(int id) {
    library.markPlayed(id);
  }

  void addComment(int id, String text) {
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
