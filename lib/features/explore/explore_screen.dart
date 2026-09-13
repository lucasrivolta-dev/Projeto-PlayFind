import '../game_detail/game_detail_screen.dart';
import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'explore_controller.dart';
import 'explore_data.dart';
import 'explore_widgets.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_guard.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key, required this.controller, this.auth});
  final ExploreController controller;
  final AuthController? auth;
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final search = TextEditingController();
  final discoveryKey = GlobalKey();
  ExploreController get controller => widget.controller;
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  void clearFilters() {
    search.clear();
    controller.resetFilters();
  }

  void showGame(DiscoveryGame game) =>
      openGameDetails(context, game, controller.library, controller.games);

  void showCollection(String title, List<DiscoveryGame> games) =>
      showAppSheet<void>(
          context,
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: AppTypography.title()),
            const SizedBox(height: AppSpacing.md),
            if (games.isEmpty)
              Text(
                  'Você ainda não salvou nenhum jogo. Abra um jogo e toque em Quero jogar.',
                  style: AppTypography.body())
            else
              gameGrid(games),
          ]));

  Widget gameGrid(List<DiscoveryGame> games) =>
      LayoutBuilder(builder: (context, constraints) {
        final width = (constraints.maxWidth - AppSpacing.md) / 2;
        return Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.lg,
            children: games
                .map((game) => ExploreGameCard(
                    game: game, width: width, onTap: () => showGame(game)))
                .toList());
      });

  void filters() => showAppSheet<void>(
      context,
      ListenableBuilder(
          listenable: controller,
          builder: (context, _) =>
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Onde você joga?', style: AppTypography.title()),
                const SizedBox(height: AppSpacing.xs),
                Text('Combine uma plataforma com a busca e os gêneros.',
                    style: AppTypography.body()),
                const SizedBox(height: AppSpacing.md),
                Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: ['Todas', 'PC', 'PlayStation', 'Xbox', 'Switch']
                        .map((platform) => ChoiceChip(
                            label: Text(platform),
                            selected: controller.platform == platform,
                            onSelected: (_) =>
                                controller.selectPlatform(platform)))
                        .toList()),
                const SizedBox(height: AppSpacing.lg),
                FilledButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Ver jogos')),
              ])));

  @override
  Widget build(BuildContext context) => SafeArea(
      bottom: false,
      child: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: ListenableBuilder(
                  listenable: controller,
                  builder: (context, _) {
                    if (controller.status == ExploreStatus.loading) {
                      return const Center(
                          child: CircularProgressIndicator(
                              semanticsLabel: 'Carregando jogos'));
                    }
                    if (controller.status == ExploreStatus.error) {
                      return Center(
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                        Text('Não foi possível carregar os jogos.',
                            style: AppTypography.body()),
                        FilledButton(
                            onPressed: controller.load,
                            child: const Text('Tentar novamente')),
                      ]));
                    }
                    final nextGame = controller.nextGame;
                    return RefreshIndicator(
                        onRefresh: controller.load,
                        child: ListView(
                            key: const PageStorageKey('explore-scroll'),
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(
                                AppSpacing.margin,
                                AppSpacing.md,
                                AppSpacing.margin,
                                AppSpacing.xl),
                            children: [
                              Row(children: [
                                const Icon(Icons.play_arrow_rounded,
                                    color: AppColors.primary, size: 24),
                                const SizedBox(width: AppSpacing.xxs),
                                Expanded(
                                    child: Text('NextPlay',
                                        style: AppTypography.label(14))),
                                IconButton(
                                    tooltip: 'Jogos salvos nesta sessão',
                                    onPressed: () => showCollection(
                                        'Quero jogar',
                                        controller.games
                                            .where((game) => controller.saved
                                                .contains(game.id))
                                            .toList()),
                                    icon: Badge(
                                        isLabelVisible:
                                            controller.saved.isNotEmpty,
                                        label:
                                            Text('${controller.saved.length}'),
                                        child: const Icon(Icons.bookmark_border,
                                            size: 20)))
                              ]),
                              const SizedBox(height: AppSpacing.md),
                              Text('Explorar', style: AppTypography.title(26)),
                              const SizedBox(height: AppSpacing.xxs),
                              Text('Seu próximo jogo está por aqui.',
                                  style: AppTypography.body(14)),
                              const SizedBox(height: AppSpacing.lg),
                              Row(children: [
                                Expanded(
                                    child: TextField(
                                        controller: search,
                                        onChanged: controller.search,
                                        textInputAction: TextInputAction.search,
                                        decoration: InputDecoration(
                                            hintText:
                                                'Jogos, gêneros, experiências…',
                                            hintStyle: AppTypography.body(12),
                                            prefixIcon: const Icon(Icons.search,
                                                size: 20),
                                            contentPadding:
                                                const EdgeInsets.symmetric(
                                                    vertical: AppSpacing.sm),
                                            suffixIcon: search.text.isEmpty
                                                ? null
                                                : IconButton(
                                                    tooltip: 'Limpar busca',
                                                    onPressed: () {
                                                      search.clear();
                                                      controller.search('');
                                                    },
                                                    icon: const Icon(
                                                        Icons.close,
                                                        size: 18))))),
                                const SizedBox(width: AppSpacing.xs),
                                IconButton.filledTonal(
                                    style: IconButton.styleFrom(
                                        backgroundColor: AppColors.high,
                                        foregroundColor: AppColors.primary),
                                    tooltip: 'Filtrar por plataforma',
                                    onPressed: filters,
                                    icon: const Icon(Icons.tune, size: 20)),
                              ]),
                              const SizedBox(height: AppSpacing.sm),
                              SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                      children: [
                                    'Todos',
                                    'RPG',
                                    'Co-op',
                                    'Terror',
                                    'Indies',
                                    'Gratuitos'
                                  ]
                                          .map((category) => Padding(
                                              padding: const EdgeInsets.only(
                                                  right: AppSpacing.xs),
                                              child: ChoiceChip(
                                                  label: Text(category,
                                                      style: AppTypography.label(
                                                          12)),
                                                  selected: controller.category ==
                                                      category,
                                                  showCheckmark: false,
                                                  selectedColor: AppColors
                                                      .primary
                                                      .withValues(alpha: .2),
                                                  side: BorderSide(
                                                      color: controller.category == category ? AppColors.primary : AppColors.border),
                                                  onSelected: (_) => controller.selectCategory(category))))
                                          .toList())),
                              if (controller.filtering) ...[
                                SectionHeading(
                                    title: controller.results.length == 1
                                        ? '1 jogo encontrado'
                                        : '${controller.results.length} jogos encontrados',
                                    icon: Icons.manage_search,
                                    action: 'Limpar filtros',
                                    onAction: clearFilters),
                                if (controller.platform != 'Todas')
                                  Padding(
                                      padding: const EdgeInsets.only(
                                          bottom: AppSpacing.md),
                                      child: Text(
                                          'Plataforma: ${controller.platform}',
                                          style: AppTypography.body(12))),
                                if (controller.results.isEmpty)
                                  SurfaceCard(
                                      child: Column(children: [
                                    const Icon(Icons.search_off,
                                        size: 32, color: AppColors.secondary),
                                    const SizedBox(height: AppSpacing.sm),
                                    Text('Nenhum jogo por aqui ainda',
                                        style: AppTypography.title(17),
                                        textAlign: TextAlign.center),
                                    Text(
                                        'Experimente outro nome, gênero ou plataforma.',
                                        style: AppTypography.body(),
                                        textAlign: TextAlign.center),
                                    TextButton(
                                        onPressed: clearFilters,
                                        child: const Text(
                                            'Explorar todos os jogos')),
                                  ]))
                                else
                                  gameGrid(controller.results),
                              ] else ...[
                                const SizedBox(height: AppSpacing.lg),
                                SurfaceCard(
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.stretch,
                                        children: [
                                      Row(children: [
                                        const Icon(Icons.auto_awesome,
                                            color: AppColors.primary, size: 18),
                                        const SizedBox(width: AppSpacing.xs),
                                        Expanded(
                                            child: Text(
                                                'DESCUBRA ALGO DIFERENTE',
                                                style: AppTypography.label(10)
                                                    .copyWith(
                                                        color:
                                                            AppColors.primary)))
                                      ]),
                                      const SizedBox(height: AppSpacing.sm),
                                      Text('Não sabe o que jogar?',
                                          style: AppTypography.title(20)),
                                      const SizedBox(height: AppSpacing.xs),
                                      Text(
                                          'Grandes aventuras começam com uma descoberta. Experimente algo fora da sua lista.',
                                          style: AppTypography.body(12)),
                                      const SizedBox(height: AppSpacing.md),
                                      FilledButton.icon(
                                          onPressed: () {
                                            final target =
                                                discoveryKey.currentContext;
                                            if (target != null) {
                                              Scrollable.ensureVisible(target,
                                                  duration: const Duration(
                                                      milliseconds: 350));
                                            }
                                          },
                                          icon: const Icon(Icons.auto_awesome,
                                              size: 18),
                                          label: const Text(
                                              'Encontrar meu próximo jogo')),
                                    ])),
                                SectionHeading(
                                    key: discoveryKey,
                                    title: 'Descubra seu gosto',
                                    icon: Icons.style_outlined),
                                Text(
                                    'Jogaria ou não? Cada escolha conta uma história.',
                                    style: AppTypography.body(12)),
                                const SizedBox(height: AppSpacing.md),
                                AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 220),
                                    child: nextGame == null
                                        ? SurfaceCard(
                                            key: const ValueKey('done'),
                                            child: Column(children: [
                                              const Icon(
                                                  Icons.check_circle_outline,
                                                  color: AppColors.positive,
                                                  size: 32),
                                              const SizedBox(
                                                  height: AppSpacing.sm),
                                              Text('Novos gostos descobertos!',
                                                  style:
                                                      AppTypography.title(17)),
                                              Text(
                                                  'Você jogaria ${controller.choices.values.where((value) => value).length} dos ${controller.choices.length} jogos.',
                                                  style:
                                                      AppTypography.body(12)),
                                              TextButton(
                                                  onPressed:
                                                      controller.restartChoices,
                                                  child:
                                                      const Text('Recomeçar')),
                                            ]))
                                        : DiscoverySwipeCard(
                                            key: ValueKey(nextGame.id),
                                            game: nextGame,
                                            onChoice: (choice) {
                                              final auth = widget.auth;
                                              if (auth == null) {
                                                controller.choose(choice);
                                              } else {
                                                requireAuthentication(context, auth,
                                                    () => controller.choose(choice));
                                              }
                                            },
                                            onDetails: () =>
                                                showGame(nextGame))),
                                const SizedBox(height: AppSpacing.xs),
                                Text(
                                    '${controller.choices.length} ${controller.choices.length == 1 ? 'escolha' : 'escolhas'} · Deslize ou use os botões',
                                    textAlign: TextAlign.center,
                                    style: AppTypography.body(10)),
                                collection(
                                    'Em destaque',
                                    'Universos que merecem a sua atenção.',
                                    Icons.stars_outlined,
                                    controller.games
                                        .where((game) =>
                                            game.collection == 'destaques' &&
                                            !game.free &&
                                            !game.offer)
                                        .toList()),
                                collection(
                                    'Hidden Gems',
                                    'Pequenos estúdios. Grandes descobertas.',
                                    Icons.diamond_outlined,
                                    controller.games
                                        .where((game) =>
                                            game.collection == 'hidden')
                                        .toList()),
                                collection(
                                    'De olho nas ofertas',
                                    'Uma seleção para acompanhar os preços.',
                                    Icons.local_offer_outlined,
                                    controller.games
                                        .where((game) => game.offer)
                                        .toList()),
                                collection(
                                    'Para jogar com amigos',
                                    'A próxima história fica melhor em companhia.',
                                    Icons.groups_outlined,
                                    controller.games
                                        .where((game) =>
                                            game.collection == 'amigos')
                                        .toList()),
                                const SizedBox(height: AppSpacing.xl),
                                Text(
                                    'CATÁLOGO DEMONSTRATIVO · NOVOS MUNDOS À VISTA',
                                    textAlign: TextAlign.center,
                                    style: AppTypography.label(10)
                                        .copyWith(color: AppColors.muted)),
                              ],
                            ]));
                  }))));

  Widget collection(String title, String subtitle, IconData icon,
          List<DiscoveryGame> games) =>
      ExploreCollection(
          title: title,
          subtitle: subtitle,
          icon: icon,
          games: games,
          onGame: showGame,
          onAll: () => showCollection(title, games));
}
