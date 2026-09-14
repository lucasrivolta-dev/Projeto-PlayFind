import 'package:flutter_test/flutter_test.dart';
import 'package:nextplay/config/api_config.dart';

void main() {
  group('ApiConfig', () {
    tearDown(() {
      ApiConfig.overrideBaseUrl = null;
    });

    test('retorna overrideBaseUrl quando definido', () {
      ApiConfig.overrideBaseUrl = 'http://192.168.1.50:3333/api/v1';
      expect(ApiConfig.baseUrl, 'http://192.168.1.50:3333/api/v1');
    });

    test('devUserId possui valor padrão de desenvolvimento', () {
      expect(ApiConfig.devUserId, 'dev-user');
    });

    test('baseUrl possui rota /api/v1', () {
      expect(ApiConfig.baseUrl.endsWith('/api/v1'), isTrue);
    });

    test('debug preserva emulador Android, LAN e fallback local', () {
      expect(
        ApiConfig.resolveBaseUrl(
          isRelease: false,
          isAndroidDebug: true,
          configuredBaseUrl: '',
        ),
        'http://10.0.2.2:3333/api/v1',
      );
      expect(
        ApiConfig.resolveBaseUrl(
          isRelease: false,
          isAndroidDebug: true,
          configuredBaseUrl: 'http://192.168.1.50:3333/',
        ),
        'http://192.168.1.50:3333/api/v1',
      );
      expect(
        ApiConfig.resolveBaseUrl(
          isRelease: false,
          isAndroidDebug: false,
          configuredBaseUrl: '',
        ),
        'http://127.0.0.1:3333/api/v1',
      );
    });

    test('release exige API_BASE_URL explícita e HTTPS', () {
      for (final url in ['', 'http://api.example.com', 'https://', 'not-a-url']) {
        expect(
          () => ApiConfig.resolveBaseUrl(
            isRelease: true,
            isAndroidDebug: false,
            configuredBaseUrl: url,
            testOverride: 'http://override.test',
          ),
          throwsStateError,
        );
      }
      expect(
        ApiConfig.resolveBaseUrl(
          isRelease: true,
          isAndroidDebug: false,
          configuredBaseUrl: 'https://api.example.com/',
        ),
        'https://api.example.com/api/v1',
      );
    });
  });
}
