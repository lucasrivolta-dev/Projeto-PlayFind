import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import 'direct_trailer_player.dart';
import 'trailer_info.dart';

/// Small adapter boundary: widget tests inject an in-memory player.
abstract class TrailerPlayer extends ChangeNotifier {
  String? get playingVideoId;
  String? get displayedVideoId => playingVideoId;
  String? get requestedVideoId;
  bool get viewMounted;
  bool get failed;
  String get stateLabel;
  PlayerState get state =>
      playingVideoId != null ? PlayerState.playing : PlayerState.paused;
  bool get isPlaying => state == PlayerState.playing;
  bool get isBuffering => state == PlayerState.buffering;
  bool get isPaused => !isPlaying;
  Duration get position => Duration.zero;
  Duration get duration => Duration.zero;
  Widget buildView({required VoidCallback onMounted});
  Future<void> load(String videoId);
  Future<void> play();
  Future<void> pause();
  Future<void> seekTo(Duration position) async {}
  Future<void> setMuted(bool muted);
  Future<void> close();
}

typedef TrailerPlayerFactory = TrailerPlayer Function(String initialVideoId);

/// Default unified factory resolving a [TrailerPlaybackSource] to its appropriate player.
TrailerPlayer createTrailerPlayer(TrailerPlaybackSource source) => switch (source) {
  YoutubeSource(:final videoId) => YoutubeTrailerPlayer(videoId),
  DirectSource(:final url) => DirectTrailerPlayer(url),
};

class YoutubeTrailerPlayer extends TrailerPlayer {
  YoutubeTrailerPlayer(String initialVideoId) {
    // Equivalent to fromVideoId(autoPlay: false), while retaining the
    // constructor's WebResourceError callback for diagnostics.
    _controller = YoutubePlayerController(
      key: initialVideoId,
      params: const YoutubePlayerParams(
        mute: true,
        showControls: false,
        showFullscreenButton: false,
        pointerEvents: PointerEvents.none,
        showVideoAnnotations: false,
        strictRelatedVideos: true,
        enableKeyboard: false,
        enableCaption: false,
        playsInline: true,
        privacyEnhancedMode: true,
      ),
      onWebResourceError: (error) {
        if (kDebugMode) {
          debugPrint('[FeedTrailer] WEB ERROR ${error.description}');
        }
        _fail('WEB ${error.description}');
      },
    );
    _controllerId = identityHashCode(_controller);
    if (kDebugMode) {
      debugPrint('[FeedTrailer] CONTROLLER CREATED hash=$_controllerId');
    }
    _subscription = _controller.listen(_onValue);
    _videoStateSubscription = _controller.videoStateStream.listen(_onVideoState);
    unawaited(
      _controller.cueVideoById(videoId: initialVideoId).catchError((
        Object error,
      ) {
        _fail('CUE controller=$_controllerId error=$error');
      }),
    );
  }

  late final YoutubePlayerController _controller;
  late final int _controllerId;
  late final StreamSubscription<YoutubePlayerValue> _subscription;
  late final StreamSubscription<YoutubeVideoState> _videoStateSubscription;
  bool _closed = false;
  bool _failed = false;
  bool _viewMounted = false;
  String? _playingVideoId;
  String? _requestedId;
  String? _displayedId;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  PlayerState _state = PlayerState.unknown;
  int _requestRevision = 0;

  @override
  String? get displayedVideoId => _displayedId;
  @override
  String? get playingVideoId => _playingVideoId;
  @override
  String? get requestedVideoId => _requestedId;
  @override
  bool get viewMounted => _viewMounted;
  @override
  bool get failed => _failed;
  @override
  String get stateLabel => _state.name;
  @override
  PlayerState get state => _state;
  @override
  bool get isPlaying => _state == PlayerState.playing;
  @override
  bool get isBuffering => _state == PlayerState.buffering;
  @override
  bool get isPaused => !isPlaying;
  @override
  Duration get position => _position;
  @override
  Duration get duration => _duration;

  void _onVideoState(YoutubeVideoState state) {
    if (_closed) return;
    if (_position.inMilliseconds != state.position.inMilliseconds) {
      _position = state.position;
      notifyListeners();
    }
  }

  void _onViewMounted() {
    if (_closed || _viewMounted) return;
    _viewMounted = true;
    if (kDebugMode) debugPrint('[FeedTrailer] YoutubePlayer mounted');
  }

