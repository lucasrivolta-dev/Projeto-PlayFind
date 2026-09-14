import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart' show PlayerState;

import 'trailer_player.dart';

/// [TrailerPlayer] implementation for directly-accessible MP4/HLS sources.
///
/// Uses [VideoPlayerController] from the `video_player` package.
/// No WebView, no iframe — the OS media subsystem handles decoding.
///
/// Contrast with [YoutubeTrailerPlayer] (WebView/iframe-based fallback):
/// this player gives full control over overlays, branding, seek and state.
class DirectTrailerPlayer extends TrailerPlayer {

  DirectTrailerPlayer(String initialUrl) {
    _url = initialUrl;
    _requestedId = initialUrl;
    if (kDebugMode) {
      debugPrint('[DirectPlayer] INSTANCE CREATE player=${identityHashCode(this)}');
    }
    _initController(initialUrl);
  }

  String _url = '';
  VideoPlayerController? _controller;
  bool _closed = false;
  bool _failed = false;
  bool _viewMounted = false;
  String? _requestedId;
  String? _playingVideoId; // We use the URL as the "video ID" for Direct sources.
  int _requestRevision = 0;

  @override
  String? get playingVideoId => _playingVideoId;
  @override
  String? get requestedVideoId => _requestedId;
  @override
  bool get viewMounted => _viewMounted;
  @override
  bool get failed => _failed;
  @override
  String get stateLabel => state.name;

  @override
  PlayerState get state {
    final ctrl = _controller;
    if (ctrl == null || !ctrl.value.isInitialized) return PlayerState.unknown;
    if (ctrl.value.hasError || _failed) return PlayerState.unknown;
    if (ctrl.value.isBuffering) return PlayerState.buffering;
    if (ctrl.value.isPlaying) return PlayerState.playing;
    if (ctrl.value.position >= ctrl.value.duration && ctrl.value.duration > Duration.zero) {
      return PlayerState.ended;
    }
    return PlayerState.paused;
  }

  @override
  bool get isPlaying => state == PlayerState.playing;
  @override
  bool get isBuffering => state == PlayerState.buffering;
  @override
  bool get isPaused => !isPlaying;

  @override
  Duration get position => _controller?.value.position ?? Duration.zero;
  @override
  Duration get duration => _controller?.value.duration ?? Duration.zero;

  void _initController(String url) {
    if (_closed) return;
    final revision = ++_requestRevision;
    _failed = false;
    _playingVideoId = null;

    final playerHash = identityHashCode(this);
    final ctrl = VideoPlayerController.networkUrl(
      Uri.parse(url),
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );
    _controller = ctrl;
    final ctrlHash = identityHashCode(ctrl);

    if (kDebugMode) {
      debugPrint('[DirectPlayer] CONTROLLER CREATE player=$playerHash controller=$ctrlHash url=$url');
      debugPrint('[DirectPlayer] LOAD START player=$playerHash controller=$ctrlHash url=$url');
    }

    // Default to muted so browsers and mobile permit autoplay.
    unawaited(ctrl.setVolume(0.0).catchError((Object _) {}));

    ctrl.addListener(() => _onControllerValue(ctrl, revision));

    ctrl.initialize().then((_) {
      if (_closed || revision != _requestRevision) return;
      final dur = ctrl.value.duration;
      final size = ctrl.value.size;
      if (kDebugMode) {
        debugPrint(
          '[DirectPlayer] LOAD COMPLETE player=$playerHash controller=$ctrlHash '
          'initialized=true duration=${dur.inMilliseconds}ms '
          'size=${size.width.toInt()}x${size.height.toInt()} error=null',
        );
      }
      notifyListeners();
    }).catchError((Object err) {
      if (_closed || revision != _requestRevision) return;
      if (kDebugMode) {
        debugPrint(
          '[DirectPlayer] LOAD COMPLETE player=$playerHash controller=$ctrlHash '
          'initialized=false duration=0ms size=0x0 error=$err',
        );
      }
      _fail('INIT url=$url error=$err');
    });
  }

