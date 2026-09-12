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
  Future<void> toggleFavorite(int gameId);

  /// Atribui uma nota (1-5) ao jogo (implica PLAYED).
  Future<void> rate(int gameId, int rating);

  /// Remove a avaliacao do jogo.
  Future<void> removeRating(int gameId);
}

/// Implementacao sem operacoes reais - estado fica apenas em memoria.
/// Usado como fallback quando a API esta indisponivel.
class NoopLibraryRepository implements LibraryRepository {
  const NoopLibraryRepository();

  @override
  Future<void> loadInto(LibraryStore store) async {}

  @override
  Future<void> setStatus(int gameId, String status) async {}

  @override
  Future<void> remove(int gameId) async {}

  @override
  Future<void> toggleFavorite(int gameId) async {}

  @override
  Future<void> rate(int gameId, int rating) async {}

  @override
  Future<void> removeRating(int gameId) async {}
}

/// Repositorio HTTP que persiste a biblioteca no backend REST.
///
/// Todas as operacoes sao fire-and-forget com fallback gracioso:
/// se a API estiver offline, o estado em memoria do [LibraryStore]
/// ja foi atualizado localmente (o caller faz isso antes de chamar o repo).
///
/// O [userId] pode ser atualizado em tempo de execucao via [setUserId],
/// o que permite trocar o usuario autenticado sem recriar o repositorio.
class ApiLibraryRepository implements LibraryRepository {
  ApiLibraryRepository({
    String? baseUrl,
    String userId = 'dev-user',
    http.Client? client,
    this.timeout = const Duration(seconds: 4),
  })  : baseUrl = baseUrl ?? ApiConfig.baseUrl,
        _userId = userId,
        _client = client ?? http.Client(),
        _ownsClient = client == null;

  final String baseUrl;
  String _userId;

  /// Identificador do usuario enviado no header x-user-id.
  String get userId => _userId;

  final http.Client _client;
  final bool _ownsClient;
  final Duration timeout;

  /// Troca o usuario ativo. A proxima chamada a [loadInto] usara o novo ID.
  void setUserId(String newUserId) {
    _userId = newUserId;
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'x-user-id': _userId,
      };

  String _id(int gameId) => gameId.toString();

  // READ
  @override
  Future<void> loadInto(LibraryStore store) async {
    try {
      final uri = Uri.parse('$baseUrl/library');
      final response =
          await _client.get(uri, headers: _headers).timeout(timeout);

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body) as Map<String, dynamic>;
        final items = (decoded['data'] as List<dynamic>?) ?? [];
        store.loadFromApi(items.whereType<Map<String, dynamic>>().toList());
      }
    } catch (_) {
      // Fallback gracioso: mantém estado em memoria intacto.
    }
  }

  // WRITE
  @override
  Future<void> setStatus(int gameId, String status) async {
    try {
      final uri = Uri.parse('$baseUrl/library/${_id(gameId)}');
      await _client
          .put(uri, headers: _headers, body: jsonEncode({'status': status}))
          .timeout(timeout);
    } catch (_) {}
  }

  @override
  Future<void> remove(int gameId) async {
    try {
      final uri = Uri.parse('$baseUrl/library/${_id(gameId)}');
      await _client.delete(uri, headers: _headers).timeout(timeout);
    } catch (_) {}
  }

  @override
  Future<void> toggleFavorite(int gameId) async {
    try {
      final uri = Uri.parse('$baseUrl/library/${_id(gameId)}/favorite');
      await _client.post(uri, headers: _headers).timeout(timeout);
    } catch (_) {}
  }

  @override
  Future<void> rate(int gameId, int rating) async {
    try {
      final uri = Uri.parse('$baseUrl/library/${_id(gameId)}/rate');
      await _client
          .post(uri, headers: _headers, body: jsonEncode({'rating': rating}))
          .timeout(timeout);
    } catch (_) {}
  }

  @override
  Future<void> removeRating(int gameId) async {
    try {
      final uri = Uri.parse('$baseUrl/library/${_id(gameId)}/rate');
      await _client.delete(uri, headers: _headers).timeout(timeout);
    } catch (_) {}
  }

  void dispose() {
    if (_ownsClient) _client.close();
  }
}
