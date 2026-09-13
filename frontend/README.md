# NextPlay Frontend

O frontend é um aplicativo Flutter/Dart mobile-first. Para manter a estrutura esperada pelo Flutter e preservar os comandos existentes, o projeto Flutter continua na raiz do repositório.

## Organização

* `lib/` — código de produção Flutter.
  * `design_system/` — tokens e componentes Obsidian Kinetic.
  * `features/` — módulos de Feed, Explorar, Detalhes, Biblioteca, Fórum, Perfil e Auth.
* `assets/` — fontes e recursos locais.
* `android/` — plataforma Android.
* `web/` — plataforma web e shell da prévia.
* `test/` — testes do frontend.
* `pubspec.yaml` — dependências e configuração Flutter.

## Limites

O frontend não acessa IGDB, Steam, PostgreSQL, Prisma ou Firebase Admin. Ele deve consumir apenas a API do NextPlay e usar Firebase Client SDK somente para autenticação quando essa integração for ativada.

Na raiz do projeto, use `.\flutter.ps1 analyze` e `.\flutter.ps1 test`. O diretório `backend/` possui comandos e dependências próprios.

## Trailers reais no For You

O Feed consome `GET /api/v1/feed` e lê `primaryTrailer: { provider, url, videoId }`
no próprio payload, sem buscar detalhes para cada card. O backend já escolhe
YouTube antes de Steam. `TrailerInfo` preserva esses campos; a reprodução atual
aceita `YOUTUBE` com ID de 11 caracteres (letras, números, `_` e `-`). Steam e
provedores futuros são reconhecidos pelo modelo e usam imagem nesta etapa.

`youtube_player_iframe` 6.0.2 controla o iframe oficial; `webview_flutter`
apresenta sua WebView inline pela API pública do controller. Isso evita o
OverlayPortal mobile do widget padrão da versão 6, que cobriria os textos e
botões do Feed. Essas dependências suportam Android, iOS e Web e exigem
Flutter >=3.38/Dart >=3.10 (o SDK local já atende). Não são necessárias chaves
YouTube no cliente.

Existe um único player para todo o Feed, criado apenas ao encontrar um trailer
válido. A troca de jogo pausa o anterior e carrega o próximo no mesmo controller.
Trocar de aba, abrir uma rota sobre o Feed ou colocar o app em segundo plano
pausa a reprodução. Retornar retoma o trailer. Os comandos são serializados e
intenções antigas não podem retomar um vídeo após uma mudança de tela.

O áudio começa mutado; o botão de som é público. Quando o autoplay for bloqueado,
o botão de reprodução permite tentar novamente. O vídeo mantém proporção 16:9,
centralizado na largura do card, sobre a arte de fundo, sem distorção. O Feed
mantém heroUrl, coverUrl e por último o placeholder local como fallback, inclusive
durante preparação ou erro. Não constrói URLs Steam a partir de IDs IGDB.
O carregamento real do Feed não usa catálogo demo se a API estiver indisponível:
mostra erro com tentativa novamente, ou estado vazio quando a API retorna `[]`.

### Validação manual

1. Em `backend/`, inicie a API com `pnpm.cmd run dev`.
2. Na raiz, execute
   `powershell.exe -ExecutionPolicy Bypass -File "./flutter.ps1" run -d edge`.
   Para Android emulator, use o mesmo wrapper com `run -d <id-do-emulador>`.
3. No Edge, abra as ferramentas de desenvolvimento, aba Network, e confira
   a resposta de `/api/v1/feed`: localize Sea of Stars (IGDB 131890), Sunflower
   Land (196770) e Hades (113112), quando estiverem entre os 20 itens retornados.
   Confirme `primaryTrailer.provider = YOUTUBE` e `videoId` não vazio.
4. No For You, deslize até cada jogo. Confira imagem durante preparação, vídeo
   integrado, som inicialmente desligado e controle para ativá-lo. Sunflower
   Land deve funcionar sem Steam App ID. Não deve surgir uma chamada de detalhes
   apenas para iniciar vídeo.
5. Deslize para outro card, mude de aba, abra comentários/detalhes e envie o app
   ao segundo plano: o trailer deve pausar; ao retornar, deve retomar. Teste like
   e Quero jogar com login e confira a Biblioteca.
6. Confira um jogo sem trailer e um vídeo indisponível: a arte deve permanecer,
   com ações acessíveis. Se um dos três jogos não aparecer no `/feed`, ele está
   fora da seleção atual do backend: não faça novo sync nem insira IDs na UI
   apenas para forçá-lo na lista.

Os testes em `test/feed_trailer_test.dart` injetam player e HTTP simulados;
não abrem YouTube, Firebase ou rede real. A reprodução efetiva e as políticas
de autoplay/embedding ainda precisam ser verificadas nos dispositivos alvo.

O controller monta uma WebView estável antes de inicializar o HTML do player.
Carregar usa `loadVideoById`; retomar usa `playVideo` somente depois do load
concluído. Play/Pause acompanha eventos de reprodução, independentemente da
consulta adicional de metadados. Falha mantém Play disponível para recriar o
player e tentar novamente. Essa revisão ainda requer validação real no Edge.

`DiscoveryGame.id` e o estado compartilhado usam o UUID interno de `Game` retornado
pela API. `steamAppId` e `igdbId` continuam metadados opcionais; a Biblioteca
reconstrói seus estados pelo UUID ao recarregar, inclusive para jogos sem IDs
externos. O catálogo demonstrativo usa IDs `demo:` isolados do catálogo real.
Explorar, Detalhes e Biblioteca passam somente o Steam ID
explícito para `GameArtwork`, priorizando hero/cover da API. Jogos IGDB-only não
geram URLs de CDN Steam. Erros CORS de URLs Steam legítimas ainda podem resultar
em placeholder; não há proxy nem alteração global de estratégia HTML.
