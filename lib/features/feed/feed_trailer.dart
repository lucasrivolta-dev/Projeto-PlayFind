import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../design_system/theme.dart';
import '../explore/explore_data.dart';
import 'direct_trailer_player.dart';
import 'trailer_info.dart';
import 'trailer_player.dart';

const youtubeTrailerStartupTimeout = Duration(seconds: 6);

String _sourceKey(TrailerPlaybackSource source) => switch (source) {
  YoutubeSource(:final videoId) => 'youtube:$videoId',
  DirectSource(:final url) => 'direct:$url',
};

String _sourceValue(TrailerPlaybackSource source) => switch (source) {
  YoutubeSource(:final videoId) => videoId,
  DirectSource(:final url) => url,
};

/// Playable sources in deterministic product order.
/// Steam/Other entries never become direct playback URLs.
List<TrailerPlaybackSource> trailerCandidatesFor(DiscoveryGame game) {
  final direct = <TrailerPlaybackSource>[];
  final youtube = <TrailerPlaybackSource>[];
  final seen = <String>{};

  void add(TrailerInfo? info, List<TrailerPlaybackSource> target) {
    final source = info?.toPlaybackSource();
    if (source == null || !seen.add(_sourceKey(source))) return;
    target.add(source);
  }

  for (final info in [game.primaryTrailer, ...game.trailerDetails]) {
    if (info?.provider == TrailerProvider.direct) add(info, direct);
  }
  if (game.primaryTrailer?.provider == TrailerProvider.youtube) {
    add(game.primaryTrailer, youtube);
  }
  for (final info in game.trailerDetails) {
    if (info.provider == TrailerProvider.youtube) add(info, youtube);
  }
  return [...direct, ...youtube];
}

/// One player for the entire feed, reused as its active game changes.
class FeedTrailer extends StatefulWidget {
  const FeedTrailer({
    super.key,
    required this.game,
    required this.active,
    required this.child,
    this.playerFactory,
    this.pageController,
    this.currentIndex = 0,
  });

  final DiscoveryGame game;
  final bool active;
  final Widget child;
  final TrailerPlayerFactory? playerFactory;
  final PageController? pageController;
  final int currentIndex;

  @override
  State<FeedTrailer> createState() => FeedTrailerState();
}

class FeedTrailerScope extends InheritedWidget {
  const FeedTrailerScope({
    super.key,
    required this.state,
    required super.child,
  });

  final FeedTrailerState state;

  static FeedTrailerState? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<FeedTrailerScope>()?.state;

  static FeedTrailerState of(BuildContext context) => maybeOf(context)!;

  @override
  bool updateShouldNotify(FeedTrailerScope oldWidget) => true;
}

class FeedTrailerState extends State<FeedTrailer> with WidgetsBindingObserver {
  TrailerPlayer? _player;
  bool _muted = true;
  bool _foreground = true;
  bool _failed = false;
  bool _manualPaused = false;
  int _revision = 0;
  int _activationRevision = 0;
  bool _showOverlay = false;
  IconData _overlayIcon = Icons.play_arrow;
  Timer? _overlayTimer;
  Timer? _youtubeStartupTimer;
  double? _dragFraction;
  int _candidateIndex = 0;
  final Set<String> _attemptedCandidates = {};
  String? _autoplayCandidateKey;
  bool _switchingCandidate = false;
  bool _playbackStarted = false;
  double _pageDragDistance = 0;
  double? _pagePointerDownY;
  int? _pageDragStartIndex;

  bool get isEffectivelyPlaying =>
      _player != null &&
      _player!.isPlaying &&
      _player!.playingVideoId == _videoId &&
      !_manualPaused &&
      !_failed;

  bool get isPlaying => isEffectivelyPlaying;
  bool get isMuted => _muted;
  bool get showOverlay => _showOverlay;
  IconData get overlayIcon => _overlayIcon;
  TrailerPlayer? get player => _player;
  double? get dragFraction => _dragFraction;
  bool get showingCurrentVideo =>
      !_failed &&
      _playbackStarted &&
      _videoId != null &&
      _player?.displayedVideoId == _videoId;
  bool get hasVideoId => _videoId != null;

  void togglePlayback() => _togglePlayback();
  void toggleMute() {
    setState(() => _muted = !_muted);
    if (kDebugMode) {
      debugPrint('[TrailerInput] MUTE TAP isMuted=$_muted');
    }
    _sync('toggleMute');
  }

  void setDragFraction(double? fraction) {
    setState(() => _dragFraction = fraction);
  }

  void preparePageDrag(DragDownDetails details) {
    _pagePointerDownY = details.globalPosition.dy;
  }

