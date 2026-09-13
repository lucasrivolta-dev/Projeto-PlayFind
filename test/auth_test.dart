import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/design_system/theme.dart';
import 'package:nextplay/features/auth/auth_controller.dart';
import 'package:nextplay/features/auth/auth_repository.dart';
import 'package:nextplay/features/auth/auth_screen.dart';

void main() {
  test('Auth stays guest until a valid provider or email login', () async {
    final auth = AuthController(
      repository: FakeAuthRepository(),
    );

    expect(auth.isAuthenticated, isFalse);

    expect(
      await auth.signIn(
        email: 'invalido',
        password: '123',
      ),
      isFalse,
    );

    expect(auth.isAuthenticated, isFalse);

    expect(
      await auth.signInWithProvider('Google'),
      isTrue,
    );

    await Future<void>.delayed(Duration.zero);

    expect(auth.isAuthenticated, isTrue);

    await auth.signOut();

    await Future<void>.delayed(Duration.zero);

    expect(auth.isAuthenticated, isFalse);

    auth.dispose();
  });

  testWidgets(
    'Auth screen offers guest, email, Google and Apple paths',
    (tester) async {
      final auth = AuthController(
        repository: FakeAuthRepository(),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: AuthScreen(controller: auth),
        ),
      );

      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Continuar como visitante'), findsOneWidget);
      expect(find.text('Continuar com Google'), findsOneWidget);
      expect(find.text('Continuar com Apple'), findsOneWidget);
      expect(find.text('Criar minha conta'), findsNothing);

      await tester.tap(find.text('Criar conta'));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Criar minha conta'), findsOneWidget);
    },
  );
}