import 'package:flutter/material.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'profile_models.dart';

class ProfileHero extends StatelessWidget {
  const ProfileHero(
      {super.key,
      required this.profile,
      required this.onEdit,
      required this.onShare});
  final PlayerProfile profile;
  final VoidCallback onEdit, onShare;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.large),
          border: Border.all(color: AppColors.border),
          gradient: LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [
                AppColors.primary.withValues(alpha: .16),
                AppColors.surface,
                AppColors.surface
              ]),
        ),
        child: Column(children: [
          Stack(children: [
            Container(
                padding: const EdgeInsets.all(AppSpacing.xxs),
                decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.primary, width: 2)),
                child: CircleAvatar(
                    radius: 40,
                    backgroundColor: AppColors.high,
                    child: Text(profile.name.characters.first.toUpperCase(),
                        style: AppTypography.title(32)))),
            Positioned(
                right: 2,
                bottom: 4,
                child: Container(
                    padding: const EdgeInsets.all(AppSpacing.xxs),
                    decoration: BoxDecoration(
                        color: AppColors.positive,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.surface, width: 3)),
                    child: const Icon(Icons.check,
                        size: 10, color: AppColors.canvas))),
          ]),
          const SizedBox(height: AppSpacing.sm),
          Text(profile.name,
              style: AppTypography.title(26), textAlign: TextAlign.center),
          Text('@${profile.username}', style: AppTypography.body(12)),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
              alignment: WrapAlignment.center,
              spacing: AppSpacing.xs,
              children: [
                Text('MEMBRO NEXTPLAY',
                    style: AppTypography.label(10)
                        .copyWith(color: AppColors.secondary)),
                Text('●  Caçador de descobertas',
                    style: AppTypography.label(10)
                        .copyWith(color: AppColors.positive)),
              ]),
          const SizedBox(height: AppSpacing.md),
          Text(profile.bio,
              textAlign: TextAlign.center, style: AppTypography.body(12)),
          const SizedBox(height: AppSpacing.md),
          Wrap(
              alignment: WrapAlignment.center,
              spacing: AppSpacing.lg,
              children: [
                _SocialCount(profile.followers, 'seguidores'),
                _SocialCount(profile.following, 'seguindo'),
              ]),
          const SizedBox(height: AppSpacing.margin),
          LayoutBuilder(builder: (context, constraints) {
            final buttons = [
              OutlinedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: Text('Editar perfil', style: AppTypography.label(12))),
              OutlinedButton.icon(
                  onPressed: onShare,
                  icon: const Icon(Icons.ios_share_outlined, size: 16),
                  label: Text('Compartilhar', style: AppTypography.label(12))),
            ];
            final style = OutlinedButton.styleFrom(
                foregroundColor: AppColors.text,
                backgroundColor: AppColors.text.withValues(alpha: .06),
                minimumSize: const Size(44, 48),
                side: const BorderSide(color: AppColors.border),
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.large)));
            return OutlinedButtonTheme(
                data: OutlinedButtonThemeData(style: style),
                child: constraints.maxWidth < 290 ||
                        MediaQuery.textScalerOf(context).scale(12) > 18
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                            buttons[0],
                            const SizedBox(height: AppSpacing.xs),
                            buttons[1]
                          ])
                    : Row(children: [
                        Expanded(child: buttons[0]),
                        const SizedBox(width: AppSpacing.xs),
                        Expanded(child: buttons[1])
                      ]));
          }),
        ]),
      );
}

class _SocialCount extends StatelessWidget {
  const _SocialCount(this.count, this.label);
  final int count;
  final String label;
  @override
  Widget build(BuildContext context) => Text.rich(TextSpan(children: [
        TextSpan(text: '$count ', style: AppTypography.label(12)),
        TextSpan(text: label, style: AppTypography.body(12)),
      ]));
}

class ProfileStats extends StatelessWidget {
  const ProfileStats({super.key, required this.profile, this.extraSaved = 0});
  final PlayerProfile profile;
  final int extraSaved;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: SurfaceCard(
            padding: const EdgeInsets.symmetric(
                vertical: AppSpacing.md, horizontal: AppSpacing.xs),
            child: LayoutBuilder(builder: (context, constraints) {
              final stats = [
                (profile.played, 'Jogos jogados'),
                (profile.saved + extraSaved, 'Quero jogar'),
                (profile.reviewCount, 'Avaliações'),
                (profile.topicCount, 'Tópicos')
              ];
              final columns =
                  MediaQuery.textScalerOf(context).scale(12) > 18 ? 2 : 4;
              return Wrap(
                  runSpacing: AppSpacing.md,
                  children: stats.indexed
                      .map((entry) => SizedBox(
                            width: constraints.maxWidth / columns,
                            child: Column(children: [
                              Text('${entry.$2.$1}',
                                  style: AppTypography.title(20).copyWith(
                                      color: entry.$1 == 1
                                          ? AppColors.positive
                                          : AppColors.text)),
                              const SizedBox(height: AppSpacing.xxs),
                              Text(entry.$2.$2,
                                  textAlign: TextAlign.center,
                                  style: AppTypography.body(10)),
                            ]),
                          ))
                      .toList());
            })),
      );
}

