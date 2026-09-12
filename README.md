# NextPlay / PlaySweep

Telas de Feed, Perfil e Explorar em Flutter, baseadas em `AGENTS.md`, `DESIGN.md` e nas screenshots fornecidas.

## Executar

Flutter 3.47.3 e Dart 3.13.3 estão instalados localmente em `.tools/flutter`, fora do controle de versão. No PowerShell, use o script do projeto para abrir no Edge:

```powershell
.\flutter.ps1 pub get
.\flutter.ps1 run -d edge
```

O script usa temporariamente uma unidade livre (Z:, Y: ou outra) como atalho para a pasta do projeto. Isso contorna falhas das ferramentas Flutter com acentos no caminho do Windows, sem mover arquivos nem modificar o PATH global. A unidade é removida quando o comando termina.

Para abrir a versão web compilada, com Node.js disponível:

```powershell
.\flutter.ps1 build web --no-web-resources-cdn
node scripts/preview.mjs
```

Acesse `http://127.0.0.1:8765`. O servidor fica restrito ao computador local; encerre com Ctrl+C.

O projeto Android já está configurado. Java 21, Android SDK 36, build tools, NDK e ADB estão instalados em `.tools`; o script configura os caminhos necessários. Com o celular conectado por USB e a Depuração USB autorizada:

```powershell
.\flutter.ps1 devices
.\flutter.ps1 run
```

Se houver mais de um dispositivo disponível, selecione o celular na lista. Para gerar novamente o APK de teste:

```powershell
.\flutter.ps1 build apk --debug
```

O arquivo fica em `build/app/outputs/flutter-apk/app-debug.apk`. O aplicativo instalado pode ser aberto no celular sem o cabo. É uma versão de desenvolvimento, assinada com a chave de debug, não uma versão preparada para publicação na loja. A estrutura iOS ainda não foi gerada; o build para iOS exige macOS e Xcode.

## Estrutura

- `lib/design_system`: tokens, tema e componentes compartilhados.
- `lib/features/profile/profile_models.dart`: modelos tipados.
- `lib/features/profile/profile_repository.dart`: contrato de dados e repositório demonstrativo em memória.
- `lib/features/profile/profile_controller.dart`: carregamento, edição e estado das curtidas.
- `lib/features/profile/profile_screen.dart`: tela e formulário de edição.
- `lib/features/profile/profile_widgets.dart`: seções visuais do perfil.

A UI depende do controller; o controller depende do contrato do repositório. Uma futura fonte HTTP autenticada pode substituir o repositório demonstrativo. Nenhum Firebase Admin, banco ou credencial está no cliente.

## Escopo desta entrega

Perfil com apresentação, estatísticas, favoritos, gosto gamer, atividades, avaliações e tópicos. Edição de nome e bio, cópia da apresentação para compartilhar, lista completa dos favoritos, prévia dos jogos e alternância de curtidas funcionam localmente. As alterações duram a sessão, sem persistência após reiniciar o app.

As estatísticas são totais ilustrativos de um perfil fictício; atividades, avaliações e tópicos representam apenas um recorte recente. O avatar usa a inicial do nome porque não foi fornecida uma foto individual. Capas são carregadas pelo CDN da Steam com estados de carregamento e falha, e exigem internet. Sora e Manrope são empacotadas em `assets/fonts`, com suas licenças OFL, e funcionam offline. Antes da distribuição mobile, as permissões de rede das plataformas devem ser verificadas.

O Feed inclui descoberta vertical com hero art, compatibilidade, gêneros, plataformas, curtida, Quero jogar, Já joguei, comentários em bottom sheet, compartilhar e detalhes. Os comentários permanecem sobre o feed e aceitam novas respostas durante a sessão.

Explorar inclui busca local por nome/gênero, filtros combinados de categoria e plataforma, coleções editoriais, cards “Jogaria / Não jogaria”, prévias e uma lista de jogos salvos na sessão. A busca ignora acentos; não há interpretação por IA nem preços ao vivo. As escolhas de gosto são registradas na sessão para uma futura integração de recomendação. Os jogos salvos atualizam também o contador “Quero jogar” do Perfil.

O aplicativo abre em Explorar e permite alternar com Perfil preservando o estado de cada tela. Início, Fórum e Biblioteca ainda não possuem telas completas; seus atalhos informam essa limitação. A ordem do rodapé é fixa: Início, Explorar, Fórum, Biblioteca e Perfil. A animação e o destaque roxo acompanham o item selecionado, sem mover os ícones.

