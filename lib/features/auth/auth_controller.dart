import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import 'auth_repository.dart';

enum AuthStatus { guest, authenticated }

class AuthController extends ChangeNotifier {
  AuthController({AuthRepository? repository})
      : _repository = repository ?? _defaultRepository() {
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

  @override
  void dispose() {
    _subscription.cancel();

    if (_repository case FakeAuthRepository fake) {
      fake.dispose();
    }

    super.dispose();
  }
}
