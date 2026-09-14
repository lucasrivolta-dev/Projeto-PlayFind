import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'explore_data.dart';

class ExploreGameCard extends StatelessWidget {
  const ExploreGameCard(
      {super.key, required this.game, required this.onTap, this.width = 156});
  final DiscoveryGame game;
  final VoidCallback onTap;
  final double width;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: Semantics(
            button: true,
            label: 'Ver ${game.title}',
            child: InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(AppRadius.medium),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadius.medium),
                          child: AspectRatio(
                              aspectRatio: 4 / 3,
                              child: GameArtwork(
                                  appId: game.steamAppId, heroUrl: game.heroUrl, coverUrl: game.coverUrl, title: game.title))),
                      const SizedBox(height: AppSpacing.xs),
                      Text(game.title,
                          style: AppTypography.label(12),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: AppSpacing.xxs),
                      Text(game.genre, style: AppTypography.body(10)),
                      const SizedBox(height: AppSpacing.xxs),
                      Wrap(spacing: AppSpacing.xs, children: [
                        Text('★ ${game.rating}',
                            style: AppTypography.label(10)
                                .copyWith(color: AppColors.positive)),
                        Text(
                            game.free
                                ? 'Gratuito'
                                : game.platforms.take(2).join(' · '),
                            style: AppTypography.body(10)),
                      ]),
                    ]))),
      );
}

class DiscoverySwipeCard extends StatelessWidget {
  const DiscoverySwipeCard(
      {super.key,
      required this.game,
      required this.onChoice,
      required this.onDetails});
  final DiscoveryGame game;
  final ValueChanged<bool> onChoice;
  final VoidCallback onDetails;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onHorizontalDragEnd: (details) {
          final speed = details.primaryVelocity ?? 0;
          if (speed.abs() > 200) onChoice(speed > 0);
        },
        child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.hero),
            child: Stack(children: [
              Positioned.fill(
                  child: GameArtwork(
                      appId: game.steamAppId, heroUrl: game.heroUrl, coverUrl: game.coverUrl, title: game.title, cover: true)),
              Positioned.fill(
                  child: DecoratedBox(
                      decoration: BoxDecoration(
                          gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                    AppColors.canvas.withValues(alpha: .05),
                    AppColors.canvas.withValues(alpha: .65),
                    AppColors.surface
                  ],
                              stops: const [
                    0,
                    .45,
                    1
                  ])))),
              Padding(
                  padding: const EdgeInsets.all(AppSpacing.margin),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Align(
                            alignment: Alignment.topRight,
                            child: GenreChip('★ ${game.rating}')),
                        const SizedBox(height: 140),
                        Wrap(
                            spacing: AppSpacing.xs,
                            runSpacing: AppSpacing.xs,
                            children: [
                              GenreChip(game.genre),
                              if (game.tags.isNotEmpty)
                                GenreChip(game.tags.first)
                            ]),
                        const SizedBox(height: AppSpacing.xs),
                        Text(game.title, style: AppTypography.title(26)),
                        Text(game.description,
                            style: AppTypography.body(12)
                                .copyWith(color: AppColors.text)),
                        TextButton.icon(
                            onPressed: onDetails,
                            icon: const Icon(Icons.arrow_outward, size: 16),
                            label: Text('Conhecer o jogo',
                                style: AppTypography.label(12)
                                    .copyWith(color: AppColors.primary))),
                        const SizedBox(height: AppSpacing.xs),
                        LayoutBuilder(builder: (context, constraints) {
                          final vertical =
                              MediaQuery.textScalerOf(context).scale(12) > 18;
                          final buttons = [
                            OutlinedButton.icon(
                                onPressed: () => onChoice(false),
                                style: OutlinedButton.styleFrom(
                                    minimumSize: const Size(44, 48),
                                    foregroundColor: AppColors.text),
                                icon: const Icon(Icons.close, size: 18),
                                label: const Text('Não jogaria')),
                            FilledButton.icon(
                                onPressed: () => onChoice(true),
                                icon:
                                    const Icon(Icons.favorite_border, size: 18),
                                label: const Text('Jogaria')),
                          ];
                          return vertical
                              ? Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                      buttons[0],
                                      const SizedBox(height: AppSpacing.xs),
                                      buttons[1]
                                    ])
                              : Row(children: [
                                  Expanded(child: buttons[0]),
                                  const SizedBox(width: AppSpacing.xs),
                                  Expanded(child: buttons[1])
                                ]);
                        }),
                      ])),
            ])),
      );
}

class ExploreCollection extends StatelessWidget {
  const ExploreCollection(
      {super.key,
      required this.title,
      required this.subtitle,
      required this.games,
      required this.onGame,
      required this.onAll,
      required this.icon});
  final String title, subtitle;
  final List<DiscoveryGame> games;
  final ValueChanged<DiscoveryGame> onGame;
  final VoidCallback onAll;
  final IconData icon;
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SectionHeading(
            title: title, icon: icon, action: 'Ver todos', onAction: onAll),
        Text(subtitle, style: AppTypography.body(12)),
        const SizedBox(height: AppSpacing.md),
        SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: games
                    .take(3)
                    .map((game) => Padding(
                        padding: const EdgeInsets.only(right: AppSpacing.md),
                        child: ExploreGameCard(
                            game: game, onTap: () => onGame(game))))
                    .toList())),
      ]);
}
