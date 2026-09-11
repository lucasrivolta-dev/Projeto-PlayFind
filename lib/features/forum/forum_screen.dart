import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import '../explore/explore_data.dart';
import 'forum_controller.dart';
import 'forum_topic_screen.dart';

class ForumScreen extends StatelessWidget {
  const ForumScreen({super.key, required this.controller, required this.games});
  final ForumController controller;
  final List<DiscoveryGame> games;

  void open(BuildContext context, ForumTopic topic) =>
      Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) =>
              ForumTopicScreen(controller: controller, topic: topic)));
  @override
  Widget build(BuildContext context) => SafeArea(
      bottom: false,
      child: ListenableBuilder(
          listenable: controller,
          builder: (context, _) => CustomScrollView(
                  key: const PageStorageKey('forum-scroll'),
                  slivers: [
                    SliverPadding(
                        padding: const EdgeInsets.all(AppSpacing.margin),
                        sliver: SliverToBoxAdapter(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              Row(children: [
                                const Icon(Icons.play_arrow_rounded,
                                    color: AppColors.primary),
                                const SizedBox(width: AppSpacing.xs),
                                Text('NextPlay', style: AppTypography.label())
                              ]),
                              const SizedBox(height: AppSpacing.lg),
                              Text('Comunidade & Fórum',
                                  style: AppTypography.title(26)),
                              const SizedBox(height: AppSpacing.xs),
                              Text('Boas conversas começam com um jogo.',
                                  style: AppTypography.body()),
                              const SizedBox(height: AppSpacing.md),
                              FilledButton.icon(
                                  onPressed: () async {
                                    final topic = await Navigator.of(context)
                                        .push<ForumTopic>(MaterialPageRoute(
                                            builder: (_) => CreateTopicScreen(
                                                controller: controller,
                                                games: games)));
                                    if (topic != null && context.mounted) {
                                      open(context, topic);
                                    }
                                  },
                                  icon: const Icon(Icons.add),
                                  label: const Text('Criar tópico')),
                              const SizedBox(height: AppSpacing.md),
                              TextField(
                                  onChanged: controller.search,
                                  decoration: const InputDecoration(
                                      prefixIcon: Icon(Icons.search),
                                      hintText:
                                          'Pesquisar discussões e jogos…')),
                              const SizedBox(height: AppSpacing.sm),
                              SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                      children: ForumController.categories
                                          .map((category) => Padding(
                                              padding: const EdgeInsets.only(
                                                  right: AppSpacing.xs),
                                              child: ChoiceChip(
                                                  label: Text(category),
                                                  selected:
                                                      controller.category ==
                                                          category,
                                                  onSelected: (_) =>
                                                      controller.selectCategory(
                                                          category))))
                                          .toList())),
                              if (!controller.loading &&
                                  !controller.error &&
                                  controller.results.isNotEmpty) ...[
                                const SectionHeading(
                                    title: 'Tópicos em alta',
                                    icon: Icons.local_fire_department_outlined),
                                ...controller.trending.map((topic) => Padding(
                                    padding: const EdgeInsets.only(
                                        bottom: AppSpacing.sm),
                                    child: ForumTopicCard(
                                        topic: topic,
                                        onTap: () => open(context, topic),
                                        onLike: () => controller.like(topic)))),
                                const SectionHeading(
                                    title: 'Tópicos recentes',
                                    icon: Icons.forum_outlined),
                              ],
                            ]))),
                    if (controller.loading)
                      const SliverToBoxAdapter(
                          child: Center(child: CircularProgressIndicator()))
                    else if (controller.error)
                      SliverToBoxAdapter(
                          child: Padding(
                              padding: const EdgeInsets.all(AppSpacing.margin),
                              child: Column(children: [
                                const Text(
                                    'Não conseguimos carregar as discussões.'),
                                TextButton(
                                    onPressed: controller.load,
                                    child: const Text('Tentar novamente'))
                              ])))
                    else if (controller.results.isEmpty)
                      SliverToBoxAdapter(
                          child: Padding(
                              padding: const EdgeInsets.all(AppSpacing.margin),
                              child: SurfaceCard(
                                  child: Column(children: [
                                const Icon(Icons.chat_bubble_outline,
                                    color: AppColors.primary),
                                const SizedBox(height: AppSpacing.sm),
                                Text('Nenhuma discussão encontrada',
                                    style: AppTypography.title(17)),
                                const SizedBox(height: AppSpacing.xs),
                                Text(
                                    'Experimente outra busca ou comece uma conversa.',
                                    style: AppTypography.body())
                              ]))))
                    else
                      SliverPadding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.margin),
                          sliver: SliverList.builder(
                              itemCount: controller.results.length,
                              itemBuilder: (context, index) {
                                final topic = controller.results[index];
                                return Padding(
                                    padding: const EdgeInsets.only(
                                        bottom: AppSpacing.sm),
                                    child: ForumTopicCard(
                                        topic: topic,
                                        onTap: () => open(context, topic),
                                        onLike: () => controller.like(topic)));
                              })),
                    const SliverToBoxAdapter(
                        child: SizedBox(height: AppSpacing.lg)),
                  ])));
}

