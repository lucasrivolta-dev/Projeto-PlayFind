import 'features/game_detail/game_detail_screen.dart';
import 'package:flutter/material.dart';
import 'design_system/theme.dart';
import 'design_system/components.dart';
import 'features/explore/explore_controller.dart';
import 'features/explore/explore_data.dart';
import 'features/explore/explore_screen.dart';
import 'features/feed/feed_controller.dart';
import 'features/feed/feed_screen.dart';
import 'features/forum/forum_controller.dart';
import 'features/forum/forum_screen.dart';
import 'features/library/library_store.dart';
import 'features/library/library_screen.dart';
import 'features/profile/profile_controller.dart';
import 'features/profile/profile_repository.dart';
import 'features/profile/profile_screen.dart';

void main() => runApp(const NextPlayApp());

class NextPlayApp extends StatefulWidget {
  const NextPlayApp({super.key});

  @override
  State<NextPlayApp> createState() => _NextPlayAppState();
}

class _NextPlayAppState extends State<NextPlayApp> {
  final library = LibraryStore();
  late final ProfileController controller =
      ProfileController(DemoProfileRepository())..load();
  late final ExploreController explore =
      ExploreController(DemoExploreRepository(), library: library)..load();
  late final FeedController feed =
      FeedController(DemoExploreRepository().load, library: library)..load();

  @override
  void dispose() {
    controller.dispose();
    explore.dispose();
    feed.dispose();
    library.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'NextPlay',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        home: _AppShell(profile: controller, explore: explore, feed: feed),
      );
}

class _AppShell extends StatefulWidget {
  const _AppShell(
      {required this.profile, required this.explore, required this.feed});
  final ProfileController profile;
  final ExploreController explore;
  final FeedController feed;
  @override
  State<_AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<_AppShell> {
  final forum = ForumController(DemoForumRepository())..load();
  @override
  void dispose() {
    forum.dispose();
    super.dispose();
  }

  AppDestination selected = AppDestination.home;
  int get pageIndex => switch (selected) {
        AppDestination.home => 0,
        AppDestination.explore => 1,
        AppDestination.profile => 2,
        AppDestination.library => 3,
        AppDestination.forum => 4
      };
  @override
  Widget build(BuildContext context) => GameDetailScope(
      forum: forum,
      child: Scaffold(
        body: ListenableBuilder(
            listenable: widget.explore,
            builder: (context, _) => IndexedStack(
                  index: pageIndex,
                  children: [
                    FeedScreen(controller: widget.feed),
                    ExploreScreen(controller: widget.explore),
                    ProfileScreen(
                        controller: widget.profile,
                        embedded: true,
                        extraSaved: widget.explore.saved.length),
                    LibraryScreen(
                        controller: widget.explore,
                        onExplore: () =>
                            setState(() => selected = AppDestination.explore)),
                    ForumScreen(controller: forum, games: widget.explore.games),
                  ],
                )),
        bottomNavigationBar: AppBottomNavigation(
            selected: selected,
            onSelected: (destination) {
              setState(() => selected = destination);
            }),
      ));
}
