import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import '../explore/explore_data.dart';
import '../library/library_store.dart';
import '../forum/forum_controller.dart';
import '../forum/forum_screen.dart';
import '../forum/forum_topic_screen.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_guard.dart';

class GameDetailScope extends InheritedWidget {
  const GameDetailScope({super.key, required this.forum, this.auth, required super.child});
  final ForumController forum;
  final AuthController? auth;
  @override
  bool updateShouldNotify(GameDetailScope oldWidget) =>
      forum != oldWidget.forum;
}

Future<void> openGameDetails(BuildContext context, DiscoveryGame game,
    LibraryStore library, List<DiscoveryGame> catalog) {
  final forum = context.getInheritedWidgetOfExactType<GameDetailScope>()?.forum;
  final auth = context.getInheritedWidgetOfExactType<GameDetailScope>()?.auth;
  return Navigator.of(context).push<void>(MaterialPageRoute(
      builder: (_) => GameDetailScreen(
          game: game, library: library, catalog: catalog, forum: forum, auth: auth)));
}

class GameDetailScreen extends StatelessWidget {
  const GameDetailScreen(
      {super.key,
      required this.game,
      required this.library,
      required this.catalog,
      this.forum,
      this.auth});
  final AuthController? auth;
  final DiscoveryGame game;
  final LibraryStore library;
  final List<DiscoveryGame> catalog;
  final ForumController? forum;
  Future<void> copy(BuildContext context, String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Link copiado.')));
    }
  }

  String get storeUrl => 'https://store.steampowered.com/app/${game.id}/';
  void evaluate(BuildContext context) => showAppSheet(
      context,
      ListenableBuilder(
          listenable: library,
          builder: (context, _) => Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Sua avaliação', style: AppTypography.title()),
                    Text(game.title, style: AppTypography.body()),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                        children: List.generate(
                            5,
                            (index) => IconButton(
                                tooltip:
                                    '${index + 1} estrela${index == 0 ? '' : 's'}',
                                onPressed: () => requireAuthentication(context, auth,
                                    () => library.rate(game.id, index + 1)),
                                icon: Icon(
                                    index < (library.ratings[game.id] ?? 0)
                                        ? Icons.star_rounded
                                        : Icons.star_outline_rounded,
                                    color: AppColors.primary)))),
                    if (library.ratings.containsKey(game.id))
                      TextButton(
                          onPressed: () => requireAuthentication(context, auth,
                              () => library.removeRating(game.id)),
                          child: const Text('Remover avaliação')),
                  ])));
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(
          title: Text('Detalhes do jogo', style: AppTypography.title(17)),
          actions: [
            IconButton(
                tooltip: 'Copiar link do jogo',
                onPressed: () => copy(context, storeUrl),
                icon: const Icon(Icons.share_outlined))
          ]),
      body: SafeArea(
          top: false,
          child: ListenableBuilder(
              listenable: library,
              builder: (context, _) => CustomScrollView(slivers: [
                    SliverToBoxAdapter(child: _GameHero(game: game)),
                    SliverPadding(
                        padding: const EdgeInsets.all(AppSpacing.margin),
                        sliver: SliverToBoxAdapter(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                              Wrap(
                                  spacing: AppSpacing.xs,
                                  runSpacing: AppSpacing.xs,
                                  children: [
                                    FilledButton.icon(
                                        onPressed: () => requireAuthentication(context, auth,
                                            () => library.toggleSaved(game.id)),
                                        icon: Icon(
                                            library.saved.contains(game.id)
                                                ? Icons.bookmark_added
                                                : Icons.bookmark_add_outlined),
                                        label: Text(
                                            library.saved.contains(game.id)
                                                ? 'Salvo em Quero jogar'
                                                : 'Quero jogar')),
                                    OutlinedButton.icon(
                                        onPressed: () => requireAuthentication(context, auth,
                                            () => library.togglePlayed(game.id)),
                                        icon: Icon(
                                            library.played.contains(game.id)
                                                ? Icons.check_circle
                                                : Icons.check_circle_outline,
                                            color:
                                                library.played.contains(game.id)
                                                    ? AppColors.positive
                                                    : AppColors.secondary),
                                        label: const Text('Já joguei')),
                                    IconButton.filledTonal(
                                        tooltip:
                                            library.favorites.contains(game.id)
                                                ? 'Remover dos favoritos'
                                                : 'Favoritar',
                                        onPressed: () => requireAuthentication(context, auth,
                                            () => library.toggleFavorite(game.id)),
                                        icon: Icon(
                                            library.favorites.contains(game.id)
                                                ? Icons.star
                                                : Icons.star_border)),
                                    OutlinedButton.icon(
                                        onPressed: () => requireAuthentication(context, auth,
                                            () => evaluate(context)),
                                        icon: const Icon(Icons.edit_outlined),
                                        label: Text(library.ratings
                                                .containsKey(game.id)
                                            ? 'Sua nota: ${library.ratings[game.id]}/5'
                                            : 'Avaliar')),
                                  ]),
                              const SizedBox(height: AppSpacing.md),
                              LayoutBuilder(builder: (context, constraints) {
                                final width = MediaQuery.textScalerOf(context)
                                            .scale(14) >
                                        22
                                    ? constraints.maxWidth
                                    : (constraints.maxWidth - AppSpacing.xs) /
                                        2;
                                return Wrap(
                                    spacing: AppSpacing.xs,
                                    runSpacing: AppSpacing.xs,
                                    children: [
                                      _InfoTile(
                                          width: width,
                                          icon: Icons.sports_esports_outlined,
                                          label: 'GÊNERO',
                                          value: game.genre),
                                      _InfoTile(
                                          width: width,
                                          icon: Icons.calendar_today_outlined,
                                          label: 'LANÇAMENTO',
                                          value: game.releaseDate ??
                                              'Não informado'),
                                      _InfoTile(
                                          width: width,
                                          icon: Icons.person_outline,
                                          label: 'MODO',
                                          value: game.mode ?? 'Não informado'),
                                      _InfoTile(
                                          width: width,
                                          icon: Icons.devices_outlined,
                                          label: 'PLATAFORMAS',
                                          value: game.platforms.join(', ')),
                                    ]);
                              }),
                              const SectionHeading(
                                  title: 'Sobre o jogo',
                                  icon: Icons.info_outline),
                              SurfaceCard(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Text(game.description,
                                        style: AppTypography.body(15)),
                                    const SizedBox(height: AppSpacing.md),
                                    Text('Desenvolvedora',
                                        style: AppTypography.label(10)),
                                    Text(game.studio,
                                        style: AppTypography.body()),
                                    if (game.publisher != null) ...[
                                      const SizedBox(height: AppSpacing.sm),
                                      Text('Publisher',
                                          style: AppTypography.label(10)),
                                      Text(game.publisher!,
                                          style: AppTypography.body())
                                    ],
                                    if (game.tags.isNotEmpty) ...[
                                      const SizedBox(height: AppSpacing.md),
                                      Wrap(
                                          spacing: AppSpacing.xs,
                                          runSpacing: AppSpacing.xs,
                                          children: game.tags
                                              .map(GenreChip.new)
                                              .toList())
                                    ]
                                  ])),
                              const SectionHeading(
                                  title: 'Vídeos e gameplay',
                                  icon: Icons.videocam_outlined),
                              SurfaceCard(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    ClipRRect(
                                        borderRadius: BorderRadius.circular(
                                            AppRadius.medium),
                                        child: AspectRatio(
                                            aspectRatio: 16 / 9,
                                            child: GameArtwork(
                                                appId: game.steamAppId, heroUrl: game.heroUrl, coverUrl: game.coverUrl,
                                                title: game.title))),
                                    const SizedBox(height: AppSpacing.sm),
                                    Text('Explore o universo de ${game.title}',
                                        style: AppTypography.title(14)),
                                    const SizedBox(height: AppSpacing.xs),
                                    Text(
                                        'Ainda não há vídeos cadastrados. Consulte os trailers na página do jogo na Steam.',
                                        style: AppTypography.body(12)),
                                    TextButton.icon(
                                        onPressed: () =>
                                            copy(context, storeUrl),
                                        icon: const Icon(Icons.copy_outlined),
                                        label: const Text(
                                            'Copiar link da página')),
                                  ])),
                              const SectionHeading(
                                  title: 'Onde jogar e preços',
                                  icon: Icons.sell_outlined),
                              SurfaceCard(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Row(children: [
                                      const Icon(Icons.desktop_windows_outlined,
                                          color: AppColors.secondary),
                                      const SizedBox(width: AppSpacing.sm),
                                      Expanded(
                                          child: Text('Steam',
                                              style: AppTypography.title(17))),
                                      GenreChip(game.free ? 'Grátis' : 'PC')
                                    ]),
                                    const SizedBox(height: AppSpacing.xs),
                                    Text(
                                        game.free
                                            ? 'Jogo gratuito no catálogo demonstrativo.'
                                            : 'Preço atualizado ainda não disponível.',
                                        style: AppTypography.body(12)),
                                    TextButton(
                                        onPressed: () =>
                                            copy(context, storeUrl),
                                        child:
                                            const Text('Copiar link da loja')),
                                  ])),
                              const SectionHeading(
                                  title: 'Jogos parecidos',
                                  icon: Icons.auto_awesome_outlined),
                              _SimilarGames(
                                  game: game,
                                  catalog: catalog,
                                  onOpen: (related) => Navigator.of(context)
                                      .push(MaterialPageRoute<void>(
                                          builder: (_) => GameDetailScreen(
                                              game: related,
                                              library: library,
                                              catalog: catalog,
                                              forum: forum)))),
                              const SectionHeading(
                                  title: 'Comunidade & Fórum',
                                  icon: Icons.forum_outlined),
                              if (forum == null)
                                Text(
                                    'As discussões estarão disponíveis na comunidade.',
                                    style: AppTypography.body())
                              else
                                _GameCommunity(
                                    game: game,
                                    catalog: catalog,
                                    forum: forum!),
                              const SizedBox(height: AppSpacing.lg),
                            ]))),
                  ]))));
}

