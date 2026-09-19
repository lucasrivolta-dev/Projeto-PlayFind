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
      this.appId,
      this.heroUrl,
      this.coverUrl,
      required this.title,
      this.cover = false});
  /// Explicit Steam App ID only. Never pass a generic game/IGDB ID.
  final int? appId;
  final String? heroUrl, coverUrl;
  final String title;
  final bool cover;
  @override
  Widget build(BuildContext context) {
    final urls = [heroUrl, coverUrl,
      if (appId != null && appId! > 0)
        'https://cdn.akamai.steamstatic.com/steam/apps/$appId/${cover ? 'library_600x900_2x.jpg' : 'header.jpg'}',
    ].whereType<String>().where((url) {
      final uri = Uri.tryParse(url);
      return uri != null && uri.host.isNotEmpty &&
          (uri.scheme == 'https' || uri.scheme == 'http');
    }).toSet().toList();
    final placeholder = ColoredBox(color: AppColors.high,
      child: Center(child: Padding(padding: const EdgeInsets.all(AppSpacing.xs),
        child: Text(title, textAlign: TextAlign.center, style: AppTypography.label(10)))));
    Widget at(int index) => index >= urls.length ? placeholder : Image.network(
        urls[index],
        fit: BoxFit.cover,
        semanticLabel: 'Capa de $title',
        loadingBuilder: (context, child, progress) => progress == null
            ? child
            : const ColoredBox(
                color: AppColors.high,
                child: Center(
                    child: Icon(Icons.sports_esports_outlined,
                        color: AppColors.muted))),
        errorBuilder: (context, error, stack) => at(index + 1),
      );
    return at(0);
  }
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

  static const List<AppDestination> visualDestinations = [
    AppDestination.explore,
    AppDestination.forum,
    AppDestination.home,
    AppDestination.library,
    AppDestination.profile,
  ];

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: const BorderRadius.vertical(
            top: Radius.circular(AppRadius.hero)),
        child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.glass,
                borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(AppRadius.hero)),
                border: Border(
                  top: BorderSide(
                    color: AppColors.primary.withValues(alpha: 0.22),
                    width: 1.0,
                  ),
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    blurRadius: 20,
                    offset: const Offset(0, -4),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.only(
                    top: AppSpacing.xs,
                    bottom: AppSpacing.xxs,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: visualDestinations.map((item) {
                      final active = item == selected;
                      final isHome = item == AppDestination.home;

                      return Expanded(
                        child: Semantics(
                          button: true,
                          selected: active,
                          label: item.label,
                          child: InkWell(
                            key: ValueKey(item),
                            onTap: () => onSelected(item),
                            borderRadius: BorderRadius.circular(AppRadius.large),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  vertical: AppSpacing.xxs),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  AnimatedContainer(
                                    duration:
                                        const Duration(milliseconds: 200),
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: active
                                          ? AppColors.primary
                                          : (isHome ? AppColors.high : AppColors.transparent),
                                      border: active
                                          ? Border.all(
                                              color: Colors.white
                                                  .withValues(alpha: 0.3),
                                              width: 1.0,
                                            )
                                          : (isHome
                                              ? Border.all(
                                                  color: AppColors.border,
                                                  width: 1.0,
                                                )
                                              : null),
                                      boxShadow: active
                                          ? [
                                              BoxShadow(
                                                color: AppColors.primary
                                                    .withValues(alpha: isHome ? 0.45 : 0.3),
                                                blurRadius: isHome ? 14 : 10,
                                                spreadRadius: 1,
                                                offset: const Offset(0, 2),
                                              ),
                                            ]
                                          : null,
                                    ),
                                    child: Icon(
                                      item.icon,
                                      size: 22,
                                      color: active
                                          ? Colors.white
                                          : AppColors.secondary,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    item.label,
                                    style: AppTypography.label(10).copyWith(
                                      color: active
                                          ? AppColors.primary
                                          : AppColors.secondary,
                                      fontWeight: active
                                          ? FontWeight.w700
                                          : FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
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
