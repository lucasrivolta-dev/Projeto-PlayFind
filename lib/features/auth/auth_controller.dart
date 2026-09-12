import 'package:flutter/foundation.dart';

enum AuthStatus { guest, authenticated }

class AuthController extends ChangeNotifier {
  AuthStatus status = AuthStatus.guest;
  String? email;

  bool get isAuthenticated => status == AuthStatus.authenticated;

  /// Identificador único do usuário para uso na API.
  /// Usa o email normalizado quando autenticado, ou 'dev-user' como fallback.
  String get userId {
    if (!isAuthenticated || email == null) return 'dev-user';
    // Remove caracteres inválidos para header HTTP e normaliza.
    return email!.trim().toLowerCase().replaceAll(RegExp(r'[^\w@.\-]'), '_');
  }

  Future<bool> signIn({String? email, String? password}) async {
    if (email == null ||
        email.trim().isEmpty ||
        password == null ||
        password.length < 6) {
      return false;
    }
    this.email = email.trim();
    status = AuthStatus.authenticated;
    notifyListeners();
    return true;
  }

  Future<void> signInWithProvider(String provider) async {
    email = provider == 'Google'
        ? 'google-user@nextplay.demo'
        : 'apple-user@nextplay.demo';
    status = AuthStatus.authenticated;
    notifyListeners();
  }

  void signOut() {
    status = AuthStatus.guest;
    email = null;
    notifyListeners();
  }
}
