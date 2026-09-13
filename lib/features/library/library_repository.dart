import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../config/api_config.dart';
import 'library_store.dart';

/// Contrato para persistência da biblioteca do usuário.
abstract interface class LibraryRepository {
  /// Carrega o estado da biblioteca do backend e popula [store].
  Future<void> loadInto(LibraryStore store);

  /// Define o status do jogo ([gameId]) como WANT_TO_PLAY ou PLAYED.
  Future<void> setStatus(int gameId, String status);

  /// Remove o jogo da biblioteca.
  Future<void> remove(int gameId);

  /// Alterna favorito do jogo.
  Future<void> toggleFavorite(int gameId, {bool? isFavorite});

  /// Alterna a curtida do jogo.
  Future<bool?> toggleLike(int gameId);

  /// Atribui uma nota (1-5) ao jogo (implica PLAYED).
  Future<void> rate(int gameId, int rating);

  /// Remove a avaliacao do jogo.
  Future<void> removeRating(int gameId);
}

/// Implementacao sem persistencia, usada apenas em testes e prototipos isolados.
class NoopLibraryRepository implements LibraryRepository {
  const NoopLibraryRepository();

  @override
  Future<void> loadInto(LibraryStore store) async {}

  @override
  Future<void> setStatus(int gameId, String status) async {}

  @override
  Future<void> remove(int gameId) async {}

  @override
  Future<void> toggleFavorite(int gameId, {bool? isFavorite}) async {}

  @override
  Future<bool?> toggleLike(int gameId) async => null;

  @override
  Future<void> rate(int gameId, int rating) async {}

  @override
  Future<void> removeRating(int gameId) async {}
}

/// Repositorio HTTP que persiste a biblioteca no backend REST.
///
/// As mutações lançam erro em falhas HTTP para permitir rollback no store.
///
/// Em producao, o identificador temporario e sempre `dev-user` ate a
/// autenticacao real substituir este contrato.
class ApiLibraryRepository implements LibraryRepository {
  ApiLibraryRepository({
    String? baseUrl,
    String? userId,
    http.Client? client,
    Future<String?> Function()? tokenProvider,
    this.timeout = const Duration(seconds: 4),
  })  : baseUrl = baseUrl ?? ApiConfig.baseUrl,
        _userId = userId ?? ApiConfig.devUserId,
        _client = client ?? http.Client(),
        _ownsClient = client == null,
        _tokenProvider = tokenProvider;

  final String baseUrl;
  final String _userId;

  /// Identificador do usuario enviado no header x-user-id.
  String get userId => _userId;

  final http.Client _client;
  final bool _ownsClient;
  final Duration timeout;
  final Future<String?> Function()? _tokenProvider;

  Future<Map<String, String>> _headers({required bool hasBody}) async {
    final token = await _tokenProvider?.call();
    return {
      if (hasBody) 'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token'
      else if (_tokenProvider == null) 'x-user-id': _userId,
    };
  }

  String _id(int gameId) => gameId.toString();

  // READ
  @override
  Future<void> loadInto(LibraryStore store) async {
    final revision = store.revision;
    try {
      final uri = Uri.parse('$baseUrl/library');
      final response =
          await _client.get(uri, headers: await _headers(hasBody: false)).timeout(timeout);

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body) as Map<String, dynamic>;
        final items = (decoded['data'] as List<dynamic>?) ?? [];
        final likes = (decoded['likes'] as List<dynamic>?) ?? [];
        store.loadFromApi(items.whereType<Map<String, dynamic>>().toList(),
            likedGames: likes.whereType<Map<String, dynamic>>().toList(),
            preserveIds: store.idsChangedSince(revision),
            preserveLikedIds: store.likedIdsChangedSince(revision));
      } else {
        throw StateError('Library load failed: ${response.statusCode}');
      }
    } catch (_) {
      store.reportLoadFailure();
      rethrow;
    }
  }

  // WRITE
  @override
  Future<void> setStatus(int gameId, String status) async {
    final uri = Uri.parse('$baseUrl/library/${_id(gameId)}');
    final response = await _client
        .put(uri, headers: await _headers(hasBody: true), body: jsonEncode({'status': status}))
        .timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Library status update failed: ${response.statusCode}');
    }
  }

  @override
  Future<void> remove(int gameId) async {
    final uri = Uri.parse('$baseUrl/library/${_id(gameId)}');
    final response = await _client.delete(uri, headers: await _headers(hasBody: false)).timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Library removal failed: ${response.statusCode}');
    }
  }

  @override
  Future<void> toggleFavorite(int gameId, {bool? isFavorite}) async {
    final uri = Uri.parse('$baseUrl/library/${_id(gameId)}/favorite');
    final response = await _client
        .post(uri,
            headers: await _headers(hasBody: true),
            body: jsonEncode({'isFavorite': isFavorite ?? true}))
        .timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Library favorite update failed: ${response.statusCode}');
    }
  }

  @override
  Future<bool?> toggleLike(int gameId) async {
    final uri = Uri.parse('$baseUrl/library/${_id(gameId)}/like');
    final response = await _client.post(uri, headers: await _headers(hasBody: false)).timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Game like update failed: ${response.statusCode}');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (body['liked'] is! bool) {
      throw StateError('Game like response missing liked state');
    }
    return body['liked'] as bool;
  }

  @override
  Future<void> rate(int gameId, int rating) async {
    final uri = Uri.parse('$baseUrl/library/${_id(gameId)}/rate');
    final response = await _client
        .post(uri, headers: await _headers(hasBody: true), body: jsonEncode({'rating': rating}))
        .timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Library rating update failed: ${response.statusCode}');
    }
  }

  @override
  Future<void> removeRating(int gameId) async {
    final uri = Uri.parse('$baseUrl/library/${_id(gameId)}/rate');
    final response =
        await _client.delete(uri, headers: await _headers(hasBody: false)).timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Library rating removal failed: ${response.statusCode}');
    }
  }

  void dispose() {
    if (_ownsClient) _client.close();
  }
}
