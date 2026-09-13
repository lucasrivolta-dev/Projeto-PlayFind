import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../design_system/components.dart';
import '../../design_system/theme.dart';
import 'profile_controller.dart';
import 'profile_models.dart';
import 'profile_widgets.dart';
import '../auth/auth_controller.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen(
      {super.key,
      required this.controller,
      this.embedded = false,
      this.extraSaved = 0,
      this.auth});
  final ProfileController controller;
  final bool embedded;
  final int extraSaved;
  final AuthController? auth;

  void _message(BuildContext context, String text) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _share(BuildContext context, PlayerProfile profile) async {
    try {
      await Clipboard.setData(ClipboardData(
        text:
            '${profile.name} (@${profile.username}) no NextPlay\n${profile.bio}\n'
            'Meus favoritos: ${profile.favorites.take(3).map((game) => game.title).join(', ')}.',
      ));
      if (context.mounted) {
        _message(context, 'Apresentação do perfil copiada para compartilhar.');
      }
    } catch (_) {
      if (context.mounted) {
        _message(context, 'Não foi possível copiar. Tente novamente.');
      }
    }
  }

  void _game(BuildContext context, Game game) {
    showAppSheet<void>(
        context,
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.large),
              child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: GameArtwork(appId: game.appId, title: game.title))),
          const SizedBox(height: AppSpacing.md),
          Text(game.title, style: AppTypography.title()),
          Text(game.developer, style: AppTypography.body()),
          const SizedBox(height: AppSpacing.md),
          Wrap(
              spacing: AppSpacing.xs,
              children: [GenreChip(game.genre), GenreChip('★ ${game.rating}')]),
          const SizedBox(height: AppSpacing.md),
          Text('Um dos seus favoritos', style: AppTypography.body()),
        ]));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
            bottom: false,
            child: Center(
                child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: ListenableBuilder(
                  listenable: controller,
                  builder: (context, _) {
                    if (controller.status == ProfileStatus.loading) {
                      return const Center(
                          child: CircularProgressIndicator(
                              semanticsLabel: 'Carregando perfil'));
                    }
                    if (controller.status != ProfileStatus.ready) {
                      return Center(
                          child: Padding(
                              padding: const EdgeInsets.all(AppSpacing.margin),
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.person_outline,
                                        size: 48, color: AppColors.muted),
                                    const SizedBox(height: AppSpacing.md),
                                    Text(
                                        controller.status == ProfileStatus.empty
                                            ? 'Seu perfil ainda está vazio'
                                            : 'Não foi possível carregar seu perfil',
                                        textAlign: TextAlign.center,
                                        style: AppTypography.title()),
                                    const SizedBox(height: AppSpacing.md),
                                    FilledButton(
                                        onPressed: controller.load,
                                        child: const Text('Tentar novamente')),
                                  ])));
                    }
                    final profile = controller.profile!;
                    return RefreshIndicator(
                        onRefresh: controller.load,
                        child: ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(AppSpacing.margin,
                              AppSpacing.xs, AppSpacing.margin, AppSpacing.lg),
                          children: [
                            Row(children: [
                              const Icon(Icons.play_arrow_rounded,
                                  color: AppColors.primary, size: 24),
                              const SizedBox(width: AppSpacing.xxs),
                              Text('NextPlay', style: AppTypography.label(14)),
                              const Spacer(),
                              if (MediaQuery.sizeOf(context).width > 360 &&
                                  MediaQuery.textScalerOf(context).scale(10) <
                                      16)
                                Text('SEU UNIVERSO GAMER',
                                    style: AppTypography.label(10)
                                        .copyWith(color: AppColors.muted))
                            ]),
                            const SizedBox(height: AppSpacing.md),
                            Row(children: [
                              Expanded(
                                  child: Wrap(
                                      spacing: AppSpacing.xs,
                                      crossAxisAlignment:
                                          WrapCrossAlignment.center,
                                      children: [
                                    Text('Perfil',
                                        style: AppTypography.title(20)),
                                    Text('MEU ESPAÇO',
                                        style: AppTypography.label(10).copyWith(
                                            color: AppColors.positive)),
                                  ])),
                              IconButton(
                                  tooltip: 'Compartilhar perfil',
                                  onPressed: () => _share(context, profile),
                                  icon: const Icon(Icons.ios_share_outlined,
                                      size: 20)),
                              if (auth?.isAuthenticated == true)
                                IconButton(
                                    tooltip: 'Sair',
                                    onPressed: () async {
                                      final authController = auth;
                                      if (authController == null) return;
                                      await authController.signOut();
                                      if (context.mounted) {
                                        _message(context, 'Você saiu da conta.');
                                      }
                                    },
                                    icon: const Icon(Icons.logout, size: 20)),
                              IconButton(
                                  tooltip: 'Sobre este perfil',
                                  onPressed: () => showAppSheet<void>(
                                      context,
                                      Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text('Seu espaço no NextPlay',
                                                style: AppTypography.title()),
                                            const SizedBox(
                                                height: AppSpacing.sm),
                                            Text(
                                                'Reúna suas descobertas, suas histórias e os jogos que fazem parte de você.',
                                                style: AppTypography.body()),
                                            const SizedBox(
                                                height: AppSpacing.md),
                                            Text(
                                                'Este perfil usa dados de demonstração. Edições e curtidas ficam disponíveis durante esta sessão.',
                                                style: AppTypography.body(12)),
                                          ])),
                                  icon:
                                      const Icon(Icons.info_outline, size: 20)),
                            ]),
                            const SizedBox(height: AppSpacing.sm),
                            ProfileHero(
                                profile: profile,
                                onShare: () => _share(context, profile),
                                onEdit: () => showAppSheet<void>(context,
                                    _EditProfile(controller: controller))),
                            ProfileStats(
                                profile: profile, extraSaved: extraSaved),
                            SectionHeading(
                                title: 'Jogos favoritos',
                                icon: Icons.favorite_border,
                                action: 'Ver todos',
                                onAction: () => showAppSheet<void>(
                                    context,
                                    Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text('Jogos favoritos',
                                              style: AppTypography.title()),
                                          const SizedBox(height: AppSpacing.md),
                                          Wrap(
                                              spacing: AppSpacing.md,
                                              runSpacing: AppSpacing.lg,
                                              children: profile.favorites
                                                  .map((game) =>
                                                      FavoriteGameCard(
                                                          game: game,
                                                          onTap: () => _game(
                                                              context, game)))
                                                  .toList()),
                                        ]))),
                            if (profile.favorites.isEmpty)
                              Text('Seus jogos favoritos vão aparecer aqui.',
                                  style: AppTypography.body())
                            else
                              SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: profile.favorites
                                          .take(3)
                                          .map((game) => Padding(
                                              padding: const EdgeInsets.only(
                                                  right: AppSpacing.md),
                                              child: FavoriteGameCard(
                                                  game: game,
                                                  onTap: () =>
                                                      _game(context, game))))
                                          .toList())),
                            GamerTasteCard(genres: profile.genres),
                            const SectionHeading(
                                title: 'Atividade recente',
                                icon: Icons.history),
                            if (profile.activities.isEmpty)
                              Text('Suas próximas descobertas aparecem aqui.',
                                  style: AppTypography.body()),
                            ...profile.activities.map(
                                (activity) => ActivityTile(activity: activity)),
                            const SectionHeading(
                                title: 'Avaliações recentes',
                                icon: Icons.rate_review_outlined),
                            if (profile.reviews.isEmpty)
                              Text('Você ainda não avaliou nenhum jogo.',
                                  style: AppTypography.body()),
                            ...profile.reviews.map((review) => ReviewCard(
                                review: review,
                                liked: controller.likedReviews
                                    .contains(review.game.appId),
                                onLike: () => controller
                                    .toggleReview(review.game.appId))),
                            const SectionHeading(
                                title: 'Tópicos publicados',
                                icon: Icons.forum_outlined),
                            if (profile.topics.isEmpty)
                              Text('Suas conversas começam aqui.',
                                  style: AppTypography.body()),
                            ...profile.topics.map((topic) => TopicCard(
                                topic: topic,
                                onTap: () => _message(context,
                                    'A tela de discussão será conectada quando o Fórum estiver disponível.'))),
                            const SizedBox(height: AppSpacing.lg),
                            Text('CADA JOGO CONTA UMA PARTE DA SUA HISTÓRIA.',
                                textAlign: TextAlign.center,
                                style: AppTypography.label(10)
                                    .copyWith(color: AppColors.muted)),
                          ],
                        ));
                  }),
            ))),
        bottomNavigationBar: embedded
            ? null
            : AppBottomNavigation(
                selected: AppDestination.profile,
                onSelected: (destination) {
                  if (destination != AppDestination.profile) {
                    _message(context,
                        '${destination.label} ainda não está disponível nesta versão.');
                  }
                }),
      );
}

