import 'package:flutter/foundation.dart';

/// Configuração central da URL base da API NextPlay.
///
/// Regras de resolução (em ordem):
/// 1. [overrideBaseUrl] — permite injetar uma URL arbitrária em testes.
/// 2. Android emulator em modo debug → 10.0.2.2 (loopback do host físico).
/// 3. Demais plataformas (Web, Windows, iOS Simulator, macOS) → 127.0.0.1.
///
/// Em produção, substitua pela URL pública do backend.
/// Nunca espalhe localhost/127.0.0.1 em outros arquivos — use sempre esta classe.
abstract final class ApiConfig {
  /// Permite sobrescrever a URL em testes ou builds de CI.
  /// Defina antes de criar qualquer repositório.
  static String? overrideBaseUrl;

  /// Porta padrão do servidor de desenvolvimento.
  static const int _devPort = 3333;

  /// Caminho base de todas as rotas v1.
  static const String _path = '/api/v1';

  /// URL base completa — ex.: `http://127.0.0.1:3333/api/v1`.
  ///
  /// Use este getter em todos os repositórios HTTP do app.
  static String get baseUrl {
    if (overrideBaseUrl != null) return overrideBaseUrl!;

    // Android Emulator: o loopback do emulador aponta para 10.0.2.2
    // quando o destino é o host da máquina.
    if (defaultTargetPlatform == TargetPlatform.android && kDebugMode) {
      return 'http://10.0.2.2:$_devPort$_path';
    }

    // Web, Windows, macOS, Linux, iOS Simulator — todos acessam 127.0.0.1.
    return 'http://127.0.0.1:$_devPort$_path';
  }
}
