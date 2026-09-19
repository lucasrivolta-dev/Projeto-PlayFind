import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../config/api_config.dart';
import 'auth_repository.dart';

enum AuthStatus { guest, authenticated }

class AuthController extends ChangeNotifier {
  AuthController({AuthRepository? repository})
      : _repository = repository ?? _defaultRepository() {
    final initial = _repository.currentUser;
    if (initial != null) {
      status = AuthStatus.authenticated;
      uid = initial.uid;
      email = initial.email;
      displayName = initial.displayName;
      photoUrl = initial.photoUrl;
      unawaited(loadPlatformPreferences());
    }
    _subscription = _repository.authStateChanges.listen(_onUser);
  }

  final AuthRepository _repository;

  static AuthRepository _defaultRepository() => FirebaseAuthRepository();

  late final StreamSubscription<AuthUser?> _subscription;

  AuthStatus status = AuthStatus.guest;

  String? email;
  String? uid;
  String? displayName;
  String? photoUrl;
  String? errorMessage;
  List<String> preferredPlatforms = [];

  bool get isAuthenticated => status == AuthStatus.authenticated;

  void _onUser(AuthUser? user) {
    if ((user?.uid ?? '') == (uid ?? '') &&
        (user == null) == (status == AuthStatus.guest)) {
      return;
    }
    status = user == null
        ? AuthStatus.guest
        : AuthStatus.authenticated;

    uid = user?.uid;
    email = user?.email;
    displayName = user?.displayName;
    photoUrl = user?.photoUrl;

    if (user == null) {
      preferredPlatforms = [];
    } else {
      unawaited(loadPlatformPreferences());
    }

    notifyListeners();
  }

  Future<bool> signIn({
    String? email,
    String? password,
    bool create = false,
  }) async {
    if (email == null ||
        email.trim().isEmpty ||
        password == null ||
        password.length < 6) {
      return false;
    }

    try {
      final user = create
          ? await _repository.createAccount(
              email: email.trim(),
              password: password,
            )
          : await _repository.signIn(
              email: email.trim(),
              password: password,
            );

      if (user == null) {
        errorMessage = 'Não foi possível autenticar.';
        return false;
      }

      errorMessage = null;
      _onUser(user);

      return true;
    } on FirebaseAuthException catch (error) {
      errorMessage = switch (error.code) {
        'invalid-credential' ||
        'wrong-password' ||
        'user-not-found' =>
          'E-mail ou senha inválidos.',
        'email-already-in-use' => 'Este e-mail já está em uso.',
        'weak-password' => 'Escolha uma senha mais forte.',
        'invalid-email' => 'Digite um e-mail válido.',
        _ => 'Não foi possível conectar. Tente novamente.',
      };

      return false;
    }
  }

  Future<bool> signInWithProvider(String provider) async {
    if (provider != 'Google') {
      return false;
    }

    try {
      final user = await _repository.signInWithGoogle();

      if (user == null) {
        errorMessage = null;
        return false;
      }

      errorMessage = null;
      _onUser(user);

      return true;
    } on FirebaseAuthException catch (error) {
      errorMessage = error.code == 'popup-closed-by-user'
          ? null
          : 'Não foi possível entrar com Google.';

      return false;
    }
  }

  Future<void> signOut() async {
    await _repository.signOut();
    _onUser(null);
  }

  Future<String?> getIdToken() => _repository.getIdToken();

  Future<List<String>> loadPlatformPreferences() async {
    try {
      final token = await getIdToken();
      final uri = Uri.parse('${ApiConfig.baseUrl}/user/preferences/platforms');
      final headers = {
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      };
      final response = await http
          .get(uri, headers: headers)
          .timeout(const Duration(seconds: 10));
      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic> && decoded['data'] is List) {
          final list = (decoded['data'] as List<dynamic>)
              .map((e) => (e as Map<String, dynamic>)['slug']?.toString())
              .whereType<String>()
              .toList();
          preferredPlatforms = list;
          notifyListeners();
          return list;
        }
      }
    } catch (e) {
      debugPrint('[AuthController] loadPlatformPreferences error: $e');
    }
    return preferredPlatforms;
  }

  Future<bool> savePlatformPreferences(List<String> platformSlugs) async {
    try {
      final token = await getIdToken();
      final uri = Uri.parse('${ApiConfig.baseUrl}/user/preferences/platforms');
      final headers = {
        'Content-Type': 'application/json',
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      };
      final response = await http
          .put(
            uri,
            headers: headers,
            body: jsonEncode({'platformSlugs': platformSlugs}),
          )
          .timeout(const Duration(seconds: 10));
      if (response.statusCode == 200) {
        preferredPlatforms = List<String>.from(platformSlugs);
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[AuthController] savePlatformPreferences error: $e');
      return false;
    }
  }

  @override
  void dispose() {
    _subscription.cancel();

    if (_repository case FakeAuthRepository fake) {
      fake.dispose();
    }

    super.dispose();
  }
}
