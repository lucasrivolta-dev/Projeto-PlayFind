import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/design_system/theme.dart';
import 'package:nextplay/features/profile/profile_controller.dart';
import 'package:nextplay/features/profile/profile_repository.dart';
import 'package:nextplay/features/profile/profile_screen.dart';

void main() {
  Future<void> render(
      WidgetTester tester, double width, double textScale) async {
    final previousErrorHandler = FlutterError.onError;
    FlutterError.onError = (details) {
      debugPrint(details.toString());
      previousErrorHandler?.call(details);
    };
    addTearDown(() => FlutterError.onError = previousErrorHandler);
    tester.view.physicalSize = Size(width, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = ProfileController(DemoProfileRepository());
    addTearDown(controller.dispose);
    await controller.load();
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: ProfileScreen(controller: controller),
    ));
    await tester.pumpAndSettle();
  }

  for (final width in [320.0, 390.0, 600.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets(
          'Profile has no layout errors at width $width and text scale $scale',
          (tester) async {
        await render(tester, width, scale);
        expect(tester.takeException(), isNull);
        for (var i = 0; i < 16; i++) {
          await tester.drag(find.byType(ListView).first, const Offset(0, -500));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
      });
    }
  }

  testWidgets('Profile editor validates and displays saved changes',
      (tester) async {
    await render(tester, 390, 1);
    await tester.tap(find.text('Editar perfil'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, '');
    await tester.tap(find.text('Salvar alterações'));
    await tester.pumpAndSettle();
    expect(find.text('Informe seu nome.'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'Marina');
    await tester.enterText(
        find.byType(TextFormField).last, 'Explorando novos mundos.');
    await tester.tap(find.text('Salvar alterações'));
    await tester.pumpAndSettle();
    expect(find.text('Marina'), findsOneWidget);
    expect(find.text('Explorando novos mundos.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