class FavoriteGameCard extends StatelessWidget {
  const FavoriteGameCard({super.key, required this.game, required this.onTap});
  final Game game;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SizedBox(
      width: 128,
      child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.medium),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AspectRatio(
                aspectRatio: 2 / 3,
                child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.medium),
                    child: Stack(fit: StackFit.expand, children: [
                      GameArtwork(
                          appId: game.appId, title: game.title, cover: true),
                      Positioned(
                          top: AppSpacing.xs,
                          right: AppSpacing.xs,
                          child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.xxs,
                                  vertical: AppSpacing.tiny),
                              decoration: BoxDecoration(
                                  color: AppColors.canvas.withValues(alpha: .9),
                                  borderRadius:
                                      BorderRadius.circular(AppRadius.small)),
                              child: Text('★ ${game.rating}',
                                  style: AppTypography.label(10)
                                      .copyWith(color: AppColors.positive)))),
                    ]))),
            const SizedBox(height: AppSpacing.xs),
            Text(game.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.label(12)),
            const SizedBox(height: AppSpacing.xxs),
            Text(game.developer,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.body(10)),
          ])));
}

class GamerTasteCard extends StatelessWidget {
  const GamerTasteCard({super.key, required this.genres});
  final List<String> genres;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.lg),
        child: SurfaceCard(
            color: AppColors.positive.withValues(alpha: .06),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                    child: Text('DNA DE JOGADOR',
                        style: AppTypography.label(10)
                            .copyWith(color: AppColors.positive))),
                const Icon(Icons.fingerprint,
                    color: AppColors.positive, size: 24)
              ]),
              const SizedBox(height: AppSpacing.xxs),
              Text('Seu gosto gamer', style: AppTypography.title(17)),
              const SizedBox(height: AppSpacing.xs),
              Text('Histórias que prendem. Mundos para explorar.',
                  style: AppTypography.body(12)),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  children: genres.map(GenreChip.new).toList()),
              const SizedBox(height: AppSpacing.md),
              Text('PLATAFORMAS',
                  style:
                      AppTypography.label(10).copyWith(color: AppColors.muted)),
              const SizedBox(height: AppSpacing.xs),
              Text('PC · PlayStation 5 · Nintendo Switch',
                  style: AppTypography.body(12)),
            ])),
      );
}

class ActivityTile extends StatelessWidget {
  const ActivityTile({super.key, required this.activity});
  final ProfileActivity activity;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.xs),
        child: SurfaceCard(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: Row(children: [
              ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.base),
                  child: SizedBox(
                      width: 48,
                      height: 48,
                      child: activity.game == null
                          ? const ColoredBox(
                              color: AppColors.high,
                              child: Icon(Icons.forum_outlined,
                                  color: AppColors.primary, size: 22))
                          : GameArtwork(
                              appId: activity.game!.appId,
                              title: activity.game!.title))),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(activity.title, style: AppTypography.label(12)),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(activity.subtitle, style: AppTypography.body(10)),
                  ])),
            ])),
      );
}

class ReviewCard extends StatelessWidget {
  const ReviewCard(
      {super.key,
      required this.review,
      required this.liked,
      required this.onLike});
  final GameReview review;
  final bool liked;
  final VoidCallback onLike;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: SurfaceCard(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.base),
                child: SizedBox(
                    width: 48,
                    height: 64,
                    child: GameArtwork(
                        appId: review.game.appId,
                        title: review.game.title,
                        cover: true))),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(review.game.title, style: AppTypography.label(12)),
                  const SizedBox(height: AppSpacing.xxs),
                  Semantics(
                      label: '5 de 5 estrelas',
                      child: ExcludeSemantics(
                          child: Text('★★★★★',
                              style: AppTypography.label(14)
                                  .copyWith(color: AppColors.positive)))),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(review.date, style: AppTypography.body(10)),
                ])),
          ]),
          const SizedBox(height: AppSpacing.sm),
          Text(review.text, style: AppTypography.body(12)),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: AppSpacing.md,
              children: [
                Semantics(
                    toggled: liked,
                    child: TextButton.icon(
                        onPressed: onLike,
                        icon: Icon(
                            liked ? Icons.favorite : Icons.favorite_border,
                            size: 16),
                        label: Text('${review.likes + (liked ? 1 : 0)}'),
                        style: TextButton.styleFrom(
                            foregroundColor: liked
                                ? AppColors.primary
                                : AppColors.secondary))),
                Text('✓  Recomendo',
                    style: AppTypography.label(10)
                        .copyWith(color: AppColors.positive)),
              ]),
        ])),
      );
}

class TopicCard extends StatelessWidget {
  const TopicCard({super.key, required this.topic, required this.onTap});
  final ForumTopic topic;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.large),
            child: SurfaceCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(topic.category,
                      style: AppTypography.label(10)
                          .copyWith(color: AppColors.primary)),
                  const SizedBox(height: AppSpacing.xs),
                  Text(topic.title, style: AppTypography.label(14)),
                  const SizedBox(height: AppSpacing.sm),
                  Text('${topic.replies} respostas  ·  ${topic.date}',
                      style: AppTypography.body(10)),
                ]))),
      );
}
