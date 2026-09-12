import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'feed_controller.dart';

/// Owns the comment draft and releases its resources when the sheet closes.
class FeedCommentsSheet extends StatefulWidget {
  const FeedCommentsSheet(
      {super.key,
      required this.controller,
      required this.item,
      required this.onProtected});
  final FeedController controller;
  final FeedItem item;
  final Future<void> Function(BuildContext, VoidCallback) onProtected;
  @override
  State<FeedCommentsSheet> createState() => _FeedCommentsSheetState();
}

class _FeedCommentsSheetState extends State<FeedCommentsSheet> {
  final _input = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _requireAccount(VoidCallback action) =>
      widget.onProtected(context, () {
        if (mounted) action();
      });

  void _send(String value) {
    if (value.trim().isEmpty) return;
    widget.controller.addComment(widget.item.game.id, value);
    _input.clear();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final comments = widget.controller.commentsFor(widget.item);
        return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                  child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                          color: AppColors.muted,
                          borderRadius: BorderRadius.circular(4)))),
              const SizedBox(height: AppSpacing.md),
              Row(children: [
                Expanded(
                    child: Text('Comentários', style: AppTypography.title(20))),
                Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
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
                      left: comment.reply ? AppSpacing.lg : 0,
                      bottom: AppSpacing.sm),
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
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                  Row(children: [
                                    Expanded(
                                        child: Text('@${comment.user}',
                                            style: AppTypography.label(11))),
                                    Text(comment.time,
                                        style: AppTypography.body(10))
                                  ]),
                                  const SizedBox(height: AppSpacing.xs),
                                  Text(comment.text,
                                      style: AppTypography.body(13)
                                          .copyWith(color: AppColors.text)),
                                  const SizedBox(height: AppSpacing.xs),
                                  Row(children: [
                                    IconButton(
                                        tooltip: 'Curtir comentário',
                                        onPressed: () => _requireAccount(() =>
                                            widget.controller.toggleCommentLike(
                                                widget.item.game.id, comment)),
                                        icon: Icon(
                                            widget.controller.isCommentLiked(
                                                    widget.item.game.id,
                                                    comment)
                                                ? Icons.favorite
                                                : Icons.favorite_border,
                                            size: 16,
                                            color: widget.controller
                                                    .isCommentLiked(
                                                        widget.item.game.id,
                                                        comment)
                                                ? AppColors.primary
                                                : AppColors.muted)),
                                    Text(
                                        '${widget.controller.commentLikeCount(widget.item.game.id, comment)}',
                                        style: AppTypography.label(10).copyWith(
                                            color: AppColors.secondary)),
                                    const SizedBox(width: AppSpacing.md),
                                    InkWell(
                                        onTap: () => _requireAccount(() {
                                              _input.text = '@${comment.user} ';
                                              _focus.requestFocus();
                                              _input.selection =
                                                  TextSelection.collapsed(
                                                      offset:
                                                          _input.text.length);
                                            }),
                                        child: Text('Responder',
                                            style: AppTypography.label(10)
                                                .copyWith(
                                                    color: AppColors.primary)))
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
                            controller: _input,
                            focusNode: _focus,
                            textInputAction: TextInputAction.send,
                            onSubmitted: (value) =>
                                _requireAccount(() => _send(value)),
                            decoration: const InputDecoration(
                                hintText: 'Adicione um comentário…',
                                prefixIcon:
                                    Icon(Icons.alternate_email, size: 18)))),
                    const SizedBox(width: AppSpacing.xs),
                    IconButton.filled(
                        tooltip: 'Enviar comentário',
                        onPressed: () =>
                            _requireAccount(() => _send(_input.text)),
                        icon: const Icon(Icons.send_rounded))
                  ]))
            ]);
      });
}
