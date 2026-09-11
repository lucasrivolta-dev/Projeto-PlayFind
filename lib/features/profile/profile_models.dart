class Game {
  const Game(this.title, this.developer, this.appId, this.rating, this.genre);
  final String title;
  final String developer;
  final int appId;
  final String rating;
  final String genre;
}

class ProfileActivity {
  const ProfileActivity(this.title, this.subtitle, this.game);
  final String title;
  final String subtitle;
  final Game? game;
}

class GameReview {
  const GameReview(this.game, this.text, this.date, this.likes);
  final Game game;
  final String text;
  final String date;
  final int likes;
}

class ForumTopic {
  const ForumTopic(this.category, this.title, this.replies, this.date);
  final String category;
  final String title;
  final int replies;
  final String date;
}

class PlayerProfile {
  const PlayerProfile(
      {required this.name,
      required this.username,
      required this.bio,
      required this.followers,
      required this.following,
      required this.played,
      required this.saved,
      required this.reviewCount,
      required this.topicCount,
      required this.favorites,
      required this.activities,
      required this.reviews,
      required this.topics,
      required this.genres});
  final String name, username, bio;
  final int followers, following, played, saved, reviewCount, topicCount;
  final List<Game> favorites;
  final List<ProfileActivity> activities;
  final List<GameReview> reviews;
  final List<ForumTopic> topics;
  final List<String> genres;

  PlayerProfile edited({required String name, required String bio}) =>
      PlayerProfile(
        name: name,
        username: username,
        bio: bio,
        followers: followers,
        following: following,
        played: played,
        saved: saved,
        reviewCount: reviewCount,
        topicCount: topicCount,
        favorites: favorites,
        activities: activities,
        reviews: reviews,
        topics: topics,
        genres: genres,
      );
}
