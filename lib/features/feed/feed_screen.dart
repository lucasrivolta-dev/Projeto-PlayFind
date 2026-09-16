import 'dart:async';

import '../game_detail/game_detail_screen.dart';
import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'feed_controller.dart';
import 'feed_comments_sheet.dart';
import 'feed_trailer.dart';
import 'feed_pager.dart';
import 'trailer_player.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_screen.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({
    super.key,
    required this.controller,
    this.auth,
    this.active = true,
    this.playerFactory,
  });
  final FeedController controller;
  final AuthController? auth;
  final bool active;
  final TrailerPlayerFactory? playerFactory;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  final _pageController = PageController(keepPage: false);
  StreamSubscription<String>? _errorSub;

  @override
  void initState() {
    super.initState();
    _subscribeErrors();
  }

  @override
  void didUpdateWidget(FeedScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller.library != widget.controller.library) {
      _errorSub?.cancel();
      _subscribeErrors();
    }
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
    _errorSub?.cancel();
    _pageController.dispose();
    super.dispose();
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

  void _details(BuildContext context, FeedItem item) => openGameDetails(
      context,
      item.game,
      widget.controller.library,
      widget.controller.items.map((item) => item.game).toList());

  @override
  Widget build(BuildContext context) => SafeArea(
      bottom: false,
      child: ListenableBuilder(
          listenable: widget.controller,
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
                                game: widget.controller
                                    .items[widget.controller.current].game,
                                active: widget.active &&
                                    (ModalRoute.of(context)?.isCurrent ?? true),
                                playerFactory: widget.playerFactory,
                                pageController: _pageController,
                                currentIndex: widget.controller.current,
                                child: pages,
                              ),
                              itemCount: widget.controller.items.length,
                              onPageChanged: widget.controller.setCurrent,
                              itemBuilder: (context, index) => _FeedPage(
                                item: widget.controller.items[index],
                                active: index == widget.controller.current,
                                controller: widget.controller,
                                onProtected: (action) =>
                                    _protected(context, action),
                                onComments: () => _comments(
                                    context, widget.controller.items[index]),
                                onDetails: () => _details(
                                    context, widget.controller.items[index]),
                              ),
                            )));
            });
          }));
}

class _FeedPage extends StatelessWidget {
  const _FeedPage({
    required this.item,
    required this.active,
    required this.controller,
    required this.onComments,
    required this.onDetails,
    required this.onProtected,
  });

  final FeedItem item;
  final bool active;
  final FeedController controller;
  final VoidCallback onComments, onDetails;
  final Future<void> Function(VoidCallback action) onProtected;