class _GameHero extends StatelessWidget {
  const _GameHero({required this.game});
  final DiscoveryGame game;
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AspectRatio(
            aspectRatio: 16 / 9,
            child: Stack(fit: StackFit.expand, children: [
              GameArtwork(appId: game.steamAppId, heroUrl: game.heroUrl, coverUrl: game.coverUrl, title: game.title),
              const DecoratedBox(
                  decoration: BoxDecoration(
                      gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [AppColors.transparent, AppColors.canvas])))
            ])),
        Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.margin),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(
                  width: 80,
                  child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.medium),
                      child: AspectRatio(
                          aspectRatio: 2 / 3,
                          child: GameArtwork(
                              appId: game.steamAppId, heroUrl: game.heroUrl, coverUrl: game.coverUrl,
                              title: game.title,
                              cover: true)))),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('DESCUBRA SEU PRÓXIMO JOGO',
                        style: AppTypography.label(10)
                            .copyWith(color: AppColors.primary)),
                    Text(game.title, style: AppTypography.title(26)),
                    Text(game.studio, style: AppTypography.body(12)),
                    const SizedBox(height: AppSpacing.xs),
                    Text('★ ${game.rating} / 10',
                        style: AppTypography.label()
                            .copyWith(color: AppColors.positive))
                  ])),
            ])),
      ]);
}

