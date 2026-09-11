import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'forum_controller.dart';
import 'forum_screen.dart';

class ForumTopicScreen extends StatefulWidget {
  const ForumTopicScreen(
      {super.key, required this.controller, required this.topic});
  final ForumController controller;
  final ForumTopic topic;
  @override
  State<ForumTopicScreen> createState() => _ForumTopicScreenState();
}

class _ForumTopicScreenState extends State<ForumTopicScreen> {
  final text = TextEditingController();
  final focus = FocusNode();
  ForumReply? replyingTo;
  @override
  void dispose() {
    text.dispose();
    focus.dispose();
    super.dispose();
  }

  Widget replyTile(ForumReply reply) => Padding(
      padding: EdgeInsets.only(
          left: reply.parentId == null ? 0 : AppSpacing.md,
          bottom: AppSpacing.sm),
      child: SurfaceCard(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ForumAuthor(author: reply.author, time: 'agora'),
        const SizedBox(height: AppSpacing.sm),
        Text(reply.text,
            style: AppTypography.body().copyWith(color: AppColors.text)),
        Wrap(children: [
          TextButton.icon(
              onPressed: () => widget.controller.likeReply(reply),
              icon: Icon(reply.liked ? Icons.favorite : Icons.favorite_border,
                  size: 18),
              label: Text(reply.liked ? '1' : 'Curtir')),
          TextButton(
              onPressed: () {
                setState(() => replyingTo = reply);
                focus.requestFocus();
              },
              child: const Text('Responder'))
        ]),
      ])));
  @override
  Widget build(BuildContext context) => ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final topic = widget.topic;
        // Flatten each reply tree into reading order while keeping indentation bounded.
        List<ForumReply> descendants(int? parent) => topic.replies
            .where((reply) => reply.parentId == parent)
            .expand((reply) => [reply, ...descendants(reply.id)])
            .toList();
        final replies = descendants(null);
        return Scaffold(
            appBar: AppBar(title: const Text('Discussão'), actions: [
              IconButton(
                  tooltip:
                      topic.following ? 'Deixar de seguir' : 'Seguir discussão',
                  onPressed: () => widget.controller.follow(topic),
                  icon: Icon(topic.following
                      ? Icons.notifications_active
                      : Icons.notifications_none))
            ]),
            body: SafeArea(
                child: Column(children: [
              Expanded(
                  child: ListView(
                      padding: const EdgeInsets.all(AppSpacing.margin),
                      children: [
                    ForumAuthor(author: topic.author, time: topic.time),
                    const SizedBox(height: AppSpacing.lg),
                    Text(topic.title, style: AppTypography.title(26)),
                    const SizedBox(height: AppSpacing.md),
                    Text(topic.body,
                        style: AppTypography.body(15)
                            .copyWith(color: AppColors.text)),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                        spacing: AppSpacing.xs,
                        runSpacing: AppSpacing.xs,
                        children: [
                          GenreChip(topic.category),
                          if (topic.game != null) GenreChip(topic.game!),
                          ...topic.tags.map(GenreChip.new)
                        ]),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(children: [
                      TextButton.icon(
                          onPressed: () => widget.controller.like(topic),
                          icon: Icon(topic.liked
                              ? Icons.favorite
                              : Icons.favorite_border),
                          label: Text('${topic.likeCount} curtidas')),
                      TextButton.icon(
                          onPressed: () async {
                            await Clipboard.setData(ClipboardData(
                                text: '${topic.title}\n\n${topic.body}'));
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content:
                                          Text('Texto da discussão copiado.')));
                            }
                          },
                          icon: const Icon(Icons.copy_outlined),
                          label: const Text('Copiar discussão'))
                    ]),
                    SectionHeading(
                        title: '${topic.replies.length} respostas',
                        icon: Icons.chat_bubble_outline),
                    if (replies.isEmpty)
                      Text(
                          'Seja a primeira pessoa a participar dessa conversa.',
                          style: AppTypography.body()),
                    ...replies.map(replyTile),
                  ])),
              Container(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  decoration: const BoxDecoration(
                      color: AppColors.surface,
                      border: Border(top: BorderSide(color: AppColors.border))),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    if (replyingTo != null)
                      Row(children: [
                        Expanded(
                            child: Text('Respondendo a @${replyingTo!.author}',
                                style: AppTypography.body(12))),
                        IconButton(
                            tooltip: 'Cancelar resposta',
                            onPressed: () => setState(() => replyingTo = null),
                            icon: const Icon(Icons.close))
                      ]),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Expanded(
                          child: TextField(
                              controller: text,
                              focusNode: focus,
                              minLines: 1,
                              maxLines: 4,
                              decoration: const InputDecoration(
                                  hintText: 'Escreva uma resposta…'))),
                      IconButton.filled(
                          tooltip: 'Enviar resposta',
                          onPressed: () {
                            if (widget.controller.reply(topic, text.text,
                                parentId: replyingTo?.id)) {
                              text.clear();
                              setState(() => replyingTo = null);
                              focus.unfocus();
                            }
                          },
                          icon: const Icon(Icons.send_rounded))
                    ]),
                  ])),
            ])));
      });
}
