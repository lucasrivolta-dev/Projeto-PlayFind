import 'package:flutter/foundation.dart';
import '../explore/explore_controller.dart';

class ForumReply {
  ForumReply(
      {required this.id,
      required this.author,
      required this.text,
      this.parentId});
  final int id;
  final String author, text;
  final int? parentId;
  bool liked = false;
}

class ForumTopic {
  ForumTopic(
      {required this.id,
      required this.author,
      required this.title,
      required this.body,
      required this.category,
      this.game,
      this.tags = const [],
      this.likes = 0,
      this.time = 'agora'});
  final int id;
  final String author, title, body, category, time;
  final String? game;
  final List<String> tags;
  final int likes;
  bool liked = false, following = false;
  final List<ForumReply> replies = [];
  int get likeCount => likes + (liked ? 1 : 0);
}

abstract interface class ForumRepository {
  Future<List<ForumTopic>> load();
}

class DemoForumRepository implements ForumRepository {
  @override
  Future<List<ForumTopic>> load() async => [
        ForumTopic(
            id: 1,
            author: 'gabriel.games',
            title: 'Qual jogo vocês estão jogando essa semana?',
            body:
                'Terminei minha última aventura e quero descobrir algo novo. Vale indie, RPG ou aquele jogo que você sempre volta a jogar. Me contem o que está prendendo vocês!',
            category: 'Geral',
            likes: 142,
            time: 'há 2 h',
            tags: ['Bate-papo']),
        ForumTopic(
            id: 2,
            author: 'marina.games',
            title:
                'Vale a pena começar Baldur’s Gate 3 sem conhecer RPG de turno?',
            body: 'Adoro jogos com boas histórias, mas nunca joguei RPG de turno. A curva de aprendizado é tranquila? Queria ouvir a experiência de quem começou do zero.',
            category: 'Perguntas',
            game: 'Baldur’s Gate 3',
            likes: 86,
            time: 'há 3 h',
            tags: ['RPG', 'Sem spoilers']),
        ForumTopic(
            id: 3,
            author: 'lucasplays',
            title: 'Jogos co-op para pessoas que quase nunca jogam',
            body:
                'Quero apresentar jogos para meus amigos. Procuro algo divertido, com controles simples e que dê para aprender juntos. It Takes Two parece uma boa opção?',
            category: 'Recomendações',
            game: 'It Takes Two',
            likes: 58,
            time: 'há 4 h',
            tags: ['Co-op']),
        ForumTopic(
            id: 4,
            author: 'bia.games',
            title: 'O que faz Hades ser tão difícil de largar?',
            body:
                'Cada tentativa traz uma conversa nova e uma combinação diferente. O combate é ótimo, mas são os personagens que sempre me fazem voltar.',
            category: 'Análises',
            game: 'Hades',
            likes: 35,
            time: 'há 5 h',
            tags: ['Indies', 'Roguelike']),
      ];
}

class ForumController extends ChangeNotifier {
  ForumController(this.repository);
  final ForumRepository repository;
  static const categories = [
    'Todos',
    'Geral',
    'Recomendações',
    'Perguntas',
    'Análises'
  ];
  List<ForumTopic> topics = [];
  String query = '', category = 'Todos';
  bool loading = true, error = false, _disposed = false;
  int _nextId = 100;
  void _emit() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    loading = true;
    error = false;
    _emit();
    try {
      topics = await repository.load();
    } catch (_) {
      error = true;
    }
    loading = false;
    _emit();
  }

  List<ForumTopic> get results => topics
      .where((topic) =>
          (category == 'Todos' || topic.category == category) &&
          ExploreController.normalize(
                  '${topic.title} ${topic.body} ${topic.game ?? ''} ${topic.tags.join(' ')}')
              .contains(ExploreController.normalize(query.trim())))
      .toList();
  List<ForumTopic> get trending {
    final sorted = [...results]
      ..sort((a, b) => b.likeCount.compareTo(a.likeCount));
    return sorted.take(2).toList();
  }

  void search(String value) {
    query = value;
    _emit();
  }

  void selectCategory(String value) {
    category = value;
    _emit();
  }

  ForumTopic? create(
      {required String title,
      required String body,
      required String category,
      String? game,
      List<String> tags = const []}) {
    if (title.trim().length < 5 ||
        body.trim().length < 10 ||
        !categories.skip(1).contains(category)) {
      return null;
    }
    final topic = ForumTopic(
        id: _nextId++,
        author: 'você',
        title: title.trim(),
        body: body.trim(),
        category: category,
        game: game,
        tags: tags);
    topics.insert(0, topic);
    _emit();
    return topic;
  }

  void like(ForumTopic topic) {
    topic.liked = !topic.liked;
    _emit();
  }

  void follow(ForumTopic topic) {
    topic.following = !topic.following;
    _emit();
  }

  void likeReply(ForumReply reply) {
    reply.liked = !reply.liked;
    _emit();
  }

  bool reply(ForumTopic topic, String text, {int? parentId}) {
    if (text.trim().isEmpty ||
        (parentId != null &&
            !topic.replies.any((reply) => reply.id == parentId))) {
      return false;
    }
    topic.replies.add(ForumReply(
        id: _nextId++, author: 'você', text: text.trim(), parentId: parentId));
    _emit();
    return true;
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
