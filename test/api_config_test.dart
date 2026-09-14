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
  });
}
