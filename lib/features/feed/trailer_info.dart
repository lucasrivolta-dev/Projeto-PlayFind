enum TrailerProvider { youtube, steam, other }

class TrailerInfo {
  const TrailerInfo({required this.provider, this.url, this.videoId});

  final TrailerProvider provider;
  final String? url;
  final String? videoId;

  bool get isPlayableYoutube =>
      provider == TrailerProvider.youtube &&
      videoId != null &&
      RegExp(r'^[a-zA-Z0-9_-]{11}$').hasMatch(videoId!);

  static TrailerInfo? fromJson(Object? value) {
    if (value is! Map<String, dynamic>) return null;
    final provider = switch (value['provider']?.toString().toUpperCase()) {
      'YOUTUBE' => TrailerProvider.youtube,
      'STEAM' => TrailerProvider.steam,
      _ => TrailerProvider.other,
    };
    return TrailerInfo(
      provider: provider,
      url: value['url'] is String ? value['url'] as String : null,
      videoId: value['videoId'] is String ? value['videoId'] as String : null,
    );
  }
}