  void startPageDrag(DragStartDetails details) {
    final controller = widget.pageController;
    if (controller == null || !controller.hasClients) return;
    if (kDebugMode) {
      debugPrint('[TrailerInput] VERTICAL DRAG START');
    }
    _pageDragDistance =
        details.globalPosition.dy -
        (_pagePointerDownY ?? details.globalPosition.dy);
    _pageDragStartIndex = (controller.page ?? widget.currentIndex.toDouble())
        .round();
    if (_pageDragDistance != 0) {
      final position = controller.position;
      controller.jumpTo(
        (controller.offset - _pageDragDistance).clamp(
          position.minScrollExtent,
          position.maxScrollExtent,
        ),
      );
    }
  }

  void updatePageDrag(DragUpdateDetails details) {
    final controller = widget.pageController;
    final delta = details.primaryDelta;
    if (controller == null ||
        !controller.hasClients ||
        _pageDragStartIndex == null ||
        delta == null) {
      return;
    }
    _pageDragDistance += delta;
    final position = controller.position;
    controller.jumpTo(
      (controller.offset - delta).clamp(
        position.minScrollExtent,
        position.maxScrollExtent,
      ),
    );
  }

  void endPageDrag(DragEndDetails details) {
    final controller = widget.pageController;
    final start = _pageDragStartIndex;
    if (controller == null || !controller.hasClients || start == null) {
      cancelPageDrag();
      return;
    }
    final velocity = details.primaryVelocity ?? 0;
    final movedEnough = _pageDragDistance.abs() >= 40;
    final flung = velocity.abs() >= 300;
    final direction = movedEnough || flung
        ? (_pageDragDistance != 0
              ? (_pageDragDistance < 0 ? 1 : -1)
              : (velocity < 0 ? 1 : -1))
        : 0;
    final lastPage =
        (controller.position.maxScrollExtent /
                controller.position.viewportDimension)
            .round();
    final target = (start + direction).clamp(0, lastPage).toInt();
    if (kDebugMode) {
      debugPrint(
        '[TrailerInput] VERTICAL DRAG END distance=$_pageDragDistance '
        'velocity=$velocity target=$target',
      );
    }
    _pageDragDistance = 0;
    _pagePointerDownY = null;
    _pageDragStartIndex = null;
    unawaited(
      controller.animateToPage(
        target,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeInOut,
      ),
    );
  }

  void cancelPageDrag() {
    final controller = widget.pageController;
    final start = _pageDragStartIndex;
    _pageDragDistance = 0;
    _pagePointerDownY = null;
    _pageDragStartIndex = null;
    if (controller != null && controller.hasClients && start != null) {
      unawaited(
        controller.animateToPage(
          start,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        ),
      );
    }
  }

  String formatDuration(Duration d) => _formatDuration(d);

  List<TrailerPlaybackSource> get _candidates =>
      trailerCandidatesFor(widget.game);

  TrailerPlaybackSource? get _source {
    final candidates = _candidates;
    return _candidateIndex < candidates.length
        ? candidates[_candidateIndex]
        : null;
  }

  String? get _videoId => switch (_source) {
    YoutubeSource(:final videoId) => videoId,
    DirectSource(:final url) => url,
    null => null,
  };

  String? get _candidateKey => _source == null ? null : _sourceKey(_source!);

  bool get _shouldPlay =>
      widget.active && _foreground && _source != null && !_manualPaused;