class ForumTopicCard extends StatelessWidget {
  const ForumTopicCard(
      {super.key,
      required this.topic,
      required this.onTap,
      required this.onLike});
  final ForumTopic topic;
  final VoidCallback onTap, onLike;
  @override
  Widget build(BuildContext context) => Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.large),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
          onTap: onTap,
          child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ForumAuthor(author: topic.author, time: topic.time),
                    const SizedBox(height: AppSpacing.sm),
                    Text(topic.category.toUpperCase(),
                        style: AppTypography.label(10)
                            .copyWith(color: AppColors.positive)),
                    const SizedBox(height: AppSpacing.xs),
                    Text(topic.title, style: AppTypography.title(17)),
                    const SizedBox(height: AppSpacing.xs),
                    Text(topic.body,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.body(12)),
                    if (topic.game != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      GenreChip(topic.game!)
                    ],
                    Wrap(
                        spacing: AppSpacing.sm,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          TextButton.icon(
                              onPressed: onLike,
                              icon: Icon(
                                  topic.liked
                                      ? Icons.favorite
                                      : Icons.favorite_border,
                                  size: 18),
                              label: Text('${topic.likeCount}')),
                          TextButton.icon(
                              onPressed: onTap,
                              icon: const Icon(Icons.chat_bubble_outline,
                                  size: 18),
                              label: Text('${topic.replies.length} respostas')),
                        ]),
                  ]))));
}

class ForumAuthor extends StatelessWidget {
  const ForumAuthor({super.key, required this.author, required this.time});
  final String author, time;
  @override
  Widget build(BuildContext context) => Row(children: [
        CircleAvatar(
            radius: 16,
            backgroundColor: AppColors.primary.withValues(alpha: .16),
            child: Text(author.substring(0, 1).toUpperCase(),
                style:
                    AppTypography.label().copyWith(color: AppColors.primary))),
        const SizedBox(width: AppSpacing.xs),
        Expanded(child: Text('@$author', style: AppTypography.label(10))),
        const SizedBox(width: AppSpacing.xs),
        Text(time, style: AppTypography.body(10)),
      ]);
}

class CreateTopicScreen extends StatefulWidget {
  const CreateTopicScreen(
      {super.key,
      required this.controller,
      required this.games,
      this.initialGame});
  final ForumController controller;
  final List<DiscoveryGame> games;
  final String? initialGame;
  @override
  State<CreateTopicScreen> createState() => _CreateTopicScreenState();
}

class _CreateTopicScreenState extends State<CreateTopicScreen> {
  final form = GlobalKey<FormState>();
  final title = TextEditingController(),
      body = TextEditingController(),
      tags = TextEditingController();
  String category = 'Geral';
  late String? game = widget.initialGame;
  @override
  void dispose() {
    title.dispose();
    body.dispose();
    tags.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Criar tópico')),
      body: SafeArea(
          child: Form(
              key: form,
              child: ListView(
                  padding: const EdgeInsets.all(AppSpacing.margin),
                  children: [
                    Text('Compartilhe uma ideia',
                        style: AppTypography.title(26)),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                        'Uma pergunta, uma descoberta ou uma boa recomendação.',
                        style: AppTypography.body()),
                    const SizedBox(height: AppSpacing.lg),
                    TextFormField(
                        controller: title,
                        maxLength: 120,
                        decoration: const InputDecoration(
                            labelText: 'Título',
                            hintText: 'Sobre o que você quer conversar?'),
                        validator: (value) => (value ?? '').trim().length < 5
                            ? 'Escreva um título com pelo menos 5 caracteres.'
                            : null),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                        controller: body,
                        minLines: 5,
                        maxLines: 10,
                        maxLength: 5000,
                        decoration: const InputDecoration(
                            labelText: 'Texto',
                            hintText: 'Escreva sua publicação…'),
                        validator: (value) => (value ?? '').trim().length < 10
                            ? 'Escreva pelo menos 10 caracteres.'
                            : null),
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<String>(
                        initialValue: category,
                        isExpanded: true,
                        decoration:
                            const InputDecoration(labelText: 'Categoria'),
                        items: ForumController.categories
                            .skip(1)
                            .map((value) => DropdownMenuItem(
                                value: value, child: Text(value)))
                            .toList(),
                        onChanged: (value) => category = value!),
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<String>(
                        initialValue: game,
                        isExpanded: true,
                        decoration: const InputDecoration(
                            labelText: 'Jogo relacionado (opcional)'),
                        items: [
                          const DropdownMenuItem<String>(
                              value: '', child: Text('Nenhum')),
                          ...widget.games.map((game) => DropdownMenuItem(
                              value: game.title,
                              child: Text(game.title,
                                  overflow: TextOverflow.ellipsis)))
                        ],
                        onChanged: (value) =>
                            game = value == '' ? null : value),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                        controller: tags,
                        maxLength: 100,
                        decoration: const InputDecoration(
                            labelText: 'Tags (opcional)',
                            hintText: 'RPG, co-op, sem spoilers')),
                    const SizedBox(height: AppSpacing.lg),
                    FilledButton(
                        onPressed: () {
                          if (!form.currentState!.validate()) return;
                          final topic = widget.controller.create(
                              title: title.text,
                              body: body.text,
                              category: category,
                              game: game,
                              tags: tags.text
                                  .split(',')
                                  .map((tag) => tag.trim())
                                  .where((tag) => tag.isNotEmpty)
                                  .take(5)
                                  .toList());
                          if (topic != null) Navigator.pop(context, topic);
                        },
                        child: const Text('Publicar tópico')),
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Cancelar')),
                  ]))));
}
