import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

class AuthUser {
  const AuthUser({required this.uid, this.email, this.displayName, this.photoUrl});
  final String uid;
  final String? email, displayName, photoUrl;
}

abstract interface class AuthRepository {
  Stream<AuthUser?> get authStateChanges;
  Future<AuthUser?> signIn({required String email, required String password});
  Future<AuthUser?> createAccount({required String email, required String password});
  Future<AuthUser?> signInWithGoogle();
  Future<void> signOut();
  Future<String?> getIdToken();
}

class FirebaseAuthRepository implements AuthRepository {
  FirebaseAuthRepository({FirebaseAuth? auth, GoogleSignIn? googleSignIn})
      : _auth = auth ?? FirebaseAuth.instance,
        _googleSignIn = kIsWeb ? null : (googleSignIn ?? GoogleSignIn());
  final FirebaseAuth _auth;
  final GoogleSignIn? _googleSignIn;

  AuthUser? _map(User? user) => user == null
      ? null
      : AuthUser(uid: user.uid, email: user.email, displayName: user.displayName, photoUrl: user.photoURL);

  @override
  Stream<AuthUser?> get authStateChanges => _auth.authStateChanges().map(_map);

  @override
  Future<AuthUser?> signIn({required String email, required String password}) async =>
      _map((await _auth.signInWithEmailAndPassword(email: email, password: password)).user);

  @override
  Future<AuthUser?> createAccount({required String email, required String password}) async =>
      _map((await _auth.createUserWithEmailAndPassword(email: email, password: password)).user);

  @override
  Future<AuthUser?> signInWithGoogle() async {
    if (kIsWeb) {
      final result = await _auth.signInWithPopup(GoogleAuthProvider());
      return _map(result.user);
    }
    final account = await _googleSignIn!.signIn();
    if (account == null) return null;
    final credentials = await account.authentication;
    final credential = GoogleAuthProvider.credential(
      accessToken: credentials.accessToken,
      idToken: credentials.idToken,
    );
    return _map((await _auth.signInWithCredential(credential)).user);
  }

  @override
  Future<void> signOut() async {
    if (!kIsWeb) {
      await _googleSignIn?.signOut();
    }
    await _auth.signOut();
  }

  @override
  Future<String?> getIdToken() async {
  final user = _auth.currentUser;

  if (user == null) {
    return null;
  }

  return user.getIdToken();
}
}

class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.user = const AuthUser(uid: 'fake-user', email: 'fake@nextplay.test')});
  final AuthUser user;
  final _changes = StreamController<AuthUser?>.broadcast();
  AuthUser? _current;
  @override
  Stream<AuthUser?> get authStateChanges async* { yield _current; yield* _changes.stream; }
  @override
  Future<AuthUser?> signIn({required String email, required String password}) async => _set(user);
  @override
  Future<AuthUser?> createAccount({required String email, required String password}) async => _set(user);
  @override
  Future<AuthUser?> signInWithGoogle() async => _set(user);
  @override
  Future<void> signOut() async { _current = null; _changes.add(null); }
  @override
  Future<String?> getIdToken() async => _current == null ? null : 'fake-token';
  AuthUser? _set(AuthUser value) { _current = value; _changes.add(value); return value; }
  void dispose() => _changes.close();
}