  @override
  Widget build(BuildContext context) => Material(
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

                    // 1. Top bar
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(5),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.2),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.sports_esports_rounded,
                            color: AppColors.primary,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 8),
                        RichText(
                          text: TextSpan(
                            style: AppTypography.title(18).copyWith(
                              fontWeight: FontWeight.w800,
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
                        const Spacer(),
                        CircleAvatar(
                          radius: 14,
                          backgroundColor: AppColors.surface,
                          child: const Icon(
                            Icons.person_outline,
                            size: 16,
                            color: AppColors.text,
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: metrics.gapSm),

                    // 2. Context Pill (baseada em dados reais)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surface.withValues(alpha: 0.8),
                        borderRadius: BorderRadius.circular(AppRadius.base),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.auto_awesome,
                            size: 13,
                            color: Color(0xFF00E5FF),
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              item.game.genre.isNotEmpty
                                  ? 'Destaque em ${item.game.genre}'
                                  : '${item.match}% de afinidade com o seu perfil',
                              style: AppTypography.label(10).copyWith(
                                color: AppColors.text,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(height: metrics.gapSm),

                    // 3. Linha de paginação do Feed (dados reais)
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.high,
                            borderRadius:
                                BorderRadius.circular(AppRadius.small),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                'FEED ${(controller.current + 1).toString().padLeft(2, '0')}/${controller.items.length.toString().padLeft(2, '0')}',
                                style: AppTypography.label(9).copyWith(
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const SizedBox(width: 2),
                              const Icon(
                                Icons.swap_vert,
                                size: 12,
                                color: AppColors.secondary,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: List.generate(
                            controller.items.length.clamp(1, 6),
                            (dotIdx) => Container(
                              margin:
                                  const EdgeInsets.symmetric(horizontal: 2),
                              width: dotIdx == controller.current ? 12 : 5,
                              height: 5,
                              decoration: BoxDecoration(
                                color: dotIdx == controller.current
                                    ? AppColors.primary
                                    : AppColors.border,
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: metrics.gapMd),

                    // 4. Trailer 16:9 contido em caixa elegante
                    Center(
                      child: SizedBox(
                        width: trailerW,
                        height: trailerH,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadius.large),
                          child: Container(
                            decoration: BoxDecoration(
                              color: AppColors.surface
                                  .withValues(alpha: active ? 0.0 : 1.0),
                              borderRadius:
                                  BorderRadius.circular(AppRadius.large),
                              border: Border.all(
                                color: active
                                    ? Colors.transparent
                                    : AppColors.border,
                              ),
                            ),
                            child: active
                                ? const SizedBox.expand()
                                : FeedArtwork(game: item.game),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(height: metrics.gapMd),

                    // 5. Barra Social Integrada (logo abaixo do trailer)
                    _Actions(
                      item: item,
                      controller: controller,
                      onComments: onComments,
                      onProtected: onProtected,
                    ),
                    SizedBox(height: metrics.gapMd),

                    // 6. Informações do Jogo (Abaixo das Ações)
                    InkWell(
                      onTap: onDetails,
                      borderRadius: BorderRadius.circular(AppRadius.base),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Título + Plataformas
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    item.game.title,
                                    style: AppTypography.title(19).copyWith(
                                      fontWeight: FontWeight.w800,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                ...item.game.platforms.take(3).map(
                                  (p) => Padding(
                                    padding: const EdgeInsets.only(left: 4),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 5,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppColors.high,
                                        borderRadius: BorderRadius.circular(
                                            AppRadius.small),
                                        border:
                                            Border.all(color: AppColors.border),
                                      ),
                                      child: Text(
                                        p,
                                        style: AppTypography.label(9).copyWith(
                                          color: AppColors.text,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            // Estúdio
                            Text(
                              item.game.studio +
                                  (item.game.publisher != null &&
                                          item.game.publisher!.isNotEmpty
                                      ? ' • ${item.game.publisher}'
                                      : ''),
                              style: AppTypography.body(11)
                                  .copyWith(color: AppColors.secondary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 5),
                            // Badges de compatibilidade e rating
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFF2A55)
                                        .withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(
                                        AppRadius.small),
                                    border: Border.all(
                                      color: const Color(0xFFFF2A55)
                                          .withValues(alpha: 0.4),
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
                                        '${item.match}% compatível',
                                        style:
                                            AppTypography.label(9).copyWith(
                                          color: const Color(0xFFFF5277),
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF00E5FF)
                                        .withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(
                                        AppRadius.small),
                                    border: Border.all(
                                      color: const Color(0xFF00E5FF)
                                          .withValues(alpha: 0.35),
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.star_rounded,
                                        size: 12,
                                        color: Color(0xFF00E5FF),
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        '${item.game.rating} Meta',
                                        style:
                                            AppTypography.label(9).copyWith(
                                          color: const Color(0xFF00E5FF),
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (item.game.genre.isNotEmpty) ...[
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppColors.high,
                                        borderRadius: BorderRadius.circular(
                                            AppRadius.small),
                                        border: Border.all(
                                            color: AppColors.border),
                                      ),
                                      child: Text(
                                        item.game.genre,
                                        style:
                                            AppTypography.label(9).copyWith(
                                          color: AppColors.text,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 5),
                            // Descrição curta
                            Text(
                              item.caption,
                              style: AppTypography.body(11)
                                  .copyWith(color: AppColors.text),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ),

                    const Spacer(),

                    // 7. Dica discreta de scroll no rodapé
                    Padding(
                      padding: EdgeInsets.only(bottom: metrics.gapSm),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.keyboard_arrow_down_rounded,
                            size: 15,
                            color: AppColors.muted,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            'Deslize para ver o próximo',
                            style: AppTypography.label(9)
                                .copyWith(color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      );
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

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 1. Curtir
                  Semantics(
                    button: true,
                    label: 'Curtir',
                    child: Tooltip(
                      message: isLiked ? 'Descurtir' : 'Curtir',
                      child: InkWell(
                        onTap: () => onProtected(
                            () => controller.toggleLike(item.game.id)),
                        borderRadius: BorderRadius.circular(AppRadius.base),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isLiked
                                    ? Icons.favorite
                                    : Icons.favorite_border,
                                size: 16,
                                color: isLiked
                                    ? const Color(0xFFFF2A55)
                                    : AppColors.text,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Curtir',
                                style: AppTypography.label(9.5).copyWith(
                                  color: isLiked
                                      ? const Color(0xFFFF2A55)
                                      : AppColors.text,
                                  fontWeight: isLiked
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),

                  // 2. Quero jogar (Destaque Principal)
                  Semantics(
                    button: true,
                    label: 'Quero jogar',
                    child: Tooltip(
                      message: isSaved
                          ? 'Remover de Quero jogar'
                          : 'Adicionar a Quero jogar',
                      child: InkWell(
                        onTap: () => onProtected(
                            () => controller.toggleSave(item.game.id)),
                        borderRadius: BorderRadius.circular(AppRadius.large),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: isSaved
                                  ? [
                                      AppColors.surface,
                                      AppColors.high,
                                    ]
                                  : [
                                      const Color(0xFF9D4EDD),
                                      AppColors.primary,
                                    ],
                            ),
                            borderRadius:
                                BorderRadius.circular(AppRadius.large),
                            border: Border.all(
                              color: isSaved
                                  ? AppColors.primary
                                  : Colors.transparent,
                            ),
                            boxShadow: isSaved
                                ? null
                                : [
                                    BoxShadow(
                                      color: AppColors.primary
                                          .withValues(alpha: 0.35),
                                      blurRadius: 6,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isSaved
                                    ? Icons.bookmark
                                    : Icons.bookmark_border,
                                size: 14,
                                color:
                                    isSaved ? AppColors.primary : Colors.white,
                              ),
                              const SizedBox(width: 3),
                              Text(
                                isSaved ? '✓ Quero jogar' : '+ Quero jogar',
                                style: AppTypography.label(9.5).copyWith(
                                  color: isSaved
                                      ? AppColors.primary
                                      : Colors.white,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),

                  // 3. Já joguei
                  Semantics(
                    button: true,
                    label: 'Já joguei',
                    child: Tooltip(
                      message:
                          isPlayed ? 'Jogado' : 'Marcar como já joguei',
                      child: InkWell(
                        onTap: () => onProtected(
                            () => controller.markPlayed(item.game.id)),
                        borderRadius: BorderRadius.circular(AppRadius.base),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isPlayed
                                    ? Icons.check_circle
                                    : Icons.check_circle_outline,
                                size: 16,
                                color: isPlayed
                                    ? const Color(0xFF10B981)
                                    : AppColors.text,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                isPlayed ? 'Jogado' : 'Já joguei',
                                style: AppTypography.label(9.5).copyWith(
                                  color: isPlayed
                                      ? const Color(0xFF10B981)
                                      : AppColors.text,
                                  fontWeight: isPlayed
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),

                  // 4. Comentar
                  Semantics(
                    button: true,
                    label: 'Comentar',
                    child: Tooltip(
                      message: 'Comentar',
                      child: InkWell(
                        onTap: onComments,
                        borderRadius: BorderRadius.circular(AppRadius.base),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.chat_bubble_outline,
                                size: 15,
                                color: AppColors.text,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Comentar',
                                style: AppTypography.label(9.5).copyWith(
                                  color: AppColors.text,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),

                  // 5. Compartilhar
                  Semantics(
                    button: true,
                    label: 'Compartilhar',
                    child: Tooltip(
                      message: 'Compartilhar',
                      child: InkWell(
                        onTap: () =>
                            ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Link copiado para compartilhar.'),
                            behavior: SnackBarBehavior.floating,
                          ),
                        ),
                        borderRadius: BorderRadius.circular(AppRadius.base),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.share_outlined,
                                size: 15,
                                color: AppColors.text,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Compartilhar',
                                style: AppTypography.label(9.5).copyWith(
                                  color: AppColors.text,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
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
