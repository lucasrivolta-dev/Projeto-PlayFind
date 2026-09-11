import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/features/profile/profile_controller.dart';
import 'package:nextplay/features/profile/profile_models.dart';
import 'package:nextplay/features/profile/profile_repository.dart';

class UnavailableRepository implements ProfileRepository {
  @override
  Future<PlayerProfile?> load() async => throw Exception('Offline');
  @override
  Future<PlayerProfile> save(PlayerProfile profile) async =>
      throw Exception('Offline');
}

class EmptyRepository implements ProfileRepository {
  @override
  Future<PlayerProfile?> load() async => null;
  @override
  Future<PlayerProfile> save(PlayerProfile profile) async => profile;
}

void main() {
  test('Editing survives a reload and preserves unrelated profile data',
      () async {
    final controller = ProfileController(DemoProfileRepository());
    addTearDown(controller.dispose);
    await controller.load();
    final before = controller.profile!;
    expect(await controller.edit('  Marina  ', 'Uma nova aventura'), isTrue);
    await controller.load();
    expect(controller.profile!.name, 'Marina');
    expect(controller.profile!.bio, 'Uma nova aventura');
    expect(controller.profile!.favorites, before.favorites);
    expect(controller.profile!.followers, before.followers);
    expect(await controller.edit('  ', 'Texto'), isFalse);
    expect(controller.profile!.name, 'Marina');
  });

  test('Loading distinguishes an unavailable source from an empty profile',
      () async {
    final failed = ProfileController(UnavailableRepository());
    final empty = ProfileController(EmptyRepository());
    addTearDown(failed.dispose);
    addTearDown(empty.dispose);
    await failed.load();
    await empty.load();
    expect(failed.status, ProfileStatus.error);
    expect(empty.status, ProfileStatus.empty);
  });
}
