import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

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
import 'features/auth/auth_controller.dart';
import 'features/library/library_repository.dart';
import 'features/library/library_store.dart';
import 'features/library/library_screen.dart';
import 'features/profile/profile_controller.dart';
import 'features/profile/profile_repository.dart';
import 'features/profile/profile_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const NextPlayApp());
}

class NextPlayApp extends StatefulWidget {
  const NextPlayApp({super.key, this.exploreRepository, this.libraryRepository, this.authController});
  final ExploreRepository? exploreRepository;
  final LibraryRepository? libraryRepository;
  final AuthController? authController;

  @override
  State<NextPlayApp> createState() => _NextPlayAppState();
}

class _NextPlayAppState extends State<NextPlayApp> {
  late final ApiLibraryRepository _libraryRepo;
  late final LibraryStore library;
  late final AuthController auth;
  late final ExploreRepository _repo;
  late final ProfileController controller;
  late final ExploreController explore;
  late final FeedController feed;

  @override
  void initState() {
    super.initState();
    auth = widget.authController ?? AuthController();
    auth.addListener(_onAuthChanged);
    _libraryRepo = ApiLibraryRepository(tokenProvider: auth.getIdToken);
    library = LibraryStore(repo: widget.libraryRepository ?? _libraryRepo);
    _repo = widget.exploreRepository ?? ApiExploreRepository();
    controller = ProfileController(DemoProfileRepository())..load();
    explore = ExploreController(_repo, library: library)..load();
    final repo = _repo;
    final apiRepo = repo is ApiExploreRepository ? repo : null;
    feed = FeedController(
      apiRepo != null ? apiRepo.loadFeed : repo.load,
      feedLoader: apiRepo != null
          ? ({excludeIds, limit = 20}) =>
              apiRepo.loadFeed(excludeIds: excludeIds, limit: limit)
          : null,
      library: library,
    )..load();
    // O primeiro carregamento acontece somente quando authStateChanges
    // confirma uma identidade autenticada.
    // Quando a sessão já foi restaurada antes da criação do shell, não há
    // uma nova transição para disparar o listener; inicialize explicitamente.
    if (auth.isAuthenticated) _onAuthChanged();
  }

  void _onAuthChanged() {
    if (auth.isAuthenticated) {
      unawaited((widget.libraryRepository ?? _libraryRepo)
          .loadInto(library)
          .catchError((Object error) {
        debugPrint('Falha ao carregar biblioteca autenticada: $error');
      }));
    } else {
      library.clearPrivateState();
    }
  }

  @override
  void dispose() {
    _libraryRepo.dispose();
    if (_repo is ApiExploreRepository) {
      _repo.dispose();
    }
    controller.dispose();
    explore.dispose();
    feed.dispose();
    library.dispose();
    auth.removeListener(_onAuthChanged);
    auth.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'NextPlay',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        home: _AppShell(
            profile: controller, explore: explore, feed: feed, auth: auth),
      );
}

class _AppShell extends StatefulWidget {
  const _AppShell(
      {required this.profile,
      required this.explore,
      required this.feed,
      required this.auth});
  final ProfileController profile;
  final ExploreController explore;
  final FeedController feed;
  final AuthController auth;
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
      auth: widget.auth,
      child: Scaffold(
        body: ListenableBuilder(
            listenable: widget.explore,
            builder: (context, _) => IndexedStack(
                  index: pageIndex,
                  children: [
                    FeedScreen(
                      controller: widget.feed,
                      auth: widget.auth,
                      active: selected == AppDestination.home,
                      onSearch: () =>
                          setState(() => selected = AppDestination.explore),
                    ),
                    ExploreScreen(controller: widget.explore, auth: widget.auth),
                    ProfileScreen(
                        controller: widget.profile,
                        embedded: true,
                        auth: widget.auth,
                        extraSaved: widget.explore.saved.length),
                    LibraryScreen(
                        controller: widget.explore,
                        onExplore: () =>
                            setState(() => selected = AppDestination.explore)),
                    ForumScreen(controller: forum, games: widget.explore.games, auth: widget.auth),
                  ],
                )),
        bottomNavigationBar: AppBottomNavigation(
            selected: selected,
            onSelected: (destination) {
              setState(() => selected = destination);
            }),
      ));
}
