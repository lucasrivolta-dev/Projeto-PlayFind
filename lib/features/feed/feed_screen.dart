import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../../config/api_config.dart';
import '../game_detail/game_detail_screen.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'feed_controller.dart';
import 'feed_comments_sheet.dart';
import 'feed_trailer.dart';
import 'feed_pager.dart';
import 'trailer_player.dart';
import '../explore/explore_data.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_screen.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({
    super.key,
    required this.controller,
    this.auth,
    this.active = true,
    this.playerFactory,
    this.onSearch,
    this.clock,
    this.onEventRecorded,
  });
  final FeedController controller;
  final AuthController? auth;
  final bool active;
  final TrailerPlayerFactory? playerFactory;
  final VoidCallback? onSearch;
  final DateTime Function()? clock;
  final void Function(String eventType, Map<String, dynamic>? metadata)? onEventRecorded;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  final _pageController = PageController(keepPage: false);
  final _trailerKey = GlobalKey<FeedTrailerState>();
  StreamSubscription<String>? _errorSub;
  late DateTime _cardEnterTime;
  int _lastReportedIndex = 0;

  TrailerPlayer? _attachedPlayer;
  DateTime? _playbackSegmentStart;
  int _accumulatedPlaybackMs = 0;

  DateTime _now() => widget.clock?.call() ?? DateTime.now();

  @override
  void initState() {
    super.initState();
    _cardEnterTime = _now();
    _subscribeErrors();
  }

  @override
  void didUpdateWidget(FeedScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller.library != widget.controller.library) {
      _errorSub?.cancel();
      _subscribeErrors();
    }
    _syncPlayerListener();
  }

  void _subscribeErrors() {
    _errorSub = widget.controller.library.errors.listen((msg) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ));
    });
  }

  @override
  void dispose() {
    _attachedPlayer?.removeListener(_onPlayerStateChanged);
    _attachedPlayer = null;
    _playbackSegmentStart = null;
    _accumulatedPlaybackMs = 0;
    _errorSub?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  bool _isTrailerPlaying() {
    final trailerState = _trailerKey.currentState;
    if (trailerState != null) {
      if (trailerState.isPlaying) return true;
      final p = trailerState.player ?? _attachedPlayer;
      if (p != null && p.isPlaying && trailerState.hasVideoId && p.playingVideoId == null) {
        return true;
      }
      return false;
    }
    return _attachedPlayer?.isPlaying ?? false;
  }

  void _syncPlayerListener() {
    final player = _trailerKey.currentState?.player;
    if (player != _attachedPlayer) {
      _attachedPlayer?.removeListener(_onPlayerStateChanged);
      _attachedPlayer = player;
      _attachedPlayer?.addListener(_onPlayerStateChanged);
    }
    _updatePlaybackTracking();
  }

  void _onPlayerStateChanged() {
    _updatePlaybackTracking();
  }

  void _updatePlaybackTracking() {
    final isPlaying = _isTrailerPlaying();
    final now = _now();
    if (isPlaying) {
      _playbackSegmentStart ??= now;
    } else {
      if (_playbackSegmentStart != null) {
        _accumulatedPlaybackMs += now.difference(_playbackSegmentStart!).inMilliseconds;
        _playbackSegmentStart = null;
      }
    }
  }

  int _finalizePlaybackAndReset() {
    final now = _now();
    int total = _accumulatedPlaybackMs;
    if (_playbackSegmentStart != null) {
      if (_isTrailerPlaying()) {
        total += now.difference(_playbackSegmentStart!).inMilliseconds;
      }
    }
    _accumulatedPlaybackMs = 0;
    _playbackSegmentStart = null;
    return total;
  }

  void _recordEvent({
    required String gameId,
    required String eventType,
    int? watchDurationMs,
    int? position,
    Map<String, dynamic>? metadata,
  }) {
    widget.onEventRecorded?.call(eventType, metadata);
    if (widget.auth == null || !widget.auth!.isAuthenticated) return;
    unawaited(() async {
      try {
        final token = await widget.auth!.getIdToken();
        if (token == null || token.isEmpty) return;
        final uri = Uri.parse('${ApiConfig.baseUrl}/recommendations/events');
        final headers = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        };
        final body = jsonEncode({
          'gameId': gameId,
          'eventType': eventType,
          if (watchDurationMs != null) 'watchDurationMs': watchDurationMs,
          if (position != null) 'position': position,
          if (metadata != null) 'metadata': metadata,
        });
        await http.post(uri, headers: headers, body: body).timeout(const Duration(seconds: 5));
      } catch (e) {
        // Engagement signals are fire-and-forget; never disrupt UI or video playback
      }
    }());
  }

  void _handlePageChanged(int newIndex) {
    _syncPlayerListener();

    final now = _now();
    final stayMs = now.difference(_cardEnterTime).inMilliseconds;
    final watchedMs = _finalizePlaybackAndReset();

    final player = _trailerKey.currentState?.player;
    final pos = player?.position ?? Duration.zero;
    final dur = player?.duration ?? Duration.zero;
    final watchedSec = double.parse((watchedMs / 1000.0).toStringAsFixed(1));
    final durSec = double.parse((dur.inMilliseconds / 1000.0).toStringAsFixed(1));
    final dwellSec = double.parse((stayMs / 1000.0).toStringAsFixed(1));
    final watchRatio = durSec > 0 ? double.parse((watchedSec / durSec).clamp(0.0, 1.0).toStringAsFixed(3)) : null;
    final lastPosSec = player != null ? double.parse((pos.inMilliseconds / 1000.0).toStringAsFixed(1)) : null;

    final items = widget.controller.items;
    if (_lastReportedIndex >= 0 && _lastReportedIndex < items.length) {
      final prevGame = items[_lastReportedIndex].game;

      final metadata = <String, dynamic>{
        'watchedSeconds': watchedSec,
        'durationSeconds': durSec,
        'cardDwellSeconds': dwellSec,
        if (watchRatio != null) 'watchRatio': watchRatio,
        if (lastPosSec != null) 'lastPositionSeconds': lastPosSec,
      };

      if (watchedSec >= 15.0 || (watchRatio != null && watchRatio >= 0.70)) {
        // High watch: real playback >= 15s or >= 70% of trailer
        _recordEvent(
          gameId: prevGame.id,
          eventType: 'WATCH',
          watchDurationMs: watchedMs,
          position: _lastReportedIndex,
          metadata: metadata,
        );
      } else if (watchedSec >= 6.0 || (watchRatio != null && watchRatio >= 0.35)) {
        // Moderate watch: real playback >= 6s or >= 35% of trailer
        _recordEvent(
          gameId: prevGame.id,
          eventType: 'WATCH',
          watchDurationMs: watchedMs,
          position: _lastReportedIndex,
          metadata: metadata,
        );
      } else if (stayMs <= 2000 && watchedSec < 2.0) {
        // Early skip: fast swipe <= 2s and minimal playback < 2s
        _recordEvent(
          gameId: prevGame.id,
          eventType: 'EARLY_SKIP',
          watchDurationMs: watchedMs,
          position: _lastReportedIndex,
          metadata: metadata,
        );
      }
      // Dwell where user paused (e.g. stayed 20s but watchedSec was 1.5s) is neutral:
      // not a WATCH (not watched enough) and not an EARLY_SKIP (stayed > 2s).
    }

    _cardEnterTime = now;
    _lastReportedIndex = newIndex;
    widget.controller.setCurrent(newIndex);
    _syncPlayerListener();
  }

  Future<void> _protected(BuildContext context, VoidCallback action) async {
    if (widget.auth == null || widget.auth!.isAuthenticated) {
      action();
      return;
    }
    final loggedIn = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
            builder: (_) => AuthScreen(controller: widget.auth!)));
    if (context.mounted &&
        loggedIn == true &&
        widget.auth!.isAuthenticated) {
      action();
    }
  }

  void _comments(BuildContext context, FeedItem item) {
    showAppSheet<void>(
        context,
        FeedCommentsSheet(
            controller: widget.controller,
            item: item,
            onProtected: _protected));
  }

  void _details(BuildContext context, FeedItem item) {
    _recordEvent(
      gameId: item.game.id,
      eventType: 'DETAIL_VIEW',
      position: widget.controller.current,
      metadata: {'source': 'feed_card'},
    );
    openGameDetails(
      context,
      item.game,
      widget.controller.library,
      widget.controller.items.map((item) => item.game).toList(),
    );
  }

  @override
  Widget build(BuildContext context) => SafeArea(
      bottom: false,
      child: ListenableBuilder(
          listenable: widget.auth != null
              ? Listenable.merge([widget.controller, widget.auth!])
              : widget.controller,
          builder: (context, _) {
            if (widget.controller.loading) {
              return const Center(
                  child: CircularProgressIndicator(
                      semanticsLabel: 'Carregando feed'));
            }
            if (widget.controller.error) {
              return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('Não foi possível carregar o feed.',
                    style: AppTypography.body()),
                FilledButton(
                    onPressed: widget.controller.load,
                    child: const Text('Tentar novamente'))
              ]));
            }
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              _syncPlayerListener();
            });
            return LayoutBuilder(builder: (context, constraints) {
              // Keep the editorial feed in a phone-sized column on wide browser screens.
              final width =
                  constraints.maxWidth > 600 ? 430.0 : constraints.maxWidth;
              return Center(
                  child: SizedBox(
                      width: width,
                      child: widget.controller.items.isEmpty
                          ? const Center(child: Text('Nenhum jogo disponível.'))
                          : FeedPager(
                              active: widget.active,
                              pageController: _pageController,
                              frameBuilder: (pages) => FeedTrailer(
                                key: _trailerKey,
                                game: widget.controller
                                    .items[widget.controller.current].game,
                                active: widget.active &&
                                    (ModalRoute.of(context)?.isCurrent ?? true),
                                playerFactory: widget.playerFactory,
                                pageController: _pageController,
                                currentIndex: widget.controller.current,
                                standaloneControls: false,
                                child: pages,
                              ),
                              itemCount: widget.controller.items.length,
                              onPageChanged: _handlePageChanged,
                              itemBuilder: (context, index) => _FeedPage(
                                item: widget.controller.items[index],
                                active: index == widget.controller.current,
                                controller: widget.controller,
                                preferredPlatforms:
                                    widget.auth?.preferredPlatforms ??
                                        const [],
                                onProtected: (action) =>
                                    _protected(context, action),
                                onComments: () => _comments(
                                    context, widget.controller.items[index]),
                                onDetails: () => _details(
                                    context, widget.controller.items[index]),
                                onSearch: widget.onSearch,
                              ),
                            )));
            });
          }));
}