  void _onControllerValue(VideoPlayerController ctrl, int revision) {
    if (_closed || revision != _requestRevision) return;
    final v = ctrl.value;

    if (v.hasError) {
      _fail('PLAYER url=$_url error=${v.errorDescription}');
      return;
    }

    if (v.isPlaying) {
      if (_playingVideoId != _url) {
        _playingVideoId = _url;
        notifyListeners();
        return;
      }
    } else {
      if (_playingVideoId != null) {
        _playingVideoId = null;
        notifyListeners();
        return;
      }
    }
    notifyListeners();
  }

  void _fail(String message) {
    if (_closed || _failed) return;
    _failed = true;
    if (kDebugMode) debugPrint('[TrailerPlayback] DirectTrailerPlayer ERROR $message');
    notifyListeners();
  }

  @override
  Widget buildView({required VoidCallback onMounted}) {
    return _DirectTrailerView(
      key: ValueKey('direct-trailer-$_url'),
      controller: _controller,
      onMounted: () {
        _viewMounted = true;
        onMounted();
      },
    );
  }

  @override
  Future<void> load(String url) async {
    if (_closed) return;
    if (_url == url && _controller != null) {
      return;
    }
    final playerHash = identityHashCode(this);
    final oldCtrl = _controller;
    _controller = null;
    _requestedId = url;
    _url = url;
    _viewMounted = false;
    notifyListeners();
    if (oldCtrl != null) {
      final oldHash = identityHashCode(oldCtrl);
      if (kDebugMode) {
        debugPrint('[DirectPlayer] CONTROLLER DISPOSE player=$playerHash controller=$oldHash');
      }
      await oldCtrl.dispose();
    }
    _initController(url);
  }

  @override
  Future<void> play() async {
    if (_closed) return;
    await _controller?.play();
  }

  @override
  Future<void> pause() async {
    if (_closed) return;
    await _controller?.pause();
  }

  @override
  Future<void> seekTo(Duration position) async {
    if (_closed) return;
    final ctrl = _controller;
    if (ctrl == null || !ctrl.value.isInitialized) return;
    final targetMs = position.inMilliseconds;
    final durMs = ctrl.value.duration.inMilliseconds;
    if (kDebugMode) {
      debugPrint('[TrailerSeek] COMMIT target=${targetMs}ms duration=${durMs}ms');
    }
    await ctrl.seekTo(position);
    if (kDebugMode) {
      debugPrint('[TrailerSeek] COMPLETE actual=${ctrl.value.position.inMilliseconds}ms');
    }
  }

  @override
  Future<void> setMuted(bool muted) async {
    if (_closed) return;
    await _controller?.setVolume(muted ? 0.0 : 1.0);
  }

  @override
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    ++_requestRevision;
    final playerHash = identityHashCode(this);
    if (kDebugMode) {
      debugPrint('[DirectPlayer] INSTANCE DISPOSE player=$playerHash');
    }
    final ctrl = _controller;
    _controller = null;
    if (ctrl != null) {
      final ctrlHash = identityHashCode(ctrl);
      if (kDebugMode) {
        debugPrint('[DirectPlayer] CONTROLLER DISPOSE player=$playerHash controller=$ctrlHash');
      }
      await ctrl.dispose();
    }
    dispose();
  }
}

/// Stateful widget that mounts the [VideoPlayer] and fires [onMounted].
class _DirectTrailerView extends StatefulWidget {
  const _DirectTrailerView({
    super.key,
    required this.controller,
    required this.onMounted,
  });

  final VideoPlayerController? controller;
  final VoidCallback onMounted;

  @override
  State<_DirectTrailerView> createState() => _DirectTrailerViewState();
}

class _DirectTrailerViewState extends State<_DirectTrailerView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onMounted();
    });
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = widget.controller;
    if (ctrl == null) {
      return const SizedBox.expand();
    }

    return ValueListenableBuilder<VideoPlayerValue>(
      valueListenable: ctrl,
      builder: (context, value, _) {
        if (!value.isInitialized) {
          return const SizedBox.expand();
        }

        return Center(
          child: AspectRatio(
            aspectRatio:
                value.aspectRatio > 0 ? value.aspectRatio : 16 / 9,
            child: VideoPlayer(ctrl),
          ),
        );
      },
    );
  }
}
