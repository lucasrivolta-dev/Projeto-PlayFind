import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../../config/api_config.dart';
import 'library_store.dart';

/// Contrato para persistência da biblioteca do usuário.
abstract interface class LibraryRepository {
  /// Carrega o estado da biblioteca do backend e popula [store].
  Future<void> loadInto(LibraryStore store);

  /// Define o estado de curtida de forma idempotente e explícita.
  Future<bool> setLiked(String gameId, bool liked);

  /// [gameId] é sempre o UUID interno de Game, não Steam/IGDB.
  /// Define o status como WANT_TO_PLAY ou PLAYED.
  Future<void> setStatus(String gameId, String status);

  /// Remove o jogo da biblioteca.
  Future<void> remove(String gameId);

  /// Alterna favorito do jogo.
  Future<void> toggleFavorite(String gameId, {bool? isFavorite});

  /// Alterna a curtida do jogo (legado).
  Future<bool?> toggleLike(String gameId);

  /// Atribui uma nota (1-5) ao jogo (implica PLAYED).
  Future<void> rate(String gameId, int rating);

  /// Remove a avaliacao do jogo.
  Future<void> removeRating(String gameId);
}

/// Implementacao sem persistencia, usada apenas em testes e prototipos isolados.
class NoopLibraryRepository implements LibraryRepository {
  const NoopLibraryRepository();

  @override
  Future<void> loadInto(LibraryStore store) async {}

  @override
  Future<bool> setLiked(String gameId, bool liked) async => liked;

  @override
  Future<void> setStatus(String gameId, String status) async {}

  @override
  Future<void> remove(String gameId) async {}

  @override
  Future<void> toggleFavorite(String gameId, {bool? isFavorite}) async {}

  @override
  Future<bool?> toggleLike(String gameId) async => null;

  @override
  Future<void> rate(String gameId, int rating) async {}

  @override
  Future<void> removeRating(String gameId) async {}
}

/// Repositorio HTTP que persiste a biblioteca no backend REST.
///
/// As mutações lançam erro em falhas HTTP para permitir rollback no store.
///
/// No app, a identidade vem do Firebase ID Token fornecido por [tokenProvider].
/// O header legado x-user-id só atende testes locais com allowTestUsers injetado.
class ApiLibraryRepository implements LibraryRepository {
  ApiLibraryRepository({
    String? baseUrl,
    String? userId,
    http.Client? client,
    Future<String?> Function()? tokenProvider,
    Duration readTimeout = const Duration(seconds: 40),
    this.retryReadTimeout = const Duration(seconds: 15),
    Duration writeTimeout = const Duration(seconds: 10),
    Duration? timeout,
  })  : baseUrl = baseUrl ?? ApiConfig.baseUrl,
        _userId = userId ?? ApiConfig.devUserId,
        _client = client ?? http.Client(),
        _ownsClient = client == null,
        _tokenProvider = tokenProvider,
        readTimeout = timeout ?? readTimeout,
        writeTimeout = timeout ?? writeTimeout;

  final String baseUrl;
  final String _userId;

  /// Identificador legado para testes locais sem [tokenProvider].
  String get userId => _userId;

  final http.Client _client;
  final bool _ownsClient;
  final Duration readTimeout;
  final Duration retryReadTimeout;
  final Duration writeTimeout;
  final Future<String?> Function()? _tokenProvider;

  /// Getter de compatibilidade com testes que inspecionam timeout.
  Duration get timeout => writeTimeout;

  Future<Map<String, String>> _headers({required bool hasBody}) async {
    final token = await _tokenProvider?.call();
    return {
      if (hasBody) 'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token'
      else if (_tokenProvider == null) 'x-user-id': _userId,
    };
  }

  String _id(String gameId) => Uri.encodeComponent(gameId);

