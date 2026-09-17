import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:youtube_player_iframe/webview.dart';
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

const Duration kMaxVisualRevealDelay = Duration(milliseconds: 2000);

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
      debugPrint(
        '[FeedTrailer] YOUTUBE CONTROLLER CREATE hash=$_controllerId initialVideoId=$initialVideoId',
      );
    }
    _subscription = _controller.listen(_onValue);
    _videoStateSubscription = _controller.videoStateStream.listen(_onVideoState);
  }

  late final YoutubePlayerController _controller;
  late final int _controllerId;
  late final StreamSubscription<YoutubePlayerValue> _subscription;
  late final StreamSubscription<YoutubeVideoState> _videoStateSubscription;
  bool _closed = false;
  bool _failed = false;
  bool _viewMounted = false;
  bool _apiReady = false;
  String? _playingVideoId;
  String? _requestedId;
  String? _displayedId;
  Timer? _safetyRevealTimer;
  Timer? _visualGuardTimer;
  String? _guardTargetId;
  int _guardRevision = 0;
  Duration _guardStartPosition = Duration.zero;
  bool _guardPositionAdvanced = false;
  static const Duration kVisualGuardDuration = Duration(milliseconds: 800);
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

  Future<void> _updateDuration() async {
    if (_closed || _duration > Duration.zero) return;
    try {
      final seconds = await _controller.duration.timeout(
        const Duration(seconds: 1),
      );
      if (_closed) return;
      if (seconds > 0) {
        final dur = Duration(milliseconds: (seconds * 1000).round());
        if (_duration != dur) {
          _duration = dur;
          if (kDebugMode) {
            debugPrint(
              '[FeedTrailer] METADATA RECEIVED controller=$_controllerId '
              'duration=$_duration source=duration_polling',
            );
          }
          notifyListeners();
        }
      }
    } catch (_) {}
  }

  void _cancelVisualGuard(String reason) {
    if (_visualGuardTimer != null) {
      _visualGuardTimer?.cancel();
      _visualGuardTimer = null;
      if (kDebugMode) {
        debugPrint(
          '[TrailerVisual] CANCEL_VISUAL_GUARD reason=$reason videoId=$_guardTargetId',
        );
      }
      _guardTargetId = null;
      _guardStartPosition = Duration.zero;
      _guardPositionAdvanced = false;
    }
  }

  void _checkFirstPositionAdvance(String currentTarget, Duration currentPos) {
    if (_closed || _displayedId == currentTarget) return;
    if (_state != PlayerState.playing || currentPos <= Duration.zero) return;

    if (_visualGuardTimer == null) {
      _guardTargetId = currentTarget;
      _guardRevision = _requestRevision;
      _guardStartPosition = currentPos;
      _guardPositionAdvanced = false;

      if (kDebugMode) {
        debugPrint(
          '[TrailerVisual] FIRST_POSITION_ADVANCE position=${currentPos.inMilliseconds}ms',
        );
        debugPrint('[TrailerVisual] WAITING_VISUAL_GUARD');
      }

      _visualGuardTimer = Timer(kVisualGuardDuration, () {
        unawaited(_onVisualGuardComplete());
      });
    } else if (_guardTargetId == currentTarget &&
        _guardRevision == _requestRevision) {
      if (currentPos > _guardStartPosition) {
        _guardPositionAdvanced = true;
      }
    }
  }

  Future<void> _onVisualGuardComplete() async {
    _visualGuardTimer = null;
    if (_closed) return;
    if (_guardRevision != _requestRevision) return;
    final currentTarget = _requestedId;
    if (currentTarget == null || currentTarget != _guardTargetId) return;
    if (_state != PlayerState.playing) return;

    var positionAdvanced =
        _guardPositionAdvanced || _position > _guardStartPosition;

    if (!positionAdvanced) {
      try {
        final sec = await _controller.currentTime.timeout(
          const Duration(milliseconds: 300),
        );
        if (_closed || _guardRevision != _requestRevision) return;
        if (sec > (_guardStartPosition.inMilliseconds / 1000.0)) {
          positionAdvanced = true;
          _position = Duration(milliseconds: (sec * 1000).round());
        }
      } catch (_) {}
    }

    if (!positionAdvanced) {
      if (kDebugMode) {
        debugPrint(
          '[TrailerVisual] VISUAL_GUARD_ABORTED position_not_advancing start=${_guardStartPosition.inMilliseconds}ms current=${_position.inMilliseconds}ms',
        );
      }
      return;
    }

    _displayedId = currentTarget;
    _safetyRevealTimer?.cancel();
    _safetyRevealTimer = null;

    if (kDebugMode) {
      debugPrint(
        '[TrailerVisual] VISUAL_GUARD_COMPLETE position=${_position.inMilliseconds}ms',
      );
      debugPrint(
        '[TrailerVisual] REVEAL_VIDEO reason=visual_guard_complete',
      );
    }
    notifyListeners();
  }

  void _onVideoState(YoutubeVideoState state) {
    if (_closed) return;
    if (_duration == Duration.zero) {
      unawaited(_updateDuration());
    }
    final posChanged =
        _position.inMilliseconds != state.position.inMilliseconds;
    _position = state.position;
    final currentTarget = _requestedId;
    if (currentTarget != null && _displayedId != currentTarget) {
      if (_state == PlayerState.playing && state.position > Duration.zero) {
        _checkFirstPositionAdvance(currentTarget, state.position);
      }
    } else if (posChanged) {
      notifyListeners();
    }
  }

  void _markApiReady() {
    if (_closed || _apiReady) return;
    _apiReady = true;
    if (kDebugMode) {
      debugPrint('[FeedTrailer] API READY controller=$_controllerId');
    }
  }

  void _onViewMounted() {
    if (_closed || _viewMounted) return;
    _viewMounted = true;
    if (kDebugMode) {
      debugPrint('[FeedTrailer] IFRAME MOUNT controller=$_controllerId');
    }
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

    if (value.playerState != PlayerState.unknown) {
      _markApiReady();
    }

    final stateChanged = _state != value.playerState;
    var changed = stateChanged;
    _state = value.playerState;
    if (kDebugMode && stateChanged) {
      debugPrint(
        '[FeedTrailer] PLAYER STATE controller=$_controllerId '
        'state=${value.playerState.name} '
        'videoId=${eventVideoId.isEmpty ? currentTarget : eventVideoId} '
        'error=${value.error}',
      );
    }

    if (currentTarget != null) {
      if (value.playerState == PlayerState.playing) {
        if (_playingVideoId != currentTarget) changed = true;
        _playingVideoId = currentTarget;
        if (kDebugMode) {
          debugPrint(
            '[FeedTrailer] PLAYING controller=$_controllerId videoId=$currentTarget',
          );
          debugPrint(
            '[TrailerVisual] PLAYING position=${_position.inMilliseconds}ms',
          );
        }
        if (_displayedId != currentTarget) {
          if (_position > Duration.zero) {
            _checkFirstPositionAdvance(currentTarget, _position);
          } else {
            _safetyRevealTimer ??= Timer(kMaxVisualRevealDelay, () {
              if (!_closed &&
                  _state == PlayerState.playing &&
                  _displayedId != currentTarget) {
                if (kDebugMode) {
                  debugPrint(
                    '[TrailerVisual] SUPPRESS_TIMEOUT_REVEAL waiting for visual guard',
                  );
                }
                return;
              }
            });
          }
        }
      } else if (value.playerState == PlayerState.buffering) {
        if (kDebugMode) {
          debugPrint(
            '[FeedTrailer] BUFFERING controller=$_controllerId videoId=$currentTarget',
          );
        }
      } else if (value.playerState == PlayerState.paused ||
          value.playerState == PlayerState.ended) {
        if (_playingVideoId != null) changed = true;
        _playingVideoId = null;
        _cancelVisualGuard('player_state_${value.playerState.name}');
      }
      if (value.metaData.duration > Duration.zero &&
          _duration != value.metaData.duration) {
        _duration = value.metaData.duration;
        changed = true;
        if (kDebugMode) {
          debugPrint(
            '[FeedTrailer] METADATA RECEIVED controller=$_controllerId '
            'duration=${value.metaData.duration} title=${value.metaData.title}',
          );
        }
      } else if (_duration == Duration.zero &&
          (value.playerState == PlayerState.playing ||
              value.playerState == PlayerState.buffering)) {
        unawaited(_updateDuration());
      }
    }
    if (changed) notifyListeners();
  }

  void _fail(String message) {
    if (_closed || _failed) return;
    _failed = true;
    _cancelVisualGuard('player_fail');
    _safetyRevealTimer?.cancel();
    _safetyRevealTimer = null;
    _displayedId = null;
    if (kDebugMode) {
      debugPrint('[FeedTrailer] ERROR controller=$_controllerId $message');
      debugPrint('[TrailerVisual] SHOW_ARTWORK reason=player_fail');
    }
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
    _cancelVisualGuard('load');
    _safetyRevealTimer?.cancel();
    _safetyRevealTimer = null;
    _failed = false;
    _playingVideoId = null;
    _displayedId = null;
    _position = Duration.zero;
    _duration = Duration.zero;
    _requestedId = videoId;
    if (kDebugMode) {
      debugPrint('[TrailerVisual] SHOW_ARTWORK reason=load videoId=$videoId');
    }
    notifyListeners();
    if (kDebugMode) {
      debugPrint(
        '[FeedTrailer] LOAD REQUEST controller=$_controllerId videoId=$videoId',
      );
    }
    // The bridge waits for the YoutubePlayer-mounted iframe to emit Ready.
    // A Play tap made before that remains queued in FeedTrailer.
    try {
      await _controller.loadVideoById(videoId: videoId);
      if (_closed || revision != _requestRevision) return;
      _markApiReady();
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
    _cancelVisualGuard('pause');
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
        '[FeedTrailer] PLAY REQUEST controller=$_controllerId videoId=$_requestedId',
      );
    }
    await _controller.playVideo();
  }

  @override
  Future<void> seekTo(Duration position) async {
    if (_closed || _requestedId == null) return;
    _position = position;
    notifyListeners();
    final seconds = position.inMilliseconds / 1000.0;
    try {
      await _controller.seekTo(
        seconds: seconds,
        allowSeekAhead: true,
      );
    } catch (_) {
      try {
        await _controller.webViewController.runJavaScript(
          'player.seekTo(${seconds.toStringAsFixed(3)}, true);',
        );
      } catch (_) {}
    }
    if (kDebugMode) {
      debugPrint('[TrailerSeek] COMPLETE actual=${_position.inMilliseconds}ms');
    }
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
    _cancelVisualGuard('close');
    _safetyRevealTimer?.cancel();
    _safetyRevealTimer = null;
    _displayedId = null;
    _playingVideoId = null;
    await _subscription.cancel();
    await _videoStateSubscription.cancel();
    try {
      await _controller.close().timeout(
        const Duration(milliseconds: 300),
        onTimeout: () {},
      );
    } catch (_) {}
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
  bool _webViewReady = !kDebugMode;

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      widget.controller.webViewController.setBackgroundColor(Colors.black);
      unawaited(
        widget.controller.initWithParams(params: widget.controller.params),
      );
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        if (!_webViewReady) {
          setState(() => _webViewReady = true);
        }
        widget.onMounted();
      }
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
      if (kIsWeb) {
        return YoutubePlayer(
          key: ValueKey('youtube-trailer-player-${widget.controllerId}'),
          controller: widget.controller,
          aspectRatio: 16 / 9,
          keepAlive: true,
          autoFullScreen: false,
          enableFullScreenOnVerticalDrag: false,
          backgroundColor: Colors.black,
          thumbnailQuality: ThumbnailQuality.max,
        );
      }

      if (!_webViewReady) {
        return const SizedBox.expand();
      }

      return AspectRatio(
        aspectRatio: 16 / 9,
        child: WebViewWidget(
          controller: widget.controller.webViewController,
        ),
      );
    },
  );
}
