import 'package:flutter/foundation.dart';
import 'profile_models.dart';
import 'profile_repository.dart';

enum ProfileStatus { loading, ready, empty, error }

class ProfileController extends ChangeNotifier {
  ProfileController(this.repository);
  final ProfileRepository repository;
  ProfileStatus status = ProfileStatus.loading;
  PlayerProfile? profile;
  bool saving = false;
  bool _disposed = false;
  final Set<int> likedReviews = {};

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    status = ProfileStatus.loading;
    _emit();
    try {
      profile = await repository.load();
      status = profile == null ? ProfileStatus.empty : ProfileStatus.ready;
    } catch (_) {
      status = ProfileStatus.error;
    }
    _emit();
  }

  Future<bool> edit(String name, String bio) async {
    if (saving || profile == null || name.trim().isEmpty) return false;
    saving = true;
    _emit();
    try {
      profile = await repository
          .save(profile!.edited(name: name.trim(), bio: bio.trim()));
      return true;
    } catch (_) {
      return false;
    } finally {
      saving = false;
      _emit();
    }
  }

  void toggleReview(int appId) {
    if (!likedReviews.add(appId)) likedReviews.remove(appId);
    _emit();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
