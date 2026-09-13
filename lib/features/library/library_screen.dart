import '../game_detail/game_detail_screen.dart';
import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import '../explore/explore_controller.dart';
import '../explore/explore_data.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen(
      {super.key, required this.controller, required this.onExplore});
  final ExploreController controller;
  final VoidCallback onExplore;
  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final search = TextEditingController();
  String category = 'Todos', platform = 'Todas';
  bool list = false, alphabetical = false;
  static const categories = [
    'Todos',
    'Quero jogar',
    'Já joguei',
    'Favoritos',
    'Curtidos',
    'Avaliações'
  ];
  Set<String> ids(String value) {
    final store = widget.controller.library;
    return switch (value) {
      'Quero jogar' => store.saved,
      'Já joguei' => store.played,
      'Favoritos' => store.favorites,
      'Curtidos' => store.liked,
      'Avaliações' => store.ratings.keys.toSet(),
      _ => store.all,
    };
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  void openGame(DiscoveryGame game) => openGameDetails(
      context, game, widget.controller.library, widget.controller.games);

  @override
  Widget build(BuildContext context) => SafeArea(
      bottom: false,
      child: ListenableBuilder(
        listenable: widget.controller,
        builder: (context, _) {
          final controller = widget.controller;
          final catalog = {
            ...controller.library.gamesById,
            for (final game in controller.games) game.id: game,
          };
          final games = catalog.values
              .where((game) =>
                  ids(category).contains(game.id) &&
                  ExploreController.normalize(game.title).contains(
                      ExploreController.normalize(search.text.trim())) &&
                  (platform == 'Todas' || game.platforms.contains(platform)))
              .toList();
          if (alphabetical) games.sort((a, b) => a.title.compareTo(b.title));
          return CustomScrollView(
              key: const PageStorageKey('library-scroll'),
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
                          Text('Minha Biblioteca',
                              style: AppTypography.title(26)),
                          const SizedBox(height: AppSpacing.xxs),
                          Text(
                              '${controller.library.all.length} jogos • Suas próximas aventuras',
                              style: AppTypography.body(12)),
                          const SizedBox(height: AppSpacing.lg),
                          TextField(
                              controller: search,
                              onChanged: (_) => setState(() {}),
                              decoration: InputDecoration(
                                hintText: 'Pesquisar na biblioteca',
                                prefixIcon: const Icon(Icons.search),
                                suffixIcon: search.text.isEmpty
                                    ? null
                                    : IconButton(
                                        tooltip: 'Limpar busca',
                                        onPressed: () => setState(search.clear),
                                        icon: const Icon(Icons.close)),
                              )),
                          const SizedBox(height: AppSpacing.sm),
                          SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                  children: categories
                                      .map((value) => Padding(
                                          padding: const EdgeInsets.only(
                                              right: AppSpacing.xs),
                                          child: ChoiceChip(
                                            label: Text(
                                                '$value (${ids(value).length})'),
                                            selected: category == value,
                                            onSelected: (_) => setState(
                                                () => category = value),
                                          )))
                                      .toList())),
                          const SizedBox(height: AppSpacing.xs),
                          Wrap(
                              spacing: AppSpacing.xs,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                SizedBox(
                                    width: 240,
                                    child: DropdownButton<String>(
                                        isExpanded: true,
                                        value: platform,
                                        underline: const SizedBox(),
                                        items: [
                                          'Todas',
                                          'PC',
                                          'PlayStation',
                                          'Xbox',
                                          'Switch'
                                        ]
                                            .map((value) => DropdownMenuItem(
                                                value: value,
                                                child: Text(
                                                    value == 'Todas'
                                                        ? 'Todas as plataformas'
                                                        : value,
                                                    style: AppTypography.body(
                                                        12))))
                                            .toList(),
                                        onChanged: (value) =>
                                            setState(() => platform = value!))),
                                IconButton(
                                    tooltip: alphabetical
                                        ? 'Ordem do catálogo'
                                        : 'Ordenar de A a Z',
                                    isSelected: alphabetical,
                                    onPressed: () => setState(
                                        () => alphabetical = !alphabetical),
                                    icon: const Icon(Icons.sort_by_alpha)),
                                IconButton(
                                    tooltip: list
                                        ? 'Exibir em grade'
                                        : 'Exibir em lista',
                                    onPressed: () =>
                                        setState(() => list = !list),
                                    icon: Icon(list
                                        ? Icons.grid_view_rounded
                                        : Icons.view_list_outlined)),
                              ]),
                        ]))),
                if (controller.status == ExploreStatus.loading)
                  const SliverToBoxAdapter(
                      child: Center(child: CircularProgressIndicator()))
                else if (controller.status == ExploreStatus.error)
                  SliverToBoxAdapter(
                      child: _message('Não foi possível carregar seus jogos.',
                          'Tentar novamente', controller.load))
                else if (games.isEmpty)
                  SliverToBoxAdapter(
                      child: _message(
                          search.text.isNotEmpty || platform != 'Todas'
                              ? 'Nenhum jogo corresponde à sua busca.'
                              : 'Sua coleção começa aqui.',
                          'Explorar jogos',
                          widget.onExplore))
                else
                  SliverPadding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.margin),
                      sliver:
                          SliverLayoutBuilder(builder: (context, constraints) {
                        final columns = list
                            ? 1
                            : (constraints.crossAxisExtent / 160)
                                .floor()
                                .clamp(2, 4);
                        // Rows grow with text scale, avoiding fixed-height cards on small phones.
                        return SliverList(
                            delegate:
                                SliverChildBuilderDelegate((context, index) {
                          final row = games
                              .skip(index * columns)
                              .take(columns)
                              .toList();
                          return Padding(
                              padding:
                                  const EdgeInsets.only(bottom: AppSpacing.md),
                              child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: List.generate(
                                      columns,
                                      (column) => Expanded(
                                              child: Padding(
                                            padding: EdgeInsets.only(
                                                right: column < columns - 1
                                                    ? AppSpacing.md
                                                    : 0),
                                            child: column >= row.length
                                                ? const SizedBox()
                                                : _LibraryGameCard(
                                                    game: row[column],
                                                    list: list,
                                                    rating: controller
                                                            .library.ratings[
                                                        row[column].id],
                                                    favorite: controller
                                                        .library.favorites
                                                        .contains(
                                                            row[column].id),
                                                    onTap: () =>
                                                        openGame(row[column])),
                                          )))));
                        }, childCount: (games.length / columns).ceil()));
                      })),
                SliverPadding(
                    padding: const EdgeInsets.all(AppSpacing.margin),
                    sliver: SliverToBoxAdapter(
                        child: SurfaceCard(
                      color: AppColors.primary.withValues(alpha: .08),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Mantenha sua coleção viva',
                                style: AppTypography.title(14)),
                            const SizedBox(height: AppSpacing.xs),
                            Text(
                                'Salve suas descobertas, marque o que já jogou e avalie suas aventuras favoritas.',
                                style: AppTypography.body(12)),
                            TextButton(
                                onPressed: widget.onExplore,
                                child: const Text('Descobrir novos jogos →')),
                          ]),
                    ))),
              ]);
        },
      ));

  Widget _message(String title, String action, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.all(AppSpacing.margin),
        child: SurfaceCard(
            child: Column(children: [
          const Icon(Icons.collections_bookmark_outlined,
              size: 40, color: AppColors.primary),
          const SizedBox(height: AppSpacing.md),
          Text(title,
              style: AppTypography.title(17), textAlign: TextAlign.center),
          const SizedBox(height: AppSpacing.xs),
          Text('Os jogos que você salvar aparecem aqui.',
              style: AppTypography.body(), textAlign: TextAlign.center),
          const SizedBox(height: AppSpacing.md),
          FilledButton(onPressed: onTap, child: Text(action)),
        ])),
      );
}