class _InfoTile extends StatelessWidget {
  const _InfoTile(
      {required this.width,
      required this.icon,
      required this.label,
      required this.value});
  final double width;
  final IconData icon;
  final String label, value;
  @override
  Widget build(BuildContext context) => SizedBox(
      width: width,
      child: SurfaceCard(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: AppSpacing.xxs, children: [
              Icon(icon, size: 14, color: AppColors.secondary),
              Text(label,
                  style: AppTypography.label(10)
                      .copyWith(color: AppColors.secondary))
            ]),
            const SizedBox(height: AppSpacing.xxs),
            Text(value, style: AppTypography.title(14))
          ])));
}

class _SimilarGames extends StatelessWidget {
  const _SimilarGames(
      {required this.game, required this.catalog, required this.onOpen});
  final DiscoveryGame game;
  final List<DiscoveryGame> catalog;
  final ValueChanged<DiscoveryGame> onOpen;
  @override
  Widget build(BuildContext context) {
    final similar = catalog
        .where((other) =>
            other.id != game.id &&
            (other.genre == game.genre || other.tags.any(game.tags.contains)))
        .take(4)
        .toList();
    if (similar.isEmpty) {
      return Text('Ainda não há jogos parecidos neste catálogo.',
          style: AppTypography.body());
    }
    return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: similar
                .map((other) => Padding(
                    padding: const EdgeInsets.only(right: AppSpacing.sm),
                    child: SizedBox(
                        width: 152,
                        child: Material(
                            color: AppColors.surface,
                            borderRadius:
                                BorderRadius.circular(AppRadius.medium),
                            clipBehavior: Clip.antiAlias,
                            child: InkWell(
                                onTap: () => onOpen(other),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      AspectRatio(
                                          aspectRatio: 2 / 3,
                                          child: GameArtwork(
                                              appId: other.steamAppId, heroUrl: other.heroUrl, coverUrl: other.coverUrl,
                                              title: other.title,
                                              cover: true)),
                                      Padding(
                                          padding: const EdgeInsets.all(
                                              AppSpacing.xs),
                                          child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(other.title,
                                                    style: AppTypography.title(
                                                        14)),
                                                Text(other.genre,
                                                    style:
                                                        AppTypography.body(12))
                                              ]))
                                    ]))))))
                .toList()));
  }
}

class _GameCommunity extends StatelessWidget {
  const _GameCommunity(
      {required this.game, required this.catalog, required this.forum});
  final DiscoveryGame game;
  final List<DiscoveryGame> catalog;
  final ForumController forum;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
      listenable: forum,
      builder: (context, _) {
        final topics =
            forum.topics.where((topic) => topic.game == game.title).toList();
        return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (forum.loading)
                const LinearProgressIndicator()
              else if (forum.error)
                TextButton(
                    onPressed: forum.load,
                    child: const Text('Recarregar discussões'))
              else if (topics.isEmpty)
                Text(
                    'Nenhuma discussão sobre este jogo ainda. Comece a conversa!',
                    style: AppTypography.body())
              else
                ...topics.map((topic) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: ForumTopicCard(
                        topic: topic,
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                                builder: (_) => ForumTopicScreen(
                                    controller: forum, topic: topic))),
                        onLike: () => forum.like(topic)))),
              const SizedBox(height: AppSpacing.md),
              FilledButton.icon(
                  onPressed: () async {
                    final topic = await Navigator.of(context).push<ForumTopic>(
                        MaterialPageRoute(
                            builder: (_) => CreateTopicScreen(
                                controller: forum,
                                games: catalog,
                                initialGame: game.title)));
                    if (topic != null && context.mounted) {
                      Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => ForumTopicScreen(
                              controller: forum, topic: topic)));
                    }
                  },
                  icon: const Icon(Icons.add_comment_outlined),
                  label: const Text('Iniciar discussão')),
            ]);
      });
}
