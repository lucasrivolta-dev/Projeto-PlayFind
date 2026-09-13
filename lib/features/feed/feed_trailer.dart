import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../design_system/theme.dart';
import '../explore/explore_data.dart';
import 'trailer_player.dart';

/// One player for the entire feed, reused as its active game changes.
class FeedTrailer extends StatefulWidget {
  const FeedTrailer({
    super.key,
    required this.game,
    required this.active,
    required this.child,
    this.playerFactory = YoutubeTrailerPlayer.new,
  });

  final DiscoveryGame game;
  final bool active;
  final Widget child;
  final TrailerPlayerFactory playerFactory;

  @override
  State<FeedTrailer> createState() => _FeedTrailerState();
}

class _FeedTrailerState extends State<FeedTrailer> with WidgetsBindingObserver {
  TrailerPlayer? _player;
  bool _muted = true;
  bool _foreground = true;
  bool _failed = false;
  bool _manualPaused = false;
  int _revision = 0;

  String? get _videoId => widget.game.primaryTrailer?.isPlayableYoutube == true
      ? widget.game.primaryTrailer!.videoId
      : null;
  bool get _shouldPlay =>
      widget.active && _foreground && _videoId != null && !_manualPaused;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _foreground =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    _sync();
  }

  @override
  void didUpdateWidget(FeedTrailer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.game.primaryTrailer?.videoId != _videoId) {
      _failed = false;
      _manualPaused = false;
    }
    if (oldWidget.game.primaryTrailer?.videoId != _videoId ||
        oldWidget.game.primaryTrailer?.provider !=
            widget.game.primaryTrailer?.provider ||
        oldWidget.active != widget.active) {
      _sync();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _sync();
  }

  void _onPlayerChanged() {
    if (!mounted) return;
    final wasFailed = _failed;
    setState(() => _failed = _player?.failed ?? false);
    if (_failed && !wasFailed) _sync();
  }

  void _onPlayerViewMounted() {
    if (!mounted) return;
    _sync();
  }

  void _sync() {
    final revision = ++_revision;
    final id = _videoId;
    if (_player == null && _shouldPlay && !_failed) {
      try {
        _player = widget.playerFactory(id!)..addListener(_onPlayerChanged);
      } catch (_) {
        _failed = true;
      }
    }
    final player = _player;
    if (player == null) return;
    // Mount is the only prerequisite owned by FeedTrailer. YoutubePlayer's
    // controller bridge handles its own Ready lifecycle after this point.
    if (!player.viewMounted) return;
    // Dispatch commands immediately. The package may keep a Future pending
    // until its JS bridge is ready; that must never prevent a newer card from
    // becoming the desired target.
    if (!_shouldPlay || _failed) {
      _dispatch(player.pause(), player: player, revision: revision);
      return;
    }
    if (player.requestedVideoId != id) {
      _dispatch(player.pause(), player: player, revision: revision);
      _dispatch(player.load(id!), player: player, revision: revision);
      _dispatch(player.setMuted(_muted), player: player, revision: revision);
      return;
    }
    _dispatch(player.setMuted(_muted), player: player, revision: revision);
    _dispatch(player.play(), player: player, revision: revision);
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
        setState(() => _failed = true);
      }),
    );
  }

  void _togglePlayback() {
    if (_failed) {
      final old = _player;
      old?.removeListener(_onPlayerChanged);
      _player = null;
      // Retrying creates a fresh iframe without waiting for the failed bridge.
      if (old != null) unawaited(old.close().catchError((Object _) {}));
      _failed = false;
    }
    final player = _player;
    final isPlaying = player?.playingVideoId == _videoId && _videoId != null;
    _manualPaused = isPlaying;
    if (kDebugMode) {
      final method = isPlaying
          ? 'pauseVideo'
          : player?.requestedVideoId == _videoId
          ? 'playVideo'
          : 'loadVideoById';
      debugPrint(
        '[FeedTrailer] TAP ${isPlaying ? 'PAUSE' : 'PLAY'} '
        'videoId=$_videoId controller=${player != null} '
        'mounted=${player?.viewMounted ?? false} '
        'requested=${player?.requestedVideoId} displayed=${player?.displayedVideoId} '
        'state=${player?.stateLabel ?? 'not-created'} method=$method',
      );
    }
    setState(_sync);
  }

  @override
  void dispose() {
    ++_revision;
    WidgetsBinding.instance.removeObserver(this);
    final player = _player;
    player?.removeListener(_onPlayerChanged);
    if (player != null) unawaited(player.close().catchError((Object _) {}));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final showingCurrentVideo =
        !_failed && _videoId != null && _player?.displayedVideoId == _videoId;
    return Stack(
      fit: StackFit.expand,
      children: [
        FeedArtwork(game: widget.game),
        if (_player != null)
          IgnorePointer(
            child: Center(
              child: _player!.buildView(onMounted: _onPlayerViewMounted),
            ),
          ),
        if (_player != null)
          IgnorePointer(
            child: AnimatedOpacity(
              key: const ValueKey('trailer-fallback-overlay'),
              opacity: showingCurrentVideo && widget.active ? 0 : 1,
              duration: const Duration(milliseconds: 180),
              child: FeedArtwork(game: widget.game),
            ),
          ),
        widget.child,
        if (_videoId != null)
          Positioned(
            top: 48,
            right: AppSpacing.margin,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton.filledTonal(
                  tooltip: _player?.playingVideoId == _videoId && !_failed
                      ? 'Pausar trailer'
                      : 'Reproduzir trailer',
                  onPressed: _togglePlayback,
                  icon: Icon(
                    _player?.playingVideoId == _videoId && !_failed
                        ? Icons.pause
                        : Icons.play_arrow,
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: _muted ? 'Ativar som' : 'Silenciar trailer',
                  onPressed: () {
                    setState(() => _muted = !_muted);
                    _sync();
                  },
                  icon: Icon(_muted ? Icons.volume_off : Icons.volume_up),
                ),
              ],
            ),
          ),
      ],
    );
  }
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
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(AppRadius.large),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Icon(
                    Icons.sports_esports_outlined,
                    size: 64,
                    color: AppColors.muted,
                    semanticLabel: game.title,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  'Prévia indisponível',
                  textAlign: TextAlign.center,
                  style: AppTypography.label(
                    12,
                  ).copyWith(color: AppColors.secondary),
                ),
              ],
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