class _EditProfile extends StatefulWidget {
  const _EditProfile({required this.controller});
  final ProfileController controller;
  @override
  State<_EditProfile> createState() => _EditProfileState();
}

class _EditProfileState extends State<_EditProfile> {
  final form = GlobalKey<FormState>();
  late final name =
      TextEditingController(text: widget.controller.profile!.name);
  late final bio = TextEditingController(text: widget.controller.profile!.bio);
  bool busy = false;
  String? error;
  @override
  void dispose() {
    name.dispose();
    bio.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate() || busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    final success = await widget.controller.edit(name.text, bio.text);
    if (!mounted) return;
    if (success) {
      Navigator.pop(context);
    } else {
      setState(() {
        busy = false;
        error = 'Não foi possível salvar. Tente novamente.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => Form(
      key: form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Editar perfil', style: AppTypography.title()),
          const SizedBox(height: AppSpacing.xs),
          Text('Deixe seu espaço com a sua cara.', style: AppTypography.body()),
          const SizedBox(height: AppSpacing.lg),
          TextFormField(
              controller: name,
              enabled: !busy,
              maxLength: 40,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Nome'),
              validator: (value) => value == null || value.trim().isEmpty
                  ? 'Informe seu nome.'
                  : null),
          const SizedBox(height: AppSpacing.md),
          TextFormField(
              controller: bio,
              enabled: !busy,
              minLines: 3,
              maxLines: 5,
              maxLength: 180,
              decoration: const InputDecoration(labelText: 'Bio')),
          if (error != null)
            Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(error!,
                    style:
                        AppTypography.body().copyWith(color: AppColors.error))),
          const SizedBox(height: AppSpacing.md),
          FilledButton(
              onPressed: busy ? null : save,
              child: Text(busy ? 'Salvando…' : 'Salvar alterações')),
        ],
      ));
}