String _formatCompact(int count) {
  if (count < 1000) return count.toString();
  if (count < 1000000) {
    final d = count / 1000;
    return '${d.toStringAsFixed(d >= 10 ? 0 : 1)}k';
  }
  final d = count / 1000000;
  return '${d.toStringAsFixed(d >= 10 ? 0 : 1)}M';
}

class _FeedPage extends StatelessWidget {
  const _FeedPage({
    required this.item,
    required this.active,
    required this.controller,
    this.preferredPlatforms = const [],
    required this.onComments,
    required this.onDetails,
    required this.onProtected,
    this.onSearch,
  });

  final FeedItem item;
  final bool active;
  final FeedController controller;
  final List<String> preferredPlatforms;
  final VoidCallback onComments, onDetails;
  final Future<void> Function(VoidCallback action) onProtected;
  final VoidCallback? onSearch;

  @override
  Widget build(BuildContext context) {
    final trailerState = FeedTrailerScope.maybeOf(context);
    final game = item.game;

    return Material(
      type: MaterialType.transparency,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final availableH = constraints.maxHeight;
          final availableW = constraints.maxWidth - (AppSpacing.margin * 2);
          final metrics = FeedTrailerMetrics(
            availableH: availableH,
            availableW: availableW,
          );
          final trailerH = metrics.trailerH;
          final trailerW = metrics.trailerW;

          return SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.margin,
                vertical: AppSpacing.xs,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(height: metrics.topGap),

                  // 1. Top Header Bar (44px) - Glass Search, NextPlay Logo, Audio Toggle
                  SizedBox(
                    height: 44.0,
                    child: Row(
                      children: [
                        // Search Button
                        Semantics(
                          button: true,
                          label: 'Buscar',
                          child: Tooltip(
                            message: 'Buscar jogos',
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: onSearch,
                                borderRadius: BorderRadius.circular(22),
                                child: Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: AppColors.low.withValues(alpha: 0.8),
                                    border: Border.all(color: AppColors.border),
                                  ),
                                  child: const Icon(
                                    Icons.search_rounded,
                                    color: AppColors.text,
                                    size: 20,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),

                        // Logo Central NextPlay
                        Expanded(
                          child: Center(
                            child: RichText(
                              text: TextSpan(
                                style: AppTypography.title(20).copyWith(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5,
                                ),
                                children: const [
                                  TextSpan(
                                    text: 'Next',
                                    style: TextStyle(color: Colors.white),
                                  ),
                                  TextSpan(
                                    text: 'Play',
                                    style: TextStyle(color: AppColors.primary),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),

                        // Audio Toggle Button
                        Semantics(
                          button: true,
                          label: 'Alternar áudio',
                          child: Tooltip(
                            message: (trailerState?.isMuted ?? true)
                                ? 'Ativar som'
                                : 'Silenciar trailer',
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () => trailerState?.toggleMute(),
                                borderRadius: BorderRadius.circular(22),
                                child: Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: AppColors.low.withValues(alpha: 0.8),
                                    border: Border.all(color: AppColors.border),
                                  ),
                                  child: Icon(
                                    (trailerState?.isMuted ?? true)
                                        ? Icons.volume_off_rounded
                                        : Icons.volume_up_rounded,
                                    color: (trailerState?.isMuted ?? true)
                                        ? AppColors.secondary
                                        : const Color(0xFF00E5FF),
                                    size: 20,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  SizedBox(height: metrics.gapMd),

                  // 2. Trailer Container 16:9 (Alinhado exatamente com FeedTrailer e FeedTrailerControls)
                  Center(
                    child: SizedBox(
                      width: trailerW,
                      height: trailerH,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(AppRadius.hero),
                        child: Container(
                          decoration: BoxDecoration(
                            color:
                                active ? Colors.transparent : AppColors.surface,
                            borderRadius:
                                BorderRadius.circular(AppRadius.hero),
                            border: Border.all(
                              color: active
                                  ? AppColors.primary.withValues(alpha: 0.25)
                                  : AppColors.border,
                              width: 1.0,
                            ),
                            boxShadow: active
                                ? [
                                    BoxShadow(
                                      color: AppColors.primary
                                          .withValues(alpha: 0.15),
                                      blurRadius: 16,
                                      spreadRadius: 0,
                                      offset: const Offset(0, 4),
                                    ),
                                  ]
                                : null,
                          ),
                          child: active
                              ? const SizedBox.expand()
                              : FeedArtwork(game: game),
                        ),
                      ),
                    ),
                  ),

                  SizedBox(height: metrics.gapMd),

                  // 3. 5 Botões Circulares de Ações Sociais (Estilo Obsidian Kinetic / Referência Visual)
                  _Actions(
                    item: item,
                    controller: controller,
                    onComments: onComments,
                    onProtected: onProtected,
                  ),

                  // Respiro natural entre ações e detalhes
                  const Spacer(),

                  // 4. Detalhes do Jogo (Apenas dados reais recebidos da API!)
                  InkWell(
                    onTap: onDetails,
                    borderRadius: BorderRadius.circular(AppRadius.large),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 4,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Badges: Trailer Oficial + Nota real + Afinidade real + Gêneros reais + Modo
                          Row(
                            children: [
                              if (game.isOfficialTrailer) ...[
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary
                                        .withValues(alpha: 0.18),
                                    borderRadius:
                                        BorderRadius.circular(AppRadius.base),
                                    border: Border.all(
                                      color: AppColors.primary
                                          .withValues(alpha: 0.5),
                                    ),
                                  ),
                                  child: Text(
                                    'TRAILER OFICIAL',
                                    style: AppTypography.label(10).copyWith(
                                      color: AppColors.primary,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.4,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 6),
                              ],
                              if (game.hasRating) ...[
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 7,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF10B981)
                                        .withValues(alpha: 0.15),
                                    borderRadius:
                                        BorderRadius.circular(AppRadius.base),
                                    border: Border.all(
                                      color: const Color(0xFF10B981)
                                          .withValues(alpha: 0.4),
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.star_rounded,
                                        size: 13,
                                        color: Color(0xFF10B981),
                                      ),
                                      const SizedBox(width: 3),
                                      Text(
                                        game.hasRatingCount
                                            ? '${game.rating} (${_formatCompact(game.ratingCount!)})'
                                            : game.rating!,
                                        style: AppTypography.label(10).copyWith(
                                          color: const Color(0xFF10B981),
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 6),
                              ],
                              if (item.match != null) ...[
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 7,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFF2A55)
                                        .withValues(alpha: 0.12),
                                    borderRadius:
                                        BorderRadius.circular(AppRadius.base),
                                    border: Border.all(
                                      color: const Color(0xFFFF2A55)
                                          .withValues(alpha: 0.35),
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Text(
                                        '🔥',
                                        style: TextStyle(fontSize: 10),
                                      ),
                                      const SizedBox(width: 3),
                                      Text(
                                        '${item.match}%',
                                        style: AppTypography.label(10).copyWith(
                                          color: const Color(0xFFFF5277),
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 6),
                              ],
                              // Gêneros reais e Modo
                              Expanded(
                                child: SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                    children: [
                                      for (final g in (game.genres.isNotEmpty
                                          ? game.genres.take(3)
                                          : (game.hasGenre
                                              ? [game.genre]
                                              : <String>[])))
                                        Padding(
                                          padding:
                                              const EdgeInsets.only(right: 6),
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 7,
                                              vertical: 3,
                                            ),
                                            decoration: BoxDecoration(
                                              color: AppColors.high,
                                              borderRadius:
                                                  BorderRadius.circular(
                                                      AppRadius.base),
                                              border: Border.all(
                                                  color: AppColors.border),
                                            ),
                                            child: Text(
                                              g,
                                              style: AppTypography.label(10)
                                                  .copyWith(
                                                color: AppColors.text,
                                              ),
                                            ),
                                          ),
                                        ),
                                      if (game.mode != null &&
                                          game.mode!.isNotEmpty)
                                        Padding(
                                          padding:
                                              const EdgeInsets.only(right: 6),
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 7,
                                              vertical: 3,
                                            ),
                                            decoration: BoxDecoration(
                                              color: AppColors.high,
                                              borderRadius:
                                                  BorderRadius.circular(
                                                      AppRadius.base),
                                              border: Border.all(
                                                  color: AppColors.border),
                                            ),
                                            child: Text(
                                              game.mode!,
                                              style: AppTypography.label(10)
                                                  .copyWith(
                                                color: AppColors.secondary,
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),

                          // Título do Jogo
                          Text(
                            game.title,
                            style: AppTypography.title(22).copyWith(
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 3),

                          // Descrição Curta (Apenas dados reais, sem texto inventado)
                          if (game.hasDescription) ...[
                            Text(
                              game.description,
                              style: AppTypography.body(12).copyWith(
                                color: AppColors.secondary,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 6),
                          ] else if (item.caption.isNotEmpty) ...[
                            Text(
                              item.caption,
                              style: AppTypography.body(12).copyWith(
                                color: AppColors.secondary,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 6),
                          ],

                          // Linha de Preço, Lojas e Ação CTA
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Expanded(
                                child: SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.center,
                                    children: _buildPriceAndPlatformWidgets(
                                      game,
                                      preferredPlatforms,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),

                              // Botão CTA: Ver jogo (abre GameDetailScreen interno com dados reais) ou Detalhes
                              if (game.hasStoreUrl)
                                GestureDetector(
                                  onTap: onDetails,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 14,
                                      vertical: 8,
                                    ),
                                    decoration: BoxDecoration(
                                      gradient: const LinearGradient(
                                        colors: [
                                          Color(0xFF8B5CF6),
                                          Color(0xFF7C3AED),
                                        ],
                                      ),
                                      borderRadius: BorderRadius.circular(
                                          AppRadius.medium),
                                      boxShadow: [
                                        BoxShadow(
                                          color: AppColors.primary
                                              .withValues(alpha: 0.35),
                                          blurRadius: 8,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          'Ver jogo',
                                          style:
                                              AppTypography.label(12).copyWith(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        const Icon(
                                          Icons.arrow_forward_rounded,
                                          size: 14,
                                          color: Colors.white,
                                        ),
                                      ],
                                    ),
                                  ),
                                )
                              else
                                GestureDetector(
                                  onTap: onDetails,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 6,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.high,
                                      borderRadius: BorderRadius.circular(
                                          AppRadius.medium),
                                      border:
                                          Border.all(color: AppColors.border),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          'Detalhes',
                                          style:
                                              AppTypography.label(11).copyWith(
                                            color: AppColors.text,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        const Icon(
                                          Icons.info_outline,
                                          size: 13,
                                          color: AppColors.secondary,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),

                  SizedBox(height: metrics.gapSm),

                  // 5. Barra única de reprodução do trailer (estilo Obsidian Kinetic com timestamps)
                  Padding(
                    padding: EdgeInsets.only(bottom: metrics.gapSm),
                    child: _TrailerBottomSeekBar(trailerState: trailerState),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({
    required this.item,
    required this.controller,
    required this.onComments,
    required this.onProtected,
  });

  final FeedItem item;
  final FeedController controller;
  final VoidCallback onComments;
  final Future<void> Function(VoidCallback action) onProtected;

  @override
  Widget build(BuildContext context) {
    final isLiked = controller.liked.contains(item.game.id);
    final isSaved = controller.saved.contains(item.game.id);
    final isPlayed = controller.played.contains(item.game.id);
    final realLikes = controller.realLikeCount(item.game);
    final realComments = controller.realCommentCount(item.game);

    return Row(
      children: [
        // 1. Curtir
        Expanded(
          child: _ActionButton(
            icon: isLiked ? Icons.favorite : Icons.favorite_border,
            iconColor: isLiked ? const Color(0xFFFF2A55) : AppColors.text,
            activeColor: const Color(0xFFFF2A55),
            label: 'Curtir',
            count: realLikes > 0 ? _formatCompact(realLikes) : null,
            tooltip: isLiked ? 'Descurtir' : 'Curtir',
            semanticsLabel: 'Curtir',
            isActive: isLiked,
            onTap: () => onProtected(
              () => controller.toggleLike(item.game.id, item.game),
            ),
          ),
        ),

        // 2. Quero jogar (Ação principal com destaque e glow)
        Expanded(
          child: _ActionButton(
            icon: isSaved
                ? Icons.bookmark_rounded
                : Icons.bookmark_border_rounded,
            iconColor: isSaved ? Colors.white : AppColors.text,
            activeColor: AppColors.primary,
            label: 'Quero jogar',
            tooltip:
                isSaved ? 'Remover de Quero jogar' : 'Adicionar a Quero jogar',
            semanticsLabel: 'Quero jogar',
            isActive: isSaved,
            isPrimaryGlow: isSaved,
            onTap: () => onProtected(
              () => controller.toggleSave(item.game.id, item.game),
            ),
          ),
        ),

        // 3. Já joguei
        Expanded(
          child: _ActionButton(
            icon: isPlayed
                ? Icons.check_circle_rounded
                : Icons.check_circle_outline_rounded,
            iconColor: isPlayed ? const Color(0xFF10B981) : AppColors.text,
            activeColor: const Color(0xFF10B981),
            label: 'Já joguei',
            tooltip: isPlayed ? 'Jogado' : 'Marcar como já joguei',
            semanticsLabel: 'Já joguei',
            isActive: isPlayed,
            onTap: () => onProtected(
              () => controller.markPlayed(item.game.id, item.game),
            ),
          ),
        ),

        // 4. Comentar
        Expanded(
          child: _ActionButton(
            icon: Icons.chat_bubble_outline_rounded,
            iconColor: AppColors.text,
            label: 'Comentar',
            count: realComments > 0 ? _formatCompact(realComments) : null,
            tooltip: 'Comentar',
            semanticsLabel: 'Comentar',
            isActive: false,
            onTap: onComments,
          ),
        ),

        // 5. Compartilhar
        Expanded(
          child: _ActionButton(
            icon: Icons.share_outlined,
            iconColor: AppColors.text,
            label: 'Compartilhar',
            tooltip: 'Compartilhar',
            semanticsLabel: 'Compartilhar',
            isActive: false,
            onTap: () {
              final text = item.game.hasStoreUrl
                  ? item.game.steamStoreUrl!
                  : item.game.title;
              Clipboard.setData(ClipboardData(text: text));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Link copiado para compartilhar.'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.tooltip,
    required this.semanticsLabel,
    required this.isActive,
    required this.onTap,
    this.count,
    this.activeColor,
    this.isPrimaryGlow = false,
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final String tooltip;
  final String semanticsLabel;
  final bool isActive;
  final String? count;
  final Color? activeColor;
  final bool isPrimaryGlow;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticsLabel,
      child: Tooltip(
        message: tooltip,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.base),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: isPrimaryGlow
                              ? const LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    Color(0xFF9333EA),
                                    Color(0xFF7C3AED)
                                  ],
                                )
                              : null,
                          color: isPrimaryGlow
                              ? null
                              : (isActive && activeColor != null)
                                  ? activeColor!.withValues(alpha: 0.15)
                                  : AppColors.high.withValues(alpha: 0.6),
                          border: Border.all(
                            color: isPrimaryGlow
                                ? Colors.white.withValues(alpha: 0.3)
                                : (isActive && activeColor != null)
                                    ? activeColor!.withValues(alpha: 0.5)
                                    : AppColors.border,
                            width: 1.0,
                          ),
                          boxShadow: isPrimaryGlow
                              ? [
                                  BoxShadow(
                                    color: AppColors.primary
                                        .withValues(alpha: 0.4),
                                    blurRadius: 10,
                                    offset: const Offset(0, 2),
                                  ),
                                ]
                              : null,
                        ),
                        child: Icon(
                          icon,
                          size: 20,
                          color: iconColor,
                        ),
                      ),
                      if (count != null && count!.isNotEmpty && count != '0')
                        Positioned(
                          top: -2,
                          right: -4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 4, vertical: 1),
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: Colors.white38, width: 0.5),
                            ),
                            child: Text(
                              count!,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 8,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      label,
                      style: AppTypography.label(10).copyWith(
                        color: isActive && activeColor != null
                            ? (isPrimaryGlow ? AppColors.primary : activeColor)
                            : AppColors.secondary,
                        fontWeight:
                            isActive ? FontWeight.w700 : FontWeight.w500,
                      ),
                      maxLines: 1,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TrailerBottomSeekBar extends StatelessWidget {
  const _TrailerBottomSeekBar({
    required this.trailerState,
  });

  final FeedTrailerState? trailerState;

  @override
  Widget build(BuildContext context) {
    if (trailerState == null) return const SizedBox(height: 28);
    final player = trailerState!.player;

    return ListenableBuilder(
      listenable: player ?? ChangeNotifier(),
      builder: (context, _) {
        final playerDur = player?.duration ?? Duration.zero;
        final playerPos = player?.position ?? Duration.zero;
        final hasDuration = playerDur > Duration.zero;
        final currentFraction = trailerState!.dragFraction ??
            (hasDuration
                ? (playerPos.inMilliseconds / playerDur.inMilliseconds)
                    .clamp(0.0, 1.0)
                : 0.0);
        final displayPos = trailerState!.dragFraction != null && hasDuration
            ? Duration(
                milliseconds:
                    (trailerState!.dragFraction! * playerDur.inMilliseconds)
                        .toInt())
            : playerPos;

        return LayoutBuilder(
          builder: (context, constraints) {
            final barWidth = constraints.maxWidth;
            return GestureDetector(
              key: const Key('feed_trailer_seekbar'),
              behavior: HitTestBehavior.opaque,
              onTapDown: (details) {
                if (barWidth <= 0 || !hasDuration) return;
                final fraction =
                    (details.localPosition.dx / barWidth).clamp(0.0, 1.0);
                trailerState!.handleSeekFraction(fraction);
              },
              onHorizontalDragStart: (details) {
                if (barWidth <= 0) return;
                final fraction =
                    (details.localPosition.dx / barWidth).clamp(0.0, 1.0);
                trailerState!.setDragFraction(fraction);
              },
              onHorizontalDragUpdate: (details) {
                if (barWidth <= 0) return;
                final fraction =
                    (details.localPosition.dx / barWidth).clamp(0.0, 1.0);
                trailerState!.setDragFraction(fraction);
              },
              onHorizontalDragEnd: (details) {
                final fraction = trailerState!.dragFraction;
                trailerState!.setDragFraction(null);
                if (fraction != null && hasDuration) {
                  trailerState!.handleSeekFraction(fraction);
                }
              },
              onHorizontalDragCancel: () {
                trailerState!.setDragFraction(null);
              },
              child: Container(
                height: 28,
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          trailerState!.formatDuration(displayPos),
                          style: AppTypography.label(10).copyWith(
                            color: AppColors.secondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          hasDuration
                              ? trailerState!.formatDuration(playerDur)
                              : '0:00',
                          style: AppTypography.label(10).copyWith(
                            color: AppColors.secondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Stack(
                      alignment: Alignment.centerLeft,
                      children: [
                        Container(
                          height: 3,
                          decoration: BoxDecoration(
                            color: AppColors.high,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        FractionallySizedBox(
                          widthFactor: currentFraction,
                          child: Container(
                            height: 3,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [
                                  Color(0xFF8B5CF6),
                                  Color(0xFF7C3AED),
                                ],
                              ),
                              borderRadius: BorderRadius.circular(2),
                              boxShadow: [
                                BoxShadow(
                                  color:
                                      AppColors.primary.withValues(alpha: 0.5),
                                  blurRadius: 4,
                                  spreadRadius: 1,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

List<Widget> _buildPriceAndPlatformWidgets(
  DiscoveryGame game,
  List<String> preferredPlatforms,
) {
  final widgets = <Widget>[];

  // 1. Preço e Desconto REAL (Exclusivamente Steam conforme regra de produto)
  if (game.hasSteamPrice) {
    if (game.hasSteamDiscount) {
      widgets.add(
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 6,
            vertical: 3,
          ),
          decoration: BoxDecoration(
            color: AppColors.positive.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(AppRadius.small),
            border: Border.all(
              color: AppColors.positive.withValues(alpha: 0.5),
            ),
          ),
          child: Text(
            '-${game.steamDiscountPercent}%',
            style: AppTypography.label(11).copyWith(
              color: AppColors.positive,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
      widgets.add(const SizedBox(width: 6));
    }

    _addSteamPrice(widgets, game);

    // Identificador claro de que o preço/oferta é exclusivamente da Steam
    widgets.add(
      Text(
        '• Steam',
        style: AppTypography.label(10).copyWith(
          color: AppColors.muted,
        ),
        maxLines: 1,
      ),
    );
    widgets.add(const SizedBox(width: 8));
  }

  // 2. Plataformas compatíveis (com base nas preferências do usuário ou gerais)
  final userFamilies = preferredPlatforms
      .map(matchCanonicalFamily)
      .whereType<CanonicalPlatformFamily>()
      .toSet()
      .toList();

  final platformsToShow = <String>[];
  if (userFamilies.isNotEmpty) {
    for (final family in userFamilies.take(2)) {
      if (game.supportsCanonicalFamily(family)) {
        platformsToShow.add(family.shortLabel);
      }
    }
  }

  if (platformsToShow.isEmpty) {
    for (final p in game.platforms.take(2)) {
      platformsToShow.add(p);
    }
  }

  for (final platformName in platformsToShow) {
    widgets.add(
      Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 6,
          vertical: 2,
        ),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.small),
          border: Border.all(color: AppColors.border),
        ),
        child: Text(
          platformName,
          style: AppTypography.label(9).copyWith(
            color: AppColors.text,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
    widgets.add(const SizedBox(width: 4));
  }

  return widgets;
}

void _addSteamPrice(List<Widget> widgets, DiscoveryGame game) {
  if (game.hasOriginalPrice) {
    widgets.add(
      Text(
        game.formattedOriginalPrice!,
        style: AppTypography.body(11).copyWith(
          color: AppColors.muted,
          decoration: TextDecoration.lineThrough,
        ),
      ),
    );
    widgets.add(const SizedBox(width: 4));
  }
  widgets.add(
    Text(
      game.steamPriceCents == 0
          ? 'Grátis'
          : 'R\$ ${(game.steamPriceCents! / 100).toStringAsFixed(2).replaceAll('.', ',')}',
      style: AppTypography.title(16).copyWith(
        color: game.steamPriceCents == 0
            ? AppColors.positive
            : AppColors.text,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
  widgets.add(const SizedBox(width: 8));
}
