import '../game_detail/game_detail_screen.dart';
import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'feed_controller.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_screen.dart';

class FeedScreen extends StatelessWidget {
  const FeedScreen({super.key, required this.controller, this.auth});
  final FeedController controller;
  final AuthController? auth;

  Future<void> _protected(BuildContext context, VoidCallback action) async {
    if (auth == null || auth!.isAuthenticated) {
      action();
      return;
    }
    final loggedIn = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => AuthScreen(controller: auth!)));
    if (loggedIn == true) action();
  }

  void _comments(BuildContext context, FeedItem item) {
    final input = TextEditingController();
    final likedCommentKeys = <String>{};
    showAppSheet<void>(context, StatefulBuilder(builder: (context, setState) {
      final comments = controller.commentsFor(item);
      void send(String value) {
        final text = value.trim();
        if (text.isEmpty) return;
        controller.addComment(item.game.id, text);
        input.clear();
        setState(() {});
      }

      Future<void> requireAccount(VoidCallback action) =>
          _protected(context, action);

      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Center(
            child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: AppColors.muted,
                    borderRadius: BorderRadius.circular(4)))),
        const SizedBox(height: AppSpacing.md),
        Row(children: [
          Expanded(child: Text('Comentários', style: AppTypography.title(20))),
          Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                  color: AppColors.high,
                  borderRadius: BorderRadius.circular(999)),
              child: Text('${comments.length} comentários',
                  style: AppTypography.label(10)
                      .copyWith(color: AppColors.secondary))),
          IconButton(
              tooltip: 'Fechar comentários',
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close))
        ]),
        const SizedBox(height: AppSpacing.sm),
        Row(children: [
          Text('Mais relevantes', style: AppTypography.label(11)),
          const Icon(Icons.keyboard_arrow_down,
              size: 18, color: AppColors.secondary)
        ]),
        const SizedBox(height: AppSpacing.md),
        ...comments.map((comment) => Padding(
            padding: EdgeInsets.only(
                left: comment.reply ? AppSpacing.lg : 0, bottom: AppSpacing.sm),
            child: SurfaceCard(
                color: comment.reply ? AppColors.low : AppColors.surface,
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                          radius: 17,
                          backgroundColor: AppColors.high,
                          child: Text(
                              comment.user.characters.first.toUpperCase(),
                              style: AppTypography.label(12)
                                  .copyWith(color: AppColors.primary))),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Row(children: [
                              Expanded(
                                  child: Text('@${comment.user}',
                                      style: AppTypography.label(11))),
                              Text(comment.time, style: AppTypography.body(10))
                            ]),
                            const SizedBox(height: AppSpacing.xs),
                            Text(comment.text,
                                style: AppTypography.body(13)
                                    .copyWith(color: AppColors.text)),
                            const SizedBox(height: AppSpacing.xs),
                            Row(children: [
                              InkWell(
                                  borderRadius: BorderRadius.circular(999),
                                  onTap: () => requireAccount(() {
                                        final key =
                                            '${comment.user}:${comment.time}:${comment.text}';
                                        if (!likedCommentKeys.add(key)) {
                                          likedCommentKeys.remove(key);
                                        }
                                        setState(() {});
                                      }),
                                  child: Icon(
                                      likedCommentKeys.contains(
                                              '${comment.user}:${comment.time}:${comment.text}')
                                          ? Icons.favorite
                                          : Icons.favorite_border,
                                      size: 16,
                                      color: likedCommentKeys.contains(
                                              '${comment.user}:${comment.time}:${comment.text}')
                                          ? AppColors.primary
                                          : AppColors.muted)),
                              const SizedBox(width: 4),
                              Text('${comment.likes}',
                                  style: AppTypography.label(10)
                                      .copyWith(color: AppColors.secondary)),
                              const SizedBox(width: AppSpacing.md),
                              InkWell(
                                  onTap: () => requireAccount(() {
                                        input.text = '@${comment.user} ';
                                        input.selection = TextSelection.collapsed(
                                            offset: input.text.length);
                                      }),
                                  child: Text('Responder',
                                      style: AppTypography.label(10)
                                          .copyWith(color: AppColors.primary)))
                            ])
                          ]))
                    ])))),
        Container(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.border))),
            child: Row(children: [
              const CircleAvatar(
                  radius: 16,
                  backgroundColor: AppColors.high,
                  child: Icon(Icons.person_outline,
                      size: 18, color: AppColors.secondary)),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                  child: TextField(
                      controller: input,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (value) =>
                          requireAccount(() => send(value)),
                      decoration: const InputDecoration(
                          hintText: 'Adicione um comentário…',
                          prefixIcon: Icon(Icons.alternate_email, size: 18)))),
              const SizedBox(width: AppSpacing.xs),
              IconButton.filled(
                  tooltip: 'Enviar comentário',
                  onPressed: () => requireAccount(() => send(input.text)),
                  icon: const Icon(Icons.send_rounded))
            ]))
      ]);
    }));
  }

  void _details(BuildContext context, FeedItem item) => openGameDetails(
      context,
      item.game,
      controller.library,
      controller.items.map((item) => item.game).toList());

  @override
  Widget build(BuildContext context) => SafeArea(
      bottom: false,
      child: ListenableBuilder(
          listenable: controller,
          builder: (context, _) {
            if (controller.loading) {
              return const Center(
                  child: CircularProgressIndicator(
                      semanticsLabel: 'Carregando feed'));
            }
            if (controller.error) {
              return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('Não foi possível carregar o feed.',
                    style: AppTypography.body()),
                FilledButton(
                    onPressed: controller.load,
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
                          itemCount: controller.items.length,
                          onPageChanged: controller.setCurrent,
                          itemBuilder: (context, index) => _FeedPage(
                              item: controller.items[index],
                              controller: controller,
                              onProtected: (action) =>
                                  _protected(context, action),
                              onComments: () =>
                                  _comments(context, controller.items[index]),
                              onDetails: () => _details(
                                  context, controller.items[index])))));
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
                        child: Icon(icon,
                            size: 20,
                            color: active ? AppColors.text : AppColors.text)),
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
        action(context, Icons.chat_bubble_outline, 'Comentar',
            onComments),
        action(
            context,
            Icons.share_outlined,
            'Compartilhar',
            () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Link copiado para compartilhar.')))),
      ]);
}
