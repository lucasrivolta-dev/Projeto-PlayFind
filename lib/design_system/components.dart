import 'dart:ui';
import 'package:flutter/material.dart';
import 'theme.dart';

class SurfaceCard extends StatelessWidget {
  const SurfaceCard(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(AppSpacing.md),
      this.color = AppColors.surface});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(AppRadius.large),
            border: Border.all(color: AppColors.border)),
        child: child,
      );
}

class GenreChip extends StatelessWidget {
  const GenreChip(this.label, {super.key});
  final String label;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
        decoration: BoxDecoration(
            color: AppColors.high,
            borderRadius: BorderRadius.circular(AppRadius.base)),
        child: Text(label, style: AppTypography.label(10)),
      );
}

class GameArtwork extends StatelessWidget {
  const GameArtwork(
      {super.key,
      required this.appId,
      required this.title,
      this.cover = false});
  final int appId;
  final String title;
  final bool cover;
  @override
  Widget build(BuildContext context) => Image.network(
        'https://cdn.akamai.steamstatic.com/steam/apps/$appId/${cover ? 'library_600x900_2x.jpg' : 'header.jpg'}',
        fit: BoxFit.cover,
        semanticLabel: 'Capa de $title',
        loadingBuilder: (context, child, progress) => progress == null
            ? child
            : const ColoredBox(
                color: AppColors.high,
                child: Center(
                    child: Icon(Icons.sports_esports_outlined,
                        color: AppColors.muted))),
        errorBuilder: (context, error, stack) => ColoredBox(
            color: AppColors.high,
            child: Center(
                child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.xs),
                    child: Text(title,
                        textAlign: TextAlign.center,
                        style: AppTypography.label(10))))),
      );
}

class SectionHeading extends StatelessWidget {
  const SectionHeading(
      {super.key,
      required this.title,
      required this.icon,
      this.action,
      this.onAction});
  final String title;
  final IconData icon;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
        padding:
            const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.xs),
        child: Row(children: [
          Icon(icon, size: 16, color: AppColors.primary),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: Text(title, style: AppTypography.title(14))),
          if (action != null)
            TextButton(
                onPressed: onAction,
                style: TextButton.styleFrom(minimumSize: const Size(44, 44)),
                child: Text(action!,
                    style: AppTypography.label(10)
                        .copyWith(color: AppColors.secondary))),
        ]),
      );
}

enum AppDestination {
  home('Início', Icons.home_outlined),
  explore('Explorar', Icons.explore_outlined),
  forum('Fórum', Icons.chat_bubble_outline),
  library('Biblioteca', Icons.collections_bookmark_outlined),
  profile('Perfil', Icons.person_outline);

  const AppDestination(this.label, this.icon);
  final String label;
  final IconData icon;
}

class AppBottomNavigation extends StatelessWidget {
  const AppBottomNavigation(
      {super.key, required this.selected, required this.onSelected});
  final AppDestination selected;
  final ValueChanged<AppDestination> onSelected;

  @override
  Widget build(BuildContext context) => ClipRect(
        child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: Container(
              decoration: const BoxDecoration(
                  color: AppColors.glass,
                  border: Border(top: BorderSide(color: AppColors.border))),
              child: SafeArea(
                  top: false,
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                    child: Row(
                        children: AppDestination.values.map((item) {
                      final active = item == selected;
                      return Expanded(
                          child: Semantics(
                        selected: active,
                        child: InkWell(
                          key: ValueKey(item),
                          onTap: () => onSelected(item),
                          child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  vertical: AppSpacing.xxs),
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    AnimatedContainer(
                                        duration:
                                            const Duration(milliseconds: 180),
                                        padding:
                                            const EdgeInsets.all(AppSpacing.xs),
                                        decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: active
                                                ? AppColors.primary
                                                : AppColors.transparent),
                                        child: Icon(item.icon,
                                            size: 22,
                                            color: active
                                                ? AppColors.text
                                                : AppColors.secondary)),
                                    const SizedBox(height: AppSpacing.xxs),
                                    Text(item.label,
                                        style: AppTypography.label(10).copyWith(
                                            color: active
                                                ? AppColors.primary
                                                : AppColors.secondary)),
                                  ])),
                        ),
                      ));
                    }).toList()),
                  )),
            )),
      );
}

Future<T?> showAppSheet<T>(BuildContext context, Widget child) =>
    showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppColors.surface,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(AppRadius.hero))),
      builder: (context) => Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SafeArea(
            top: false,
            child: ConstrainedBox(
                constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * .8),
                child: SingleChildScrollView(
                    padding: const EdgeInsets.all(AppSpacing.margin),
                    child: child))),
      ),
    );