class _LibraryGameCard extends StatelessWidget {
  const _LibraryGameCard(
      {required this.game,
      required this.list,
      required this.rating,
      required this.favorite,
      required this.onTap});
  final DiscoveryGame game;
  final bool list, favorite;
  final int? rating;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final artwork = ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.medium),
        child: AspectRatio(
            aspectRatio: 2 / 3,
            child: Stack(fit: StackFit.expand, children: [
              GameArtwork(appId: game.steamAppId, heroUrl: game.heroUrl, coverUrl: game.coverUrl, title: game.title, cover: true),
              Positioned(
                  top: AppSpacing.xs,
                  left: AppSpacing.xs,
                  child: Container(
                      padding: const EdgeInsets.all(AppSpacing.xxs),
                      decoration: BoxDecoration(
                          color: AppColors.glass,
                          borderRadius: BorderRadius.circular(AppRadius.base)),
                      child: Text('★ ${game.rating}',
                          style: AppTypography.label(10)
                              .copyWith(color: AppColors.positive)))),
              if (favorite)
                const Positioned(
                    bottom: AppSpacing.xs,
                    right: AppSpacing.xs,
                    child: Icon(Icons.favorite, color: AppColors.primary)),
            ])));
    final info =
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(game.title, style: AppTypography.title(14)),
      const SizedBox(height: AppSpacing.xxs),
      Text(game.platforms.join(' • '), style: AppTypography.body(10)),
      Text(game.genre, style: AppTypography.body(10)),
      if (rating != null)
        Text('Sua nota: $rating/5',
            style: AppTypography.label(10).copyWith(color: AppColors.primary)),
    ]);
    return Semantics(
        button: true,
        label: 'Gerenciar ${game.title}',
        child: Material(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.large),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
                onTap: onTap,
                child: list
                    ? Padding(
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        child: Row(children: [
                          SizedBox(width: 80, child: artwork),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(child: info)
                        ]))
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                            artwork,
                            Padding(
                                padding: const EdgeInsets.all(AppSpacing.sm),
                                child: info)
                          ]))));
  }
}
