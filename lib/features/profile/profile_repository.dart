import 'profile_models.dart';

abstract interface class ProfileRepository {
  Future<PlayerProfile?> load();
  Future<PlayerProfile> save(PlayerProfile profile);
}

/// Demonstration data held in memory. Replace with an authenticated API source.
class DemoProfileRepository implements ProfileRepository {
  static const redDead = Game('Red Dead Redemption 2', 'Rockstar Games',
      1174180, '9.7', 'Mundo aberto');
  static const hollow =
      Game('Hollow Knight', 'Team Cherry', 367520, '9.5', 'Metroidvania');
  static const subnautica =
      Game('Subnautica', 'Unknown Worlds', 264710, '9.3', 'Sobrevivência');
  static const pacific = Game(
      'Pacific Drive', 'Ironwood Studios', 1458140, '8.6', 'Sobrevivência');
  static const resident =
      Game('Resident Evil 4', 'CAPCOM', 2050650, '9.4', 'Terror');
  static const hades =
      Game('Hades', 'Supergiant Games', 1145360, '9.6', 'Roguelike');
  PlayerProfile _profile = const PlayerProfile(
    name: 'Lucas',
    username: 'lucas',
    bio:
        'RPG, terror e qualquer coisa que me faça esquecer da hora.\nSempre à procura do próximo mundo.',
    followers: 1200,
    following: 384,
    played: 142,
    saved: 38,
    reviewCount: 24,
    topicCount: 35,
    favorites: [redDead, hollow, subnautica, hades, resident, pacific],
    genres: ['RPG', 'Terror', 'Sobrevivência', 'Co-op', 'Indie'],
    activities: [
      ProfileActivity(
          'Adicionou Pacific Drive', 'A Quero jogar · 2 horas atrás', pacific),
      ProfileActivity('Avaliou Hollow Knight', '★★★★★ · 5 horas atrás', hollow),
      ProfileActivity('Publicou um tópico',
          '“Qual jogo vocês estão jogando?” · Ontem', null),
      ProfileActivity(
          'Marcou Resident Evil 4', 'Como Já joguei · 2 dias atrás', resident),
    ],
    reviews: [
      GameReview(
          hollow,
          'Uma obra-prima em cada detalhe. A exploração é recompensadora, o combate é preciso e a atmosfera é inesquecível. Um daqueles jogos que ficam com você.',
          '10 SET 2026',
          42),
      GameReview(
          redDead,
          'Um mundo que parece respirar. Me perdi nas pequenas histórias e nos caminhos sem destino. Uma experiência que vale cada hora.',
          '08 SET 2026',
          28),
    ],
    topics: [
      ForumTopic('DISCUSSÃO', 'Qual jogo vocês estão jogando essa semana?', 18,
          'Há 1 dia'),
      ForumTopic('RECOMENDAÇÕES', 'Jogos de terror realmente assustadores?', 24,
          'Há 3 dias'),
    ],
  );
  @override
  Future<PlayerProfile> load() async => _profile;
  @override
  Future<PlayerProfile> save(PlayerProfile profile) async => _profile = profile;
}
