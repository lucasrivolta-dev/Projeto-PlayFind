import 'dart:async';
import 'package:flutter/material.dart';
import 'auth_controller.dart';
import 'auth_screen.dart';

/// Runs a mutating action only after authentication succeeds.
/// Public browsing actions should call their handlers directly.
Future<void> requireAuthentication(
  BuildContext context,
  AuthController? auth,
  FutureOr<void> Function() action,
) async {
  if (auth == null) return action();
  if (!auth.isAuthenticated) {
    final loggedIn = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => AuthScreen(controller: auth)),
    );
    if (loggedIn != true || !auth.isAuthenticated || !context.mounted) return;
  }
  await action();
}