## Decisões de design

A pedido do usuário, a ordem fixa dos cinco destinos substitui a regra anterior de centralização do item ativo. A paleta usa os valores compartilhados pelo texto do Design System e pelo `AGENTS.md`, em vez dos valores divergentes do front matter do `DESIGN.md`. A referência pequena não permite reproduzir todos os textos; o conteúdo demonstrativo preserva as seções e a hierarquia visual. As seções “Em destaque” e “De olho nas ofertas” apresentam seleções demonstrativas sem afirmar lançamentos ou promoções vigentes.

## Validação

```powershell
.\flutter.ps1 analyze
.\flutter.ps1 test
```

Os testes cobrem o Feed e suas ações por jogo, posições fixas e seleção roxa do rodapé, filtros combinados, sequência de escolhas de gosto, edição e recarregamento, rejeição de nome vazio, erro versus perfil vazio, salvamento de jogos compartilhado com Perfil e layout com texto a 100% e 200%.

Última validação do projeto: 19 testes aprovados e análise sem avisos. A interface de Explorar foi conferida no navegador em 390 × 844, incluindo avanço dos cards de descoberta e alternância para Perfil com posições fixas no rodapé. O APK atualizado do Feed foi recompilado com um keystore de debug local do projeto; a instalação automática no S20 FE ficou impedida pelo ambiente de conexão ADB desta sessão.

A versão web do Perfil foi conferida no navegador em 390 × 844: capas carregadas, seções inferiores e edição de nome funcionando.

Android: APK de debug compilado e instalado com sucesso em um Samsung Galaxy S20 FE (SM-G780G). A abertura de `com.example.nextplay/.MainActivity` retornou `Status: ok` e o processo do aplicativo foi confirmado em execução. A permissão de internet foi incluída no manifesto principal e o fundo de inicialização usa o canvas do Design System. Ainda não foi testado em iOS.

## Minha Biblioteca

A aba Biblioteca reúne os jogos salvos no Feed e no Explorar em um estado compartilhado. Inclui Todos, Quero jogar, Já joguei, Favoritos e Avaliações, busca por título, filtro de plataforma, ordenação alfabética e visualizações em grade/lista. Toque em uma capa para gerenciar o jogo e atribuir uma nota de 1 a 5. As alterações permanecem apenas durante a sessão; ainda não há persistência em banco de dados. O rodapé mantém as cinco posições fixas e o destaque roxo animado.

Validação da Biblioteca: testes de estado compartilhado e layout a 320 px com fonte a 100% e 200%; suíte completa com 22 testes aprovados.

## Fórum

Fórum com busca por texto/jogo, categorias, tópicos em alta e recentes. A criação valida título e texto, aceita jogo relacionado e tags opcionais, e abre uma discussão em tela completa. Discussões incluem curtidas, seguir, cópia do texto, respostas e respostas aninhadas, com campo de escrita fixo. Os dados iniciais são demonstrativos e as alterações ficam na sessão; ainda não há publicação em servidor. A navegação principal conserva as cinco posições fixas.

## Detalhes do jogo

Tela completa baseada em `Detalhes do Jogo.png` do ZIP fornecido. Feed, Explorar e Biblioteca abrem a mesma rota, com voltar, capa/hero, dados do catálogo, ações compartilhadas, avaliação, jogos semelhantes e discussões vinculadas. A criação de discussão já seleciona o jogo de origem. Pacific Drive foi incluído com informações presentes na referência. Os campos ausentes são indicados; vídeos e preços ao vivo ainda não estão integrados, e os botões de loja copiam o link oficial da Steam. Os dados continuam limitados à sessão.

## Separação do projeto

O repositório possui duas áreas independentes:

* **Frontend Flutter:** `lib/`, `android/`, `web/`, `assets/` e `test/`. O arquivo `pubspec.yaml` permanece na raiz para preservar os comandos atuais; uma migração futura para uma subpasta é possível.
* **Backend Node/TypeScript:** `backend/src/`, `backend/prisma/`, `backend/package.json` e `backend/.env.example`. O backend concentra API, autenticação validada, integrações IGDB/Steam, Prisma e PostgreSQL.

Cada lado possui seu próprio README. O frontend não contém credenciais ou chamadas das APIs externas; o backend não deve importar widgets Flutter.
