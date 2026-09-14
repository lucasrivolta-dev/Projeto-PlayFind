import 'package:flutter/foundation.dart';

/// Configuração central da URL base e identidade de desenvolvimento da API NextPlay.
///
/// Regras de resolução da URL (em ordem):
/// 1. [overrideBaseUrl] — permite injetar uma URL arbitrária em testes.
/// 2. Android emulator em modo debug → 10.0.2.2 (loopback do host físico).
/// 3. Demais plataformas (Web, Windows, iOS Simulator, macOS) → 127.0.0.1.
///
/// Em produção, substitua pela URL pública do backend e troque [devUserId]
/// pelo ID derivado do Firebase ID Token validado.
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

  /// URL base completa — ex.: `http://127.0.0.1:3333/api/v1`.
  ///
  /// Use este getter em todos os repositórios HTTP do app.
  static String get baseUrl {
    if (overrideBaseUrl != null) return overrideBaseUrl!;

    if (_envBaseUrl.isNotEmpty) {
      final sanitized = _envBaseUrl.endsWith('/')
          ? _envBaseUrl.substring(0, _envBaseUrl.length - 1)
          : _envBaseUrl;
      return sanitized.endsWith(_path) ? sanitized : '$sanitized$_path';
    }

    // Android Emulator: o loopback do emulador aponta para 10.0.2.2
    // quando o destino é o host da máquina.
    if (defaultTargetPlatform == TargetPlatform.android && kDebugMode) {
      return 'http://10.0.2.2:$_devPort$_path';
    }

    // Web, Windows, macOS, Linux, iOS Simulator — todos acessam 127.0.0.1.
    return 'http://127.0.0.1:$_devPort$_path';
  }

  /// Identificador temporário de desenvolvimento enviado no header `x-user-id`.
  ///
  /// O backend local aceita apenas este valor, mas o header não comprova
  /// quem enviou a requisição. Este valor é usado somente em
  /// desenvolvimento; em produção será substituído pelo Firebase UID
  /// derivado do token validado.
  ///
  /// Centralizado aqui para evitar hardcoding em múltiplos repositórios.
  static const String devUserId = 'dev-user';
}
