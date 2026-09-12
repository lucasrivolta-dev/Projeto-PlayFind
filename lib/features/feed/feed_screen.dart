import 'dart:async';

import '../game_detail/game_detail_screen.dart';
import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'feed_controller.dart';
import 'feed_comments_sheet.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_screen.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key, required this.controller, this.auth});
  final FeedController controller;
  final AuthController? auth;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
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
                      child: PageView.builder(
                          scrollDirection: Axis.vertical,
                          itemCount: widget.controller.items.length,
                          onPageChanged: widget.controller.setCurrent,
                          itemBuilder: (context, index) => _FeedPage(
                              item: widget.controller.items[index],
                              controller: widget.controller,
                              onProtected: (action) =>
                                  _protected(context, action),
                              onComments: () => _comments(
                                  context, widget.controller.items[index]),
                              onDetails: () => _details(
                                  context, widget.controller.items[index])))));
            });
          }));
}

class _FeedPage extends StatelessWidget {
  const _FeedPage(
      {required this.item,
      required this.controller,
      required this.onComments,
      required this.onDetails,
      required this.onProtected});
  final FeedItem item;
  final FeedController controller;
  final VoidCallback onComments, onDetails;
  final Future<void> Function(VoidCallback action) onProtected;
  @override
  Widget build(BuildContext context) => Stack(fit: StackFit.expand, children: [
        GameArtwork(appId: item.game.id, title: item.game.title, cover: true),
        DecoratedBox(
            decoration: BoxDecoration(
                gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
              AppColors.canvas.withValues(alpha: .3),
              Colors.transparent,
              AppColors.canvas.withValues(alpha: .96)
            ],
                    stops: const [
              0,
              .35,
              1
            ]))),
        Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.margin, AppSpacing.md,
                AppSpacing.margin, AppSpacing.md),
            child: Column(children: [
              Row(children: [
                const Icon(Icons.play_arrow_rounded,
                    color: AppColors.primary, size: 24),
                const SizedBox(width: 4),
                Text('NextPlay', style: AppTypography.label(14)),
                const Spacer(),
                Text('FOR YOU',
                    style: AppTypography.label(10)
                        .copyWith(color: AppColors.text)),
                const SizedBox(width: 8),
                const Icon(Icons.more_horiz, color: AppColors.text)
              ]),
              const Spacer(),
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Row(children: [
                        GenreChip('${item.match}% compatível'),
                        const SizedBox(width: 8),
                        GenreChip('★ ${item.game.rating}')
                      ]),
                      const SizedBox(height: 8),
                      Text(item.game.title, style: AppTypography.title(30)),
                      Text(item.game.studio,
                          style: AppTypography.body(12)
                              .copyWith(color: AppColors.text)),
                      const SizedBox(height: 8),
                      Text(item.caption,
                          style: AppTypography.body(13)
                              .copyWith(color: AppColors.text)),
                      const SizedBox(height: 12),
                      Wrap(
                          spacing: 6,
                          children: item.game.platforms
                              .take(3)
                              .map((p) => GenreChip(p))
                              .toList())
                    ])),
                const SizedBox(width: 12),
                _Actions(
                    item: item,
                    controller: controller,
                    onComments: onComments,
                    onProtected: onProtected)
              ]),
              const SizedBox(height: 14),
              InkWell(
                  onTap: onDetails,
                  child: Row(children: [
                    Expanded(
                        child: Text('Ver detalhes do jogo',
                            style: AppTypography.label(12))),
                    const Icon(Icons.arrow_forward,
                        color: AppColors.text, size: 18)
                  ])),
            ])),
      ]);
}

class _Actions extends StatelessWidget {
  const _Actions(
      {required this.item,
      required this.controller,
      required this.onComments,
      required this.onProtected});
  final FeedItem item;
  final FeedController controller;
  final VoidCallback onComments;
  final Future<void> Function(VoidCallback action) onProtected;
  Widget action(
          BuildContext context, IconData icon, String label, VoidCallback onTap,
          {bool active = false}) =>
      Semantics(
          button: true,
          label: label,
          child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(999),
              child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Column(children: [
                    AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: active
                                ? AppColors.primary
                                : AppColors.canvas.withValues(alpha: .65)),
                        child: Icon(icon, size: 20, color: AppColors.text)),
                    const SizedBox(height: 3),
                    Text(label,
                        style: AppTypography.label(9)
                            .copyWith(color: AppColors.text))
                  ]))));
  @override
  Widget build(BuildContext context) =>
      Column(mainAxisSize: MainAxisSize.min, children: [
        action(
            context,
            controller.liked.contains(item.game.id)
                ? Icons.favorite
                : Icons.favorite_border,
            'Curtir',
            () => onProtected(() => controller.toggleLike(item.game.id)),
            active: controller.liked.contains(item.game.id)),
        action(
            context,
            controller.saved.contains(item.game.id)
                ? Icons.bookmark
                : Icons.bookmark_border,
            'Quero jogar',
            () => onProtected(() => controller.toggleSave(item.game.id)),
            active: controller.saved.contains(item.game.id)),
        action(
            context,
            controller.played.contains(item.game.id)
                ? Icons.check_circle
                : Icons.check_circle_outline,
            'Já joguei',
            () => onProtected(() => controller.markPlayed(item.game.id)),
            active: controller.played.contains(item.game.id)),
        action(context, Icons.chat_bubble_outline, 'Comentar', onComments),
        action(
            context,
            Icons.share_outlined,
            'Compartilhar',
            () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Link copiado para compartilhar.')))),
      ]);
}
