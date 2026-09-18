enum TrailerProvider { youtube, steam, direct, other }

/// Sealed type representing a resolved, playable trailer source.
///
/// Use [TrailerInfo.toPlaybackSource] to obtain an instance.
/// Only sources that can actually be played are represented here.
sealed class TrailerPlaybackSource {
  const TrailerPlaybackSource();
}

/// A YouTube video identified by its 11-character video ID.
final class YoutubeSource extends TrailerPlaybackSource {
  const YoutubeSource(this.videoId);
  final String videoId;
}

/// A directly-accessible MP4/HLS stream from an authorised source.
final class DirectSource extends TrailerPlaybackSource {
  const DirectSource(
    this.url, {
    this.mimeType,
    this.origin,
    this.providerLabel,
  });

  final String url;

  /// MIME type hint. Example: `'video/mp4'`, `'application/x-mpegURL'`.
  final String? mimeType;

  /// Origin or source specification (e.g. `'local/dev-test'`, `'publisher-press-kit'`).
  final String? origin;

  /// Display provider name (e.g. `'NextPlay Development'`).
  final String? providerLabel;
}

class TrailerInfo {
  const TrailerInfo({
    required this.provider,
    this.url,
    this.videoId,
    this.mimeType,
    this.origin,
    this.providerLabel,
    this.isOfficial = false,
  });

  final TrailerProvider provider;
  final String? url;
  final String? videoId;
  final String? mimeType;
  final String? origin;
  final String? providerLabel;
  final bool isOfficial;

  bool get isPlayableYoutube =>
      provider == TrailerProvider.youtube &&
      videoId != null &&
      RegExp(r'^[a-zA-Z0-9_-]{11}$').hasMatch(videoId!);

  /// Resolves this [TrailerInfo] into a concrete [TrailerPlaybackSource].
  ///
  /// Returns `null` when the source cannot be played (e.g. Steam/Other without
  /// explicit direct authorisation, or a malformed YouTube ID).
  TrailerPlaybackSource? toPlaybackSource() {
    switch (provider) {
      case TrailerProvider.youtube:
        if (isPlayableYoutube) return YoutubeSource(videoId!);
        return null;
      case TrailerProvider.direct:
        if (url != null && url!.isNotEmpty) {
          return DirectSource(
            url!,
            mimeType: mimeType ?? 'video/mp4',
            origin: origin,
            providerLabel: providerLabel,
          );
        }
        return null;
      // Steam URLs are NOT automatically treated as authorised direct sources.
      // They require explicit authorisation before being mapped to DirectSource.
      case TrailerProvider.steam:
      case TrailerProvider.other:
        return null;
    }
  }

  static TrailerInfo? fromJson(Object? value) {
    if (value is! Map<String, dynamic>) return null;
    final provider = switch (value['provider']?.toString().toUpperCase()) {
      'YOUTUBE' => TrailerProvider.youtube,
      'STEAM' => TrailerProvider.steam,
      'DIRECT' => TrailerProvider.direct,
      _ => TrailerProvider.other,
    };
    final isOfficial = value['isOfficial'] == true;
    return TrailerInfo(
      provider: provider,
      url: value['url'] is String ? value['url'] as String : null,
      videoId: value['videoId'] is String ? value['videoId'] as String : null,
      mimeType:
          value['mimeType'] is String ? value['mimeType'] as String : null,
      origin: value['origin'] is String ? value['origin'] as String : null,
      providerLabel: value['providerLabel'] is String
          ? value['providerLabel'] as String
          : null,
      isOfficial: isOfficial,
    );
  }
}