  bool _isPlayerCompatible(TrailerPlayer player, TrailerPlaybackSource source) {
    if (widget.playerFactory != null) {
      return true;
    }
    if (source is YoutubeSource && player is! YoutubeTrailerPlayer) {
      return false;
    }
    if (source is DirectSource && player is! DirectTrailerPlayer) return false;
    return true;
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString();
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  void _triggerFeedback(bool isNowPlaying) {
    _overlayTimer?.cancel();
    setState(() {
      _showOverlay = true;
      _overlayIcon = isNowPlaying ? Icons.play_arrow : Icons.pause;
    });
    _overlayTimer = Timer(const Duration(milliseconds: 650), () {
      if (mounted) setState(() => _showOverlay = false);
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _foreground =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    if (widget.active) {
      _activationRevision++;
    }
    _sync('initState');
  }

  @override
  void didUpdateWidget(FeedTrailer oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldKeys = trailerCandidatesFor(
      oldWidget.game,
    ).map(_sourceKey).toList();
    final newKeys = _candidates.map(_sourceKey).toList();
    final sourceChanged = !listEquals(oldKeys, newKeys);
    final activeChanged = oldWidget.active != widget.active;
    if (sourceChanged) {
      _activationRevision++;
      _resetCandidateSession();
    } else if (activeChanged) {
      if (widget.active) {
        _activationRevision++;
        _resetCandidateSession();
      } else {
        _cancelStartupTimeout();
      }
    }
    if (sourceChanged || activeChanged) {
      final trigger = activeChanged
          ? (widget.active ? 'pageActivation' : 'pageDeactivation')
          : (sourceChanged ? 'sourceChanged' : 'didUpdateWidget');
      _sync(trigger);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final wasForeground = _foreground;
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground != wasForeground) {
      if (_foreground && !_manualPaused) {
        _activationRevision++;
        _resetCandidateSession();
      } else {
        _cancelStartupTimeout();
      }
      _sync('lifecycle');
    }
  }

  void _resetCandidateSession() {
    _cancelStartupTimeout();
    _candidateIndex = 0;
    _attemptedCandidates.clear();
    _autoplayCandidateKey = null;
    _failed = false;
    _manualPaused = false;
    _playbackStarted = false;
    if (kDebugMode) {
      debugPrint('[TrailerVisual] SHOW_ARTWORK reason=reset_candidate_session');
    }
  }

  void _cancelStartupTimeout() {
    _youtubeStartupTimer?.cancel();
    _youtubeStartupTimer = null;
  }

  void _logSource(String event, TrailerPlaybackSource source) {
    if (!kDebugMode) return;
    final provider = source is DirectSource ? 'DIRECT' : 'YOUTUBE';
    debugPrint(
      '[TrailerSource] gameId=${widget.game.id} provider=$provider '
      'candidate=${_sourceValue(source)} attempt=${_candidateIndex + 1}',
    );
    debugPrint('[TrailerPlayback] $event candidate=${_sourceValue(source)}');
  }

  void _beginAttempt(TrailerPlaybackSource source) {
    final key = _sourceKey(source);
    if (!_attemptedCandidates.add(key)) return;
    _playbackStarted = false;
    _logSource('LOAD', source);
    _startStartupTimeout(source);
  }

  void _startStartupTimeout(TrailerPlaybackSource source) {
    if (source is! YoutubeSource) return;
    _cancelStartupTimeout();
    final key = _sourceKey(source);
    final activation = _activationRevision;
    _youtubeStartupTimer = Timer(youtubeTrailerStartupTimeout, () {
      if (!mounted ||
          activation != _activationRevision ||
          _candidateKey != key ||
          _playbackStarted) {
        return;
      }
      if (kDebugMode) {
        debugPrint('[FeedTrailer] TIMEOUT candidate=${_sourceValue(source)}');
      }
      _logSource('TIMEOUT', source);
      unawaited(_advanceCandidate('timeout'));
    });
  }

  void _onPlayerChanged() {
    if (!mounted) return;
    final player = _player;
    if (player == null) return;
    if (player.failed) {
      final source = _source;
      if (source != null) _logSource('ERROR', source);
      unawaited(_advanceCandidate('playerError'));
      return;
    }
    if (player.isPlaying && player.playingVideoId == _videoId) {
      if (!_playbackStarted) {
        _playbackStarted = true;
        _cancelStartupTimeout();
        final source = _source;
        if (source != null) {
          _logSource('READY', source);
          _logSource('PLAY', source);
        }
      }
    } else if (player.isBuffering && !_playbackStarted) {
      final source = _source;
      if (source != null) _logSource('BUFFERING', source);
    }
    setState(() {});
  }

  void _onPlayerViewMounted() {
    if (!mounted) return;
    _sync('viewMounted');
  }

  Future<void> _advanceCandidate(String reason) async {
    if (_switchingCandidate) return;
    final failedSource = _source;
    if (failedSource == null) return;
    _switchingCandidate = true;
    _cancelStartupTimeout();
    _logSource('FALLBACK reason=$reason', failedSource);
    if (kDebugMode) {
      debugPrint('[TrailerVisual] SHOW_ARTWORK reason=advance_candidate_$reason');
    }
    await Future<void>.value();
    if (!mounted) {
      _switchingCandidate = false;
      return;
    }
    final activation = _activationRevision;
    final old = _player;
    old?.removeListener(_onPlayerChanged);
    _player = null;
    if (old != null) {
      await old.close().timeout(
        const Duration(milliseconds: 300),
        onTimeout: () {},
      ).catchError((Object _) {});
    }
    if (!mounted) {
      _switchingCandidate = false;
      return;
    }
    if (activation != _activationRevision) {
      _switchingCandidate = false;
      setState(() => _sync('activationChangedDuringFallback'));
      return;
    }
    _candidateIndex++;
    _failed = false;
    _playbackStarted = false;
    _autoplayCandidateKey = null;
    _switchingCandidate = false;
    if (_source == null) {
      if (kDebugMode) {
        debugPrint('[TrailerPlayback] EXHAUSTED gameId=${widget.game.id}');
      }
      setState(() {});
      return;
    }
    setState(() => _sync('fallback'));
  }

  Future<void> _recyclePlayerForSourceChange() async {
    if (_switchingCandidate) return;
    _switchingCandidate = true;
    _cancelStartupTimeout();
    if (kDebugMode) {
      debugPrint('[TrailerVisual] SHOW_ARTWORK reason=recycle_player');
    }
    await Future<void>.value();
    if (!mounted) {
      _switchingCandidate = false;
      return;
    }
    final old = _player;
    old?.removeListener(_onPlayerChanged);
    _player = null;
    if (old != null) {
      await old.close().timeout(
        const Duration(milliseconds: 300),
        onTimeout: () {},
      ).catchError((Object _) {});
    }
    if (!mounted) return;
    _switchingCandidate = false;
    _autoplayCandidateKey = null;
    _playbackStarted = false;
    setState(() => _sync('providerChanged'));
  }

  void _sync(String trigger) {
    final revision = ++_revision;
    final id = _videoId;
    final source = _source;
    final playerHash = _player != null ? identityHashCode(_player) : 0;

    if (kDebugMode) {
      debugPrint(
        '[FeedTrailerSync] trigger=$trigger active=${widget.active} '
        'foreground=$_foreground manualPaused=$_manualPaused '
        'shouldPlay=$_shouldPlay source=${id ?? "none"} player=$playerHash '
        'requested=${_player?.requestedVideoId ?? "none"} state=${_player?.stateLabel ?? "none"}',
      );
    }

    // If active player is incompatible with current source, recycle it.
    if (_player != null &&
        source != null &&
        !_isPlayerCompatible(_player!, source)) {
      unawaited(_recyclePlayerForSourceChange());
      return;
    }

    if (_player == null &&
        _shouldPlay &&
        !_failed &&
        source != null &&
        !_switchingCandidate) {
      try {
        if (widget.playerFactory != null) {
          _player = widget.playerFactory!(id!)..addListener(_onPlayerChanged);
        } else {
          _player = createTrailerPlayer(source)..addListener(_onPlayerChanged);
        }
      } catch (error) {
        _logSource('ERROR create=$error', source);
        unawaited(_advanceCandidate('createError'));
      }
    }
    final player = _player;
    if (player == null) return;
    if (!player.viewMounted) return;

    if (!_shouldPlay || _failed) {
      if (player.isPlaying || player.isBuffering) {
        final pauseSource = _manualPaused ? 'userTap' : 'pageDeactivation';
        if (kDebugMode) {
          debugPrint(
            '[TrailerPlayback] PAUSE source=$pauseSource player=${identityHashCode(player)}',
          );
        }
        _dispatch(player.pause(), player: player, revision: revision);
      }
      return;
    }

    _beginAttempt(source!);

    if (player.requestedVideoId != id) {
      _dispatch(player.pause(), player: player, revision: revision);
      _dispatch(player.load(id!), player: player, revision: revision);
      _dispatch(player.setMuted(_muted), player: player, revision: revision);
      return;
    }

    _dispatch(player.setMuted(_muted), player: player, revision: revision);

    // AUTOPLAY: must be issued ONLY ONCE per activation!
    if (_autoplayCandidateKey != _candidateKey) {
      _autoplayCandidateKey = _candidateKey;
      if (kDebugMode) {
        debugPrint(
          '[TrailerPlayback] PLAY source=pageActivation player=${identityHashCode(player)}',
        );
      }
      _startStartupTimeout(source);
      _dispatch(player.play(), player: player, revision: revision);
    }
  }

  void _dispatch(
    Future<void> operation, {
    required TrailerPlayer player,
    required int revision,
  }) {
    unawaited(
      operation.catchError((Object _) {
        if (!mounted || revision != _revision || !identical(player, _player)) {
          return;
        }
        final source = _source;
        if (source != null) _logSource('ERROR operation', source);
        unawaited(_advanceCandidate('operationError'));
      }),
    );
  }

  void _togglePlayback() {
    if (_failed) {
      final old = _player;
      old?.removeListener(_onPlayerChanged);
      _player = null;
      if (old != null) unawaited(old.close().catchError((Object _) {}));
      _failed = false;
      _manualPaused = false;
      setState(() => _sync('retry'));
      return;
    }
    final player = _player;
    if (player == null || player.requestedVideoId != _videoId) {
      _manualPaused = false;
      _triggerFeedback(true);
      setState(() => _sync('togglePlayback'));
      return;
    }
    final bool isActuallyPlaying =
        player.isPlaying && player.playingVideoId == _videoId;
    final bool willPause =
        !_manualPaused && (isActuallyPlaying || player.isBuffering);

    if (willPause) {
      _manualPaused = true;
      _triggerFeedback(false);
      if (kDebugMode) {
        debugPrint(
          '[TrailerPlayback] PAUSE source=userTap player=${identityHashCode(player)}',
        );
        debugPrint(
          '[TrailerInput] TAP -> PAUSE videoId=$_videoId state=${player.stateLabel}',
        );
      }
      _dispatch(player.pause(), player: player, revision: _revision);
    } else {
      _manualPaused = false;
      _triggerFeedback(true);
      if (kDebugMode) {
        debugPrint(
          '[TrailerPlayback] PLAY source=userTap player=${identityHashCode(player)}',
        );
        debugPrint(
          '[TrailerInput] TAP -> PLAY videoId=$_videoId state=${player.stateLabel}',
        );
      }
      final currentSource = _source;
      if (currentSource != null && !_playbackStarted) {
        _startStartupTimeout(currentSource);
      }
      _dispatch(player.play(), player: player, revision: _revision);
    }
    setState(() {});
  }

  @override
  void dispose() {
    ++_revision;
    _overlayTimer?.cancel();
    _cancelStartupTimeout();
    cancelPageDrag();
    WidgetsBinding.instance.removeObserver(this);
    final player = _player;
    player?.removeListener(_onPlayerChanged);
    if (player != null) unawaited(player.close().catchError((Object _) {}));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableH = constraints.maxHeight;
        final availableW = constraints.maxWidth - (AppSpacing.margin * 2);
        final metrics = FeedTrailerMetrics(
          availableH: availableH,
          availableW: availableW,
        );
        final trailerH = metrics.trailerH;
        final trailerW = metrics.trailerW;
        final headerH = metrics.headerH;

        final trailerBox = SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.margin,
              vertical: AppSpacing.xs,
            ),
            child: Column(
              children: [
                SizedBox(height: headerH),
                Center(
                  child: SizedBox(
                    width: trailerW,
                    height: trailerH,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.large),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (_player != null && !_failed)
                            if (kIsWeb)
                              IgnorePointer(
                                child: _player!.buildView(
                                  onMounted: _onPlayerViewMounted,
                                ),
                              )
                            else
                              AnimatedOpacity(
                                key: const Key('feed_trailer_player_visibility'),
                                opacity: showingCurrentVideo ? 1 : 0,
                                duration: const Duration(milliseconds: 180),
                                child: IgnorePointer(
                                  child: _player!.buildView(
                                    onMounted: _onPlayerViewMounted,
                                  ),
                                ),
                              ),
                          if (kIsWeb)
                            AnimatedOpacity(
                              key: const Key('feed_trailer_player_visibility'),
                              opacity: showingCurrentVideo ? 1 : 0,
                              duration: const Duration(milliseconds: 180),
                              child: const SizedBox.expand(),
                            ),
                          AnimatedOpacity(
                            opacity: showingCurrentVideo ? 0 : 1,
                            duration: const Duration(milliseconds: 180),
                            child: FeedArtwork(game: widget.game),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );

        final controlsBox = SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.margin,
              vertical: AppSpacing.xs,
            ),
            child: Column(
              children: [
                SizedBox(height: headerH),
                Center(
                  child: SizedBox(
                    width: trailerW,
                    height: trailerH,
                    child: FeedTrailerControls(
                      state: this,
                      width: trailerW,
                      height: trailerH,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );

        if (widget.pageController == null) {
          return Stack(
            fit: StackFit.expand,
            children: [
              trailerBox,
              FeedTrailerScope(state: this, child: widget.child),
              if (_videoId != null) controlsBox,
            ],
          );
        }

        return AnimatedBuilder(
          animation: widget.pageController!,
          builder: (context, _) {
            double dy = 0.0;
            if (widget.pageController!.hasClients &&
                widget.pageController!.position.hasContentDimensions) {
              final page =
                  widget.pageController!.page ?? widget.currentIndex.toDouble();
              dy = -(page - widget.currentIndex) * constraints.maxHeight;
            }
            final offset = Offset(0, dy);
            return Stack(
              fit: StackFit.expand,
              children: [
                Transform.translate(
                  key: const Key('feed_trailer_video_transform'),
                  offset: offset,
                  child: trailerBox,
                ),
                FeedTrailerScope(state: this, child: widget.child),
                if (_videoId != null)
                  Transform.translate(
                    key: const Key('feed_trailer_controls_transform'),
                    offset: offset,
                    child: controlsBox,
                  ),
              ],
            );
          },
        );
      },
    );
  }
}

class FeedTrailerControls extends StatelessWidget {
  const FeedTrailerControls({
    super.key,
    required this.state,
    required this.width,
    required this.height,
  });

  final FeedTrailerState state;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: state.player ?? ChangeNotifier(),
      builder: (context, _) {
        final player = state.player;
        final isPlaying = state.isPlaying;
        final isMuted = state.isMuted;
        final showOverlay = state.showOverlay;
        final overlayIcon = state.overlayIcon;
        final playerDur = player?.duration ?? Duration.zero;
        final playerPos = player?.position ?? Duration.zero;
        final hasDuration = playerDur > Duration.zero;
        final isBuffering = player?.isBuffering == true;
        final currentFraction = state.dragFraction ??
            (hasDuration
                ? (playerPos.inMilliseconds / playerDur.inMilliseconds)
                    .clamp(0.0, 1.0)
                : 0.0);
        final displayPos = state.dragFraction != null && hasDuration
            ? Duration(
                milliseconds:
                    (state.dragFraction! * playerDur.inMilliseconds).toInt())
            : playerPos;

        return ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.large),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // 1. Toque em toda a área do trailer para Play/Pause
              _TrailerTapTarget(
                onTap: state.togglePlayback,
                onVerticalDragDown: state.preparePageDrag,
                onVerticalDragStart: state.startPageDrag,
                onVerticalDragUpdate: state.updatePageDrag,
                onVerticalDragEnd: state.endPageDrag,
                onVerticalDragCancel: state.cancelPageDrag,
              ),

              // 2. Feedback central animado (Overlay estilo YouTube/TikTok)
              IgnorePointer(
                child: Center(
                  child: AnimatedOpacity(
                    key: const Key('feed_trailer_feedback_overlay'),
                    opacity: showOverlay ? 1.0 : 0.0,
                    duration: const Duration(milliseconds: 200),
                    child: Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.black.withValues(alpha: 0.65),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Icon(
                        overlayIcon,
                        size: 40,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),

              // 2b. Indicador central de Play visível quando pausado (estilo NextPlay)
              if (!isPlaying && !showOverlay && !isBuffering)
                IgnorePointer(
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.black.withValues(alpha: 0.6),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.25),
                        ),
                      ),
                      child: const Icon(
                        Icons.play_arrow_rounded,
                        size: 38,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),

              // 2c. Spinner central discreto durante buffering
              if (isBuffering && !showOverlay)
                IgnorePointer(
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.black.withValues(alpha: 0.6),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.25),
                        ),
                      ),
                      child: const SizedBox(
                        width: 28,
                        height: 28,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Color(0xFF00E5FF),
                        ),
                      ),
                    ),
                  ),
                ),

              // 3. Badge Top-Left: TRAILER
              Positioned(
                top: AppSpacing.xs,
                left: AppSpacing.xs,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.65),
                    borderRadius: BorderRadius.circular(AppRadius.small),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.15),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: Color(0xFFFF2A55),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'TRAILER',
                        style: AppTypography.label(10).copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // 4. Badge Top-Right: AUDIO ON / AUDIO OFF
              Positioned(
                top: AppSpacing.xs,
                right: AppSpacing.xs,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: state.toggleMute,
                  child: Tooltip(
                    message: isMuted ? 'Ativar som' : 'Silenciar trailer',
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.65),
                        borderRadius: BorderRadius.circular(AppRadius.small),
                        border: Border.all(
                          color: isMuted
                              ? Colors.white.withValues(alpha: 0.15)
                              : const Color(0xFF00E5FF).withValues(alpha: 0.4),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            isMuted ? Icons.volume_off : Icons.volume_up,
                            size: 14,
                            color: isMuted
                                ? Colors.white70
                                : const Color(0xFF00E5FF),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            isMuted ? 'AUDIO OFF' : 'AUDIO ON',
                            style: AppTypography.label(10).copyWith(
                              color: isMuted
                                  ? Colors.white70
                                  : const Color(0xFF00E5FF),
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              // 5. Base: Barra de Progresso / Seek / Scrubber (Sempre visível acima do cover)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: LayoutBuilder(
                  builder: (context, barConstraints) {
                    final barWidth = barConstraints.maxWidth;

                    void handleSeek(double localX) {
                      if (barWidth <= 0) {
                        if (kDebugMode) {
                          debugPrint(
                            '[TrailerSeek] SKIP reason=invalid_bar_width',
                          );
                        }
                        return;
                      }
                      if (!hasDuration) {
                        if (kDebugMode) {
                          debugPrint('[TrailerSeek] SKIP reason=zero_duration');
                        }
                        return;
                      }
                      final fraction = (localX / barWidth).clamp(0.0, 1.0);
                      final targetMs =
                          (fraction * playerDur.inMilliseconds).toInt();
                      if (kDebugMode) {
                        debugPrint(
                          '[TrailerSeek] COMMIT target=${targetMs}ms fraction=$fraction',
                        );
                      }
                      player?.seekTo(Duration(milliseconds: targetMs));
                    }

                    return GestureDetector(
                      key: const Key('feed_trailer_seekbar'),
                      behavior: HitTestBehavior.opaque,
                      onTapDown: (details) {
                        if (kDebugMode) {
                          debugPrint(
                            '[TrailerSeek] START position=${playerPos.inMilliseconds}ms duration=${playerDur.inMilliseconds}ms',
                          );
                          debugPrint(
                            '[TrailerInput] SEEKBAR TAP at ${details.localPosition}',
                          );
                        }
                        handleSeek(details.localPosition.dx);
                      },
                      onHorizontalDragStart: (details) {
                        if (kDebugMode) {
                          debugPrint(
                            '[TrailerSeek] START position=${playerPos.inMilliseconds}ms duration=${playerDur.inMilliseconds}ms',
                          );
                          debugPrint('[TrailerInput] SEEKBAR DRAG START');
                        }
                        if (barWidth <= 0) {
                          if (kDebugMode) {
                            debugPrint(
                              '[TrailerSeek] SKIP reason=invalid_bar_width',
                            );
                          }
                          return;
                        }
                        final fraction =
                            (details.localPosition.dx / barWidth).clamp(0.0, 1.0);
                        state.setDragFraction(fraction);
                      },
                      onHorizontalDragUpdate: (details) {
                        if (barWidth <= 0) return;
                        final fraction =
                            (details.localPosition.dx / barWidth).clamp(0.0, 1.0);
                        if (kDebugMode) {
                          debugPrint('[TrailerSeek] PREVIEW fraction=$fraction');
                          debugPrint('[TrailerSeek] DRAG UPDATE fraction=$fraction');
                        }
                        state.setDragFraction(fraction);
                      },
                      onHorizontalDragEnd: (details) {
                        final fraction = state.dragFraction;
                        state.setDragFraction(null);
                        if (kDebugMode) {
                          debugPrint('[TrailerSeek] DRAG END fraction=$fraction');
                        }
                        if (fraction == null) {
                          if (kDebugMode) {
                            debugPrint(
                              '[TrailerSeek] SKIP reason=null_drag_fraction',
                            );
                          }
                          return;
                        }
                        if (!hasDuration) {
                          if (kDebugMode) {
                            debugPrint('[TrailerSeek] SKIP reason=zero_duration');
                          }
                          return;
                        }
                        final targetMs =
                            (fraction * playerDur.inMilliseconds).toInt();
                        if (kDebugMode) {
                          debugPrint(
                            '[TrailerSeek] COMMIT target=${targetMs}ms fraction=$fraction',
                          );
                        }
                        player?.seekTo(Duration(milliseconds: targetMs));
                      },
                      onHorizontalDragCancel: () {
                        if (kDebugMode) {
                          debugPrint('[TrailerSeek] DRAG CANCEL');
                        }
                        state.setDragFraction(null);
                      },
                      child: Container(
                        height: 30,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        alignment: Alignment.bottomCenter,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(bottom: 2),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    state.formatDuration(displayPos),
                                    style: AppTypography.label(9).copyWith(
                                      color: Colors.white70,
                                      shadows: const [
                                        Shadow(
                                          blurRadius: 2,
                                          color: Colors.black,
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    hasDuration
                                        ? state.formatDuration(playerDur)
                                        : '--:--',
                                    style: AppTypography.label(9).copyWith(
                                      color: Colors.white70,
                                      shadows: const [
                                        Shadow(
                                          blurRadius: 2,
                                          color: Colors.black,
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Stack(
                              alignment: Alignment.centerLeft,
                              children: [
                                Container(
                                  height: 4,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.25),
                                    borderRadius: BorderRadius.circular(2),
                                  ),
                                ),
                                FractionallySizedBox(
                                  widthFactor: currentFraction,
                                  child: Container(
                                    height: 4,
                                    decoration: BoxDecoration(
                                      gradient: const LinearGradient(
                                        colors: [
                                          Color(0xFF00E5FF),
                                          Color(0xFF8A2BE2),
                                        ],
                                      ),
                                      borderRadius: BorderRadius.circular(2),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFF00E5FF)
                                              .withValues(alpha: 0.5),
                                          blurRadius: 4,
                                          spreadRadius: 1,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _TrailerTapTarget extends StatelessWidget {
  const _TrailerTapTarget({
    required this.onTap,
    required this.onVerticalDragDown,
    required this.onVerticalDragStart,
    required this.onVerticalDragUpdate,
    required this.onVerticalDragEnd,
    required this.onVerticalDragCancel,
  });

  final VoidCallback onTap;
  final GestureDragDownCallback onVerticalDragDown;
  final GestureDragStartCallback onVerticalDragStart;
  final GestureDragUpdateCallback onVerticalDragUpdate;
  final GestureDragEndCallback onVerticalDragEnd;
  final GestureDragCancelCallback onVerticalDragCancel;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('feed_trailer_tap_target'),
      behavior: HitTestBehavior.opaque,
      supportedDevices: const {
        PointerDeviceKind.touch,
        PointerDeviceKind.stylus,
        PointerDeviceKind.invertedStylus,
        PointerDeviceKind.mouse,
      },
      onTapDown: (details) {
        if (kDebugMode) {
          debugPrint(
            '[TrailerInput] POINTER DOWN on trailer at ${details.localPosition}',
          );
        }
      },
      onTap: () {
        if (kDebugMode) {
          debugPrint('[TrailerInput] TAP confirmed -> calling togglePlayback');
        }
        onTap();
      },
      onVerticalDragDown: onVerticalDragDown,
      onVerticalDragStart: onVerticalDragStart,
      onVerticalDragUpdate: onVerticalDragUpdate,
      onVerticalDragEnd: onVerticalDragEnd,
      onVerticalDragCancel: onVerticalDragCancel,
      child: const SizedBox.expand(),
    );
  }
}

/// Computes consistent layout metrics for trailer and adjacent elements
/// across responsive viewport heights (including tall 20:9 screens).
class FeedTrailerMetrics {
  FeedTrailerMetrics({
    required this.availableH,
    required this.availableW,
  }) {
    gapSm = ((availableH - 520) * 0.012).clamp(4.0, 7.0);
    gapMd = ((availableH - 520) * 0.025).clamp(6.0, 12.0);
    gapLg = ((availableH - 520) * 0.045).clamp(8.0, 16.0);
    topGap = ((availableH - 620) * 0.08).clamp(0.0, 24.0);

    final maxTrailerH = (availableH * 0.32).clamp(120.0, 260.0);
    final idealTrailerH = availableW * (9 / 16);
    trailerH = idealTrailerH > maxTrailerH ? maxTrailerH : idealTrailerH;
    trailerW = trailerH * (16 / 9);

    // Exact top offset to the trailer:
    // topGap + TopBar (28) + gapSm + ContextPill (24) + gapSm + Indicator (18) + gapMd
    headerH = topGap + 28.0 + gapSm + 24.0 + gapSm + 18.0 + gapMd;
  }

  final double availableH;
  final double availableW;
  late final double gapSm;
  late final double gapMd;
  late final double gapLg;
  late final double topGap;
  late final double trailerH;
  late final double trailerW;
  late final double headerH;
}

/// Uses only image URLs delivered by the API, including for IGDB-only games.
class FeedArtwork extends StatelessWidget {
  const FeedArtwork({super.key, required this.game});
  final DiscoveryGame game;

  @override
  Widget build(BuildContext context) {
    final urls = [game.heroUrl, game.coverUrl]
        .whereType<String>()
        .where((url) {
          final uri = Uri.tryParse(url);
          return uri != null &&
              uri.host.isNotEmpty &&
              (uri.scheme == 'https' || uri.scheme == 'http');
        })
        .toSet()
        .toList();
    final placeholder = ColoredBox(
      color: AppColors.high,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(0, -.3),
            radius: 1,
            colors: [
              AppColors.primary.withValues(alpha: .12),
              AppColors.canvas,
            ],
          ),
        ),
        child: Align(
          alignment: const Alignment(0, -.3),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xs),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(AppRadius.large),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Icon(
                      Icons.sports_esports_outlined,
                      size: 44,
                      color: AppColors.muted,
                      semanticLabel: game.title,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'Prévia indisponível',
                    textAlign: TextAlign.center,
                    style: AppTypography.label(
                      11,
                    ).copyWith(color: AppColors.secondary),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    Widget at(int index) => index >= urls.length
        ? placeholder
        : Image.network(
            urls[index],
            fit: BoxFit.cover,
            semanticLabel: 'Capa de ${game.title}',
            errorBuilder: (_, __, ___) => at(index + 1),
            loadingBuilder: (_, child, progress) =>
                progress == null ? child : placeholder,
          );
    return at(0);
  }
}
