import 'package:flutter/foundation.dart';

/// Configuração central da URL base da API NextPlay.
///
/// Em release, [API_BASE_URL] explícita e HTTPS é obrigatória.
/// Em testes/desenvolvimento, [overrideBaseUrl] tem prioridade; sem ela,
/// [API_BASE_URL] pode apontar para a LAN. O fallback de debug é 10.0.2.2
/// no emulador Android e 127.0.0.1 nas demais plataformas.
/// Nunca espalhe localhost/127.0.0.1 ou identidades hardcoded em outros arquivos.
abstract final class ApiConfig {
  /// Permite sobrescrever a URL em testes ou builds de CI.
  /// Defina antes de criar qualquer repositório.
  static String? overrideBaseUrl;

  /// Permite injetar a URL via linha de comando no build/run:
  /// `--dart-define=API_BASE_URL=http://192.168.0.x:3333/api/v1`
  static const String _envBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// Porta padrão do servidor de desenvolvimento.
  static const int _devPort = 3333;

  /// Caminho base de todas as rotas v1.
  static const String _path = '/api/v1';

  /// URL base completa da API.
  ///
  /// Use este getter em todos os repositórios HTTP do app.
  static String get baseUrl => resolveBaseUrl(
        isRelease: kReleaseMode,
        isAndroidDebug: defaultTargetPlatform == TargetPlatform.android && kDebugMode,
        configuredBaseUrl: _envBaseUrl,
        testOverride: overrideBaseUrl,
      );

  /// Separado do build mode para testar também a política de release.
  static String resolveBaseUrl({
    required bool isRelease,
    required bool isAndroidDebug,
    required String configuredBaseUrl,
    String? testOverride,
  }) {
    if (isRelease) {
      final configured = configuredBaseUrl.trim();
      final uri = Uri.tryParse(configured);
      if (configured.isEmpty || uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
        throw StateError('Release exige API_BASE_URL explícita com HTTPS.');
      }
    } else if (testOverride != null) {
      return testOverride;
    }

    final configured = configuredBaseUrl.trim();
    if (configured.isNotEmpty) {
      final sanitized = configured.endsWith('/')
          ? configured.substring(0, configured.length - 1)
          : configured;
      return sanitized.endsWith(_path) ? sanitized : '$sanitized$_path';
    }

    if (isAndroidDebug) return 'http://10.0.2.2:$_devPort$_path';
    return 'http://127.0.0.1:$_devPort$_path';
  }

  /// Identificador aceito somente quando os testes injetam allowTestUsers no backend.
  static const String devUserId = 'dev-user';
}