  // READ com tolerância a cold start do Render e no máximo 1 retry
  @override
  Future<void> loadInto(LibraryStore store) async {
    final revision = store.revision;
    final uri = Uri.parse('$baseUrl/library');
    debugPrint('[ApiLibraryRepo] loadInto start (timeout: ${readTimeout.inSeconds}s)');

    http.Response? response;
    try {
      response = await _client
          .get(uri, headers: await _headers(hasBody: false))
          .timeout(readTimeout);
    } catch (e) {
      debugPrint('[ApiLibraryRepo] loadInto initial attempt failed: $e. Retrying once (${retryReadTimeout.inSeconds}s)...');
      try {
        response = await _client
            .get(uri, headers: await _headers(hasBody: false))
            .timeout(retryReadTimeout);
      } catch (retryErr) {
        debugPrint('[ApiLibraryRepo] loadInto retry failed: $retryErr');
        store.reportLoadFailure();
        rethrow;
      }
    }

    if (response.statusCode == 200) {
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final items = (decoded['data'] as List<dynamic>?) ?? [];
      final likes = (decoded['likes'] as List<dynamic>?) ?? [];
      debugPrint('[ApiLibraryRepo] loadInto success: ${items.length} items, ${likes.length} likes');
      store.loadFromApi(
        items.whereType<Map<String, dynamic>>().toList(),
        likedGames: likes.whereType<Map<String, dynamic>>().toList(),
        preserveIds: store.idsChangedSince(revision),
        preserveLikedIds: store.likedIdsChangedSince(revision),
      );
    } else {
      debugPrint('[ApiLibraryRepo] loadInto failed with HTTP ${response.statusCode}');
      store.reportLoadFailure();
      throw StateError('Library load failed: ${response.statusCode}');
    }
  }

  // Idempotent PATCH helper com no máximo 1 retry para falhas de rede transitórias
  Future<Map<String, dynamic>> _patchInteraction(
    String gameId,
    Map<String, dynamic> patch, {
    required String label,
  }) async {
    final uri = Uri.parse('$baseUrl/library/${_id(gameId)}/interaction');
    final body = jsonEncode(patch);

    Future<http.Response> execute() async {
      return _client
          .patch(uri, headers: await _headers(hasBody: true), body: body)
          .timeout(writeTimeout);
    }

    http.Response response;
    try {
      response = await execute();
    } catch (e) {
      debugPrint('[ApiLibraryRepo] $label initial call failed: $e. Retrying once...');
      try {
        response = await execute();
      } catch (retryErr) {
        debugPrint('[ApiLibraryRepo] $label retry failed: $retryErr');
        rethrow;
      }
    }

    debugPrint('[ApiLibraryRepo] $label game=$gameId status=${response.statusCode}');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('$label failed: ${response.statusCode}');
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  // WRITE
  @override
  Future<bool> setLiked(String gameId, bool liked) async {
    final data = await _patchInteraction(
      gameId,
      {'liked': liked},
      label: 'setLiked($liked)',
    );
    return (data['liked'] as bool?) ?? liked;
  }

  @override
  Future<void> setStatus(String gameId, String status) async {
    await _patchInteraction(
      gameId,
      {'status': status},
      label: 'setStatus($status)',
    );
  }

  @override
  Future<void> remove(String gameId) async {
    await _patchInteraction(
      gameId,
      {'status': null},
      label: 'remove',
    );
  }

  @override
  Future<void> rate(String gameId, int rating) async {
    await _patchInteraction(
      gameId,
      {'rating': rating},
      label: 'rate($rating)',
    );
  }

  @override
  Future<void> removeRating(String gameId) async {
    await _patchInteraction(
      gameId,
      {'rating': null},
      label: 'removeRating',
    );
  }

  @override
  Future<void> toggleFavorite(String gameId, {bool? isFavorite}) async {
    await _patchInteraction(
      gameId,
      {'isFavorite': isFavorite ?? true},
      label: 'toggleFavorite',
    );
  }

  @override
  Future<bool?> toggleLike(String gameId) async {
    // Compatibilidade: chama setLiked explicitamente
    return setLiked(gameId, true);
  }

  void dispose() {
    if (_ownsClient) _client.close();
  }
}