  void _onValue(YoutubePlayerValue value) {
    if (_closed) return;
    if (value.hasError) {
      _fail('youtube=${value.error}');
      return;
    }

    final eventVideoId = value.metaData.videoId;
    final currentTarget = _requestedId;
    // Stale events from a previous video have a non-empty videoId that differs from _requestedId.
    final isStaleVideo =
        eventVideoId.isNotEmpty &&
        currentTarget != null &&
        eventVideoId != currentTarget;
    if (isStaleVideo) return;

    final stateChanged = _state != value.playerState;
    var changed = stateChanged;
    _state = value.playerState;
    if (kDebugMode && stateChanged) {
      debugPrint(
        '[FeedTrailer] VALUE controller=$_controllerId '
        'state=${value.playerState.name} '
        'videoId=${eventVideoId.isEmpty ? currentTarget : eventVideoId} '
        'error=${value.error}',
      );
    }

    if (currentTarget != null) {
      if (value.playerState == PlayerState.playing) {
        if (_displayedId != currentTarget) changed = true;
        _displayedId = currentTarget;
        if (_playingVideoId != currentTarget) changed = true;
        _playingVideoId = currentTarget;
      } else if (value.playerState == PlayerState.paused ||
          value.playerState == PlayerState.ended) {
        if (_playingVideoId != null) changed = true;
        _playingVideoId = null;
      }
      if (eventVideoId == currentTarget) {
        if (_displayedId != currentTarget) changed = true;
        _displayedId = currentTarget;
      }
      if (value.metaData.duration > Duration.zero &&
          _duration != value.metaData.duration) {
        _duration = value.metaData.duration;
        changed = true;
      }
    }
    if (changed) notifyListeners();
  }

  void _fail(String message) {
    if (_closed || _failed) return;
    _failed = true;
    if (kDebugMode) debugPrint('[FeedTrailer] ERROR $message');
    notifyListeners();
  }

  @override
  Widget buildView({required VoidCallback onMounted}) => _YoutubeTrailerView(
    key: ValueKey(_controllerId),
    controller: _controller,
    controllerId: _controllerId,
    onMounted: () {
      _onViewMounted();
      onMounted();
    },
  );

  @override
  Future<void> load(String videoId) async {
    if (_closed) return;
    final revision = ++_requestRevision;
    _failed = false;
    _playingVideoId = null;
    _displayedId = null;
    _position = Duration.zero;
    _duration = Duration.zero;
    _requestedId = videoId;
    notifyListeners();
    if (kDebugMode) {
      debugPrint(
        '[FeedTrailer] LOAD START controller=$_controllerId videoId=$videoId',
      );
    }
    // The bridge waits for the YoutubePlayer-mounted iframe to emit Ready.
    // A Play tap made before that remains queued in FeedTrailer.
    try {
      await _controller.loadVideoById(videoId: videoId);
      if (_closed || revision != _requestRevision) return;
      if (kDebugMode) {
        debugPrint(
          '[FeedTrailer] LOAD COMPLETE controller=$_controllerId videoId=$videoId',
        );
      }
    } catch (error) {
      if (_closed || revision != _requestRevision) return;
      _fail('LOAD controller=$_controllerId videoId=$videoId error=$error');
    }
  }

  @override
  Future<void> pause() async {
    if (_closed || _requestedId == null) return;
    if (kDebugMode) {
      debugPrint(
        '[FeedTrailer] PAUSE controller=$_controllerId videoId=$_requestedId',
      );
    }
    await _controller.pauseVideo();
  }

  @override
  Future<void> play() async {
    if (_closed || _requestedId == null) return;
    if (kDebugMode) {
      debugPrint(
        '[FeedTrailer] PLAY controller=$_controllerId videoId=$_requestedId',
      );
    }
    await _controller.playVideo();
  }

  @override
  Future<void> seekTo(Duration position) async {
    if (_closed || _requestedId == null) return;
    _position = position;
    notifyListeners();
    await _controller.seekTo(
      seconds: position.inMilliseconds / 1000.0,
      allowSeekAhead: true,
    );
  }

  @override
  Future<void> setMuted(bool muted) async {
    if (_closed) return;
    await (muted ? _controller.mute() : _controller.unMute());
  }

  @override
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    ++_requestRevision;
    await _subscription.cancel();
    await _videoStateSubscription.cancel();
    await _controller.close();
    dispose();
  }
}

/// The package widget owns iframe initialization and its Web implementation.
/// Keeping it mounted is required for Ready/postMessage events to reach the
/// controller; constructing a WebViewWidget from the controller is insufficient.
class _YoutubeTrailerView extends StatefulWidget {
  const _YoutubeTrailerView({
    super.key,
    required this.controller,
    required this.controllerId,
    required this.onMounted,
  });

  final YoutubePlayerController controller;
  final int controllerId;
  final VoidCallback onMounted;

  @override
  State<_YoutubeTrailerView> createState() => _YoutubeTrailerViewState();
}

class _YoutubeTrailerViewState extends State<_YoutubeTrailerView> {
  bool _loggedBuild = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onMounted();
    });
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      if (kDebugMode && !_loggedBuild) {
        _loggedBuild = true;
        debugPrint(
          '[FeedTrailer] PLAYER BUILD controller=${widget.controllerId} '
          'size=${constraints.maxWidth}x${constraints.maxHeight}',
        );
      }
      return YoutubePlayer(
        key: ValueKey('youtube-trailer-player-${widget.controllerId}'),
        controller: widget.controller,
        aspectRatio: 16 / 9,
        keepAlive: true,
        autoFullScreen: false,
        enableFullScreenOnVerticalDrag: false,
        backgroundColor: Colors.black,
      );
    },
  );
}
