import '../game_detail/game_detail_screen.dart';
import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'feed_controller.dart';

class FeedScreen extends StatelessWidget {
  const FeedScreen({super.key, required this.controller});
  final FeedController controller;

  void _comments(BuildContext context, FeedItem item) {
    final input = TextEditingController();
    showAppSheet<void>(context, StatefulBuilder(builder: (context, setState) {
      final comments = controller.commentsFor(item);
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text('Comentários', style: AppTypography.title(20))),
          Text('${comments.length}',
              style:
                  AppTypography.label(12).copyWith(color: AppColors.secondary))
        ]),
        const SizedBox(height: AppSpacing.md),
        ...comments.map((comment) => Padding(
            padding: EdgeInsets.only(
                left: comment.reply ? AppSpacing.lg : 0, bottom: AppSpacing.md),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              CircleAvatar(
                  radius: 16,
                  backgroundColor: AppColors.high,
                  child: Text(comment.user.characters.first.toUpperCase(),
                      style: AppTypography.label(12))),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Row(children: [
                      Text(comment.user, style: AppTypography.label(12)),
                      const SizedBox(width: AppSpacing.xs),
                      Text(comment.time, style: AppTypography.body(10))
                    ]),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(comment.text, style: AppTypography.body(12)),
                    const SizedBox(height: AppSpacing.xxs),
                    Text('♡  ${comment.likes}    Responder',
                        style: AppTypography.label(10)
                            .copyWith(color: AppColors.muted)),
                  ])),
            ]))),
        const SizedBox(height: AppSpacing.xs),
        TextField(
            controller: input,
            textInputAction: TextInputAction.send,
            onSubmitted: (value) {
              controller.addComment(item.game.id, value);
              input.clear();
              setState(() {});
            },
            decoration: InputDecoration(
                hintText: 'Escreva um comentário…',
                suffixIcon: IconButton(
                    tooltip: 'Enviar comentário',
                    onPressed: () {
                      controller.addComment(item.game.id, input.text);
                      input.clear();
                      setState(() {});
                    },
                    icon: const Icon(Icons.send, color: AppColors.primary)))),
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
            return PageView.builder(
                scrollDirection: Axis.vertical,
                itemCount: controller.items.length,
                onPageChanged: controller.setCurrent,
                itemBuilder: (context, index) => _FeedPage(
                    item: controller.items[index],
                    controller: controller,
                    onComments: () =>
                        _comments(context, controller.items[index]),
                    onDetails: () =>
                        _details(context, controller.items[index])));
          }));
}

class _FeedPage extends StatelessWidget {
  const _FeedPage(
      {required this.item,
      required this.controller,
      required this.onComments,
      required this.onDetails});
  final FeedItem item;
  final FeedController controller;
  final VoidCallback onComments, onDetails;
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
                    item: item, controller: controller, onComments: onComments)
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
      {required this.item, required this.controller, required this.onComments});
  final FeedItem item;
  final FeedController controller;
  final VoidCallback onComments;
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
            () => controller.toggleLike(item.game.id),
            active: controller.liked.contains(item.game.id)),
        action(
            context,
            controller.saved.contains(item.game.id)
                ? Icons.bookmark
                : Icons.bookmark_border,
            'Quero jogar',
            () => controller.toggleSave(item.game.id),
            active: controller.saved.contains(item.game.id)),
        action(
            context,
            controller.played.contains(item.game.id)
                ? Icons.check_circle
                : Icons.check_circle_outline,
            'Já joguei',
            () => controller.markPlayed(item.game.id),
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
