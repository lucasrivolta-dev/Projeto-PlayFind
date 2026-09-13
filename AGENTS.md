# AGENTS.md — Instruções do projeto NextPlay / PlaySweep

Escopo: estas instruções se aplicam a todo o repositório. Use este documento como referência de produto, arquitetura, regras operacionais e Design System.

O projeto já está em implementação ativa. Não crie funcionalidades, telas, migrations, refactors amplos ou mudanças de arquitetura sem solicitação específica. Preserve o estado atual do repositório e qualquer trabalho não commitado.

Antes de implementar, leia este documento, inspecione git status --short e git diff, e consulte as screenshots/referências fornecidas para a tarefa. Não invente referências visuais ausentes. Se uma decisão entrar em conflito com screenshots, requisitos atuais ou o Style Guide, avise antes de alterar o design.

O NextPlay já possui frontend Flutter, backend Fastify/TypeScript, PostgreSQL/Prisma, Firebase Authentication e integração de catálogo IGDB + Steam em diferentes níveis de implementação.

As telas descritas na seção 32 já foram solicitadas e implementadas. Novas telas e funcionalidades continuam dependendo de solicitação do usuário.

Use este arquivo como especificação permanente, mas dê prioridade a requisitos mais recentes e explícitos fornecidos pelo usuário para a tarefa atual.

---

# 1. O PRODUTO

Estamos desenvolvendo um aplicativo mobile de descoberta de videogames.

O nome atual do projeto pode aparecer como NextPlay ou PlaySweep. Trata-se do mesmo projeto.

A principal pergunta que o aplicativo resolve é:

“Não sei o que jogar. O que eu poderia jogar agora?”

A proposta é combinar:

* descoberta rápida semelhante a TikTok/Reels;

* recomendação personalizada;

* catálogo de jogos;

* biblioteca pessoal;

* avaliações;

* fórum/comunidade;

* busca inteligente por características;

* sistema de swipe para aprender o gosto do usuário.

O aplicativo NÃO é uma loja de jogos e NÃO é uma rede social de vídeos.

Usuários não publicam vídeos.

Os vídeos exibidos no feed serão trailers, teasers e gameplays relacionados aos jogos do catálogo.

O principal fluxo do produto é:

DESCOBRIR → SE INTERESSAR → SALVAR → JOGAR

Um momento de sucesso do produto seria:

Usuário entra sem saber o que jogar → encontra um jogo desconhecido → abre os detalhes → adiciona em “Quero jogar”.

---

# 2. PRINCIPAIS ÁREAS

A navegação principal possui cinco áreas:

1. Início / For You

2. Explorar

3. Fórum

4. Biblioteca

5. Perfil

## Início / For You

Feed vertical de descoberta.

Cada item do feed representa um jogo.

O conteúdo principal é trailer/gameplay.

Informações rápidas:

* nome;

* gêneros;

* plataformas;

* nota;

* preço;

* pequena descrição;

* compatibilidade com o usuário.

Ações:

* Curtir;

* Quero jogar;

* Já joguei;

* Não tenho interesse;

* Comentários;

* Compartilhar;

* Ver jogo.

---

# 3. RECOMENDAÇÕES

O aplicativo deve futuramente aprender o gosto do jogador utilizando sinais como:

* gêneros favoritos;

* plataformas;

* jogos curtidos;

* jogos salvos;

* jogos já jogados;

* avaliações;

* tempo assistindo a um jogo no feed;

* pesquisas;

* “Não tenho interesse”;

* comportamento no sistema de swipe.

Não queremos criar uma bolha.

O feed deve misturar:

* jogos com alta compatibilidade;

* jogos relacionados ao gosto atual;

* descobertas inesperadas.

---

# 4. EXPLORAR E BUSCA INTELIGENTE

Explorar é diferente do For You.

For You = descoberta passiva.

Explorar = usuário sabe aproximadamente o que deseja.

Exemplos de categorias:

* Lançamentos;

* Hidden Gems;

* Promoções;

* Gratuitos;

* Co-op;

* Indies;

* Terror;

* RPG;

* Mundo aberto;

* Para jogar com amigos.

Também haverá uma busca inteligente.

Exemplo:

“Quero um jogo de terror cooperativo para jogar com 3 amigos.”

O sistema deve futuramente interpretar coisas como:

gênero = terror

modo = cooperativo

jogadores >= 3

Outros exemplos:

“Quero algo parecido com Subnautica mas multiplayer.”

“Quero um RPG curto.”

“Quero um jogo coop barato para PC fraco.”

---

# 5. SWIPE DISCOVERY

Dentro de Explorar haverá uma experiência rápida para ensinar o gosto do usuário ao algoritmo.

Um jogo aparece em um card grande.

Usuário escolhe:

Jogaria

ou

Não jogaria.

Também poderá existir swipe esquerda/direita.

Isso alimentará o perfil de recomendação.

---

# 6. DETALHES DO JOGO

Cada jogo possui página própria.

Informações:

* título;

* capa;

* hero/trailer;

* desenvolvedora;

* publisher;

* nota;

* gêneros;

* plataformas;

* lançamento;

* single-player/multiplayer;

* quantidade de jogadores;

* descrição.

Ações:

* Quero jogar;

* Já joguei;

* Favoritar;

* Avaliar.

Seções:

* Sobre;

* Informações;

* Gameplay/Trailers;

* Onde jogar;

* Jogos parecidos;

* Comunidade/Fórum.

---

# 7. COMENTÁRIOS

Os comentários do For You NÃO abrem outra tela.

Devem abrir um Bottom Sheet sobre o feed.

O usuário continua visualizando parcialmente o jogo atrás.

Comentários possuem:

* avatar;

* username;

* texto;

* horário;

* curtir;

* responder.

Respostas podem ficar ligeiramente recuadas.

Campo de comentário fixo na parte inferior.

---

# 8. FÓRUM

O Fórum é a principal área de conteúdo criado pelos usuários.

Usuários podem:

* criar tópicos;

* responder;

* curtir;

* seguir discussões;

* relacionar uma discussão a um jogo.

O Fórum é principalmente textual.

Um tópico abre uma tela completa de discussão.

Isso é diferente dos comentários do For You.

---

# 9. BIBLIOTECA

Biblioteca pessoal com categorias:

* Quero jogar;

* Já joguei;

* Favoritos;

* Avaliações.

Jogos devem aparecer principalmente através das capas.

Uma ação feita em outra parte do app deve refletir na Biblioteca.

Exemplo:

For You

→ usuário marca “Quero jogar”

→ jogo aparece imediatamente em Biblioteca > Quero jogar.

---

# 10. PERFIL

Perfil inclui:

* avatar;

* nome;

* username;

* bio;

* seguidores;

* seguindo.

Estatísticas:

* jogos jogados;

* quero jogar;

* avaliações;

* tópicos.

Também possui:

* jogos favoritos;

* gosto gamer;

* atividade recente;

* avaliações;

* tópicos publicados.

---

# 11. FRONTEND

O frontend será desenvolvido em:

Flutter / Dart.

O aplicativo deve ser mobile-first.

Android e iOS são as plataformas principais.

A referência de design utilizada originalmente é aproximadamente:

390 × 844 px.

Isso é apenas uma referência de layout.

NÃO devemos fixar a interface em 390×844.

O Flutter deve se adaptar corretamente a diferentes tamanhos de smartphones, safe areas e proporções de tela.

---

# 12. BACKEND

Backend:

Node.js + TypeScript.

Banco:

PostgreSQL.

ORM:

Prisma.

O backend será responsável por dados do aplicativo, por exemplo:

* usuários;

* perfis;

* jogos;

* biblioteca;

* avaliações;

* likes;

* comentários;

* fórum;

* respostas;

* preferências;

* histórico relevante para recomendações.

Não armazenaremos senha de usuário no PostgreSQL.

---

# 13. AUTENTICAÇÃO

A autenticação é feita através do Firebase Authentication.

Estado atual:

* Email + senha — implementado;

* Google — implementado;

* Apple — permanece planejado até que seja configurado e solicitado explicitamente.

Fluxo esperado:

Flutter

→ Firebase Authentication

→ usuário autentica

→ Firebase retorna ID Token

→ Flutter envia token para nossa API usando Authorization: Bearer <token>

→ Node.js recebe token

→ Firebase Admin SDK valida o token

→ backend identifica o Firebase UID

→ backend encontra/cria o usuário correspondente no PostgreSQL.

Firebase Admin SDK será utilizado SOMENTE no backend.

O app Flutter nunca terá credenciais administrativas do Firebase.

O usuário da nossa aplicação deverá ser relacionado ao Firebase através de algo como:

firebaseUid

no registro do usuário no PostgreSQL.

Firebase será responsável pela identidade/autenticação.

PostgreSQL será responsável pelos dados do produto.

---

# 14. DESIGN SYSTEM

Nome do Design System:

OBSIDIAN KINETIC

Direção visual:

Premium Dark Gaming

+

Architectural Minimalism

+

Dark Glassmorphism

O app deve parecer uma plataforma premium/editorial de videogames.

NÃO queremos:

* RGB gamer exagerado;

* neon em todo lugar;

* cyberpunk genérico;

* bordas brilhantes em tudo;

* interface cheia de efeitos;

* sombras genéricas excessivas;

* poluição visual.

A arte dos jogos deve ser a protagonista.

A interface deve recuar visualmente para permitir que capas, trailers e screenshots chamem atenção.

---

# 15. PALETA PRINCIPAL

Criar tokens centralizados no Flutter.

Nunca espalhar cores hardcoded pelas telas.

Principais cores:

Canvas / Background:

#0B0E14

Surface Low:

#12161F

Surface Container:

#161B22

Surface High:

#1F2633

Primary / Electric Violet:

#8B5CF6

Primary Active / Deep Violet:

#7C3AED

Secondary / Cyber Emerald:

#10B981

Text Primary:

#F9FAFB

Text Secondary:

#94A3B8

Text Muted:

#64748B

Glass Surface:

rgba(22, 27, 34, 0.72)

Border Glass:

rgba(255, 255, 255, 0.08)

O roxo deve ser utilizado principalmente para:

* ações primárias;

* seleção;

* estado ativo;

* progresso;

* elementos importantes.

O verde deve ser usado com moderação para:

* notas positivas;

* status positivos;

* indicadores especiais;

* lançamentos/achievements quando apropriado.

---

# 16. HIERARQUIA DE SUPERFÍCIES

Level 0 — Background

#0B0E14

Base da aplicação.

Level 1 — Surface Low

#12161F

Usado em:

* search bars;

* elementos recuados;

* trilhos;

* containers secundários.

Level 2 — Surface

#161B22

Usado para:

* cards;

* listas;

* modais;

* containers principais.

Level 3 — Surface High

#1F2633

Usado para:

* overlays;

* menus;

* elementos elevados;

* estados interativos.

Glass:

background aproximado:

rgba(22,27,34,0.72)

blur aproximado:

16–20px.

Border:

1px rgba(255,255,255,0.08).

Glassmorphism deve ser utilizado apenas onde cria hierarquia.

Não transformar todos os componentes em vidro.

---

# 17. TIPOGRAFIA

Usaremos duas famílias:

Sora

e

Manrope.

## Sora

Usar em:

* headlines;

* títulos;

* labels;

* botões;

* badges;

* números;

* ratings;

* estatísticas.

## Manrope

Usar em:

* body text;

* descrições;

* comentários;

* posts;

* reviews;

* textos longos.

Escala:

Display Large

Sora

40px

700

line-height 48px

letter spacing -0.03em

Headline XL

Sora

32px

700

40px

-0.02em

Headline Large

Sora

26px

600

34px

-0.015em

Headline Medium

Sora

20px

600

28px

-0.01em

Headline Small

Sora

17px

600

24px

Body XL

Manrope

17px

400

26px

-0.01em

Body Large

Manrope

15px

400

22px

Body Medium

Manrope

14px

400

20px

Body Small

Manrope

12px

400

16px

Label Large

Sora

14px

600

18px

letter spacing 0.02em

Label Medium

Sora

12px

600

16px

letter spacing 0.04em

Label Small

Sora

10px

700

14px

letter spacing 0.06em

Labels pequenos podem usar uppercase + tracking positivo.

Ratings, porcentagens, preços e informações numéricas devem preferencialmente utilizar Sora.

---

# 18. SPACING

O Design System utiliza ritmo de 4px/8px.

Tokens:

2px

4px

8px

12px

16px

20px

24px

32px

40px

48px

Principais regras mobile:

Outer screen margin:

20px.

Gutter entre elementos/cards:

16px.

Componentes relacionados geralmente usam:

8–12px.

Separações maiores de seções:

24–32px.

Não criar paddings arbitrários se um token existente resolver.

---

# 19. BORDER RADIUS

4px — small.

8px — base.

12px — medium.

16px — large.

24px — XL / signature curve.

Full / circular — 9999px.

Uso recomendado:

8px:

chips, badges e inputs pequenos.

12px:

thumbnails menores.

16px:

cards, dialogs e inputs maiores.

24px:

hero cards, trailers e bottom sheets.

Circular:

avatars e icon buttons.

---

# 20. ELEVAÇÃO

Evitar depender de sombras genéricas.

A profundidade deve vir principalmente de:

* diferença tonal entre surfaces;

* bordas sutis;

* glass;

* iluminação localizada.

Card normal:

background #161B22

top border:

rgba(255,255,255,0.08)

Elementos elevados:

#1F2633

podem receber uma sombra escura discreta.

Elementos ativos importantes podem utilizar glow roxo discreto:

rgba(139,92,246,~0.35).

Nunca aplicar glow roxo em tudo.

---

# 21. BOTÕES

## Primary

Altura:

48px.

Radius:

16px.

Background:

#8B5CF6 com possível transição sutil para #7C3AED.

Texto:

branco.

Fonte:

Sora semibold.

Pressed:

leve redução visual (~98%) + destaque roxo ligeiramente mais forte.

## Secondary Glass

Background:

rgba(255,255,255,0.06)

Border:

1px rgba(255,255,255,0.12)

Text:

#F9FAFB.

Pressed:

background ligeiramente mais claro.

## Icon Button

Área mínima interativa:

44×44px.

Ícone visual:

aproximadamente 20px.

---

# 22. CHIPS

Altura aproximada:

36px.

Radius:

8px.

Inactive:

background #161B22

text #94A3B8.

Selected:

background com ~15% de #8B5CF6

border #8B5CF6

text #F9FAFB.

---

# 23. CARDS DE JOGOS

Hero Game Card:

* arte full bleed;

* aspect ratio aproximado 16:9 ou 4:5 dependendo do contexto;

* radius 24px;

* gradient/scrim inferior;

* título e informações sobrepostos.

O gradient inferior deve permitir leitura do texto sem esconder a arte.

Compact Game Card:

* thumbnail aproximadamente 80px;

* radius 12px;

* título;

* developer ou metadata;

* ação rápida opcional.

Nunca sobrecarregar cards com informação.

---

# 24. SEARCH BAR

Altura:

44px.

Background:

#12161F.

Border:

1px rgba(255,255,255,0.06).

Radius:

16px.

Ícone:

#64748B.

Placeholder:

#64748B.

Focused:

border #8B5CF6.

A mudança de foco não deve alterar tamanho/layout do componente.

---

# 25. BOTTOM NAVIGATION

A navegação inferior é uma característica importante do produto.

Possui cinco opções:

Início

Explorar

Fórum

Biblioteca

Perfil

Altura base aproximada:

64px + safe area.

Visual:

glass/frosted obsidian.

Ícones:

aproximadamente 22px.

IMPORTANTE:

Atualização solicitada pelo usuário: os itens permanecem sempre em posições fixas,

na ordem Início, Explorar, Fórum, Biblioteca e Perfil.

A seleção NÃO reorganiza o rodapé. Manter a animação de seleção e o destaque roxo

do item ativo.

Todos continuam mostrando ícone + label.

Ativo:

Electric Violet.

Inativos:

Text Muted/Text Secondary.

Esse comportamento deve ser tratado posteriormente como componente reutilizável, e não implementado separadamente em cada página.

---

# 26. LAYOUT MOBILE

Utilizar SafeArea corretamente.

Layout baseado em 4 colunas fluidas conceitualmente.

Margem externa:

20px.

Gutter:

16px.

Carrosséis horizontais podem chegar até a borda da viewport mantendo aproximadamente 20px de padding no primeiro/último elemento.

Ações importantes devem ficar confortáveis para uso com o polegar.

Priorizar áreas interativas com pelo menos 44px.

Não fixar dimensões baseadas exclusivamente no dispositivo de referência.

---

# 27. COMPONENTIZAÇÃO FUTURA

Quando começarmos a implementação das telas, NÃO devemos duplicar estilos.

Devemos criar uma camada de Design System Flutter reutilizável.

Conceitualmente teremos componentes como:

AppColors

AppSpacing

AppRadius

AppTypography

AppTheme

e widgets reutilizáveis como:

PrimaryButton

SecondaryButton

AppIconButton

GameCard

GameCoverCard

GenreChip

PlatformChip

RatingBadge

AppSearchBar

UserAvatar

CommentTile

ForumTopicCard

AppBottomSheet

AppBottomNavigation

Os nomes finais poderão ser decididos quando começarmos a programar.

---

# 28. PRINCÍPIOS DE IMPLEMENTAÇÃO

Quando começarmos a programar posteriormente:

* evitar valores mágicos;

* usar tokens;

* evitar cores hardcoded;

* evitar widgets gigantes;

* criar componentes reutilizáveis;

* manter UI separada de regras de negócio;

* evitar lógica de API diretamente em widgets;

* manter modelos tipados;

* projetar estados loading/error/empty;

* respeitar SafeArea;

* manter acessibilidade;

* manter áreas de toque adequadas;

* preservar responsividade.

---

# 29. ARQUITETURA FRONTEND

A arquitetura Flutter já está em uso e deve ser preservada, salvo refactor solicitado explicitamente.

Fluxo principal:

UI/widget

→ controller/state/application layer

→ repository

→ API client/data source.

Regras:

* widgets não devem conhecer diretamente Prisma, PostgreSQL ou Firebase Admin;

* Firebase Authentication fica no cliente somente para autenticação do usuário;

* o cliente obtém Firebase ID Token e o envia para a API via Authorization: Bearer <token>;

* dados persistentes de produto vêm da API Node/Fastify;

* fakes/mocks são permitidos apenas em testes ou áreas explicitamente ainda demonstrativas;

* não mover lógica de API/regras de domínio para widgets por conveniência.

---

# 30. ARQUITETURA BACKEND

Fluxo conceitual:

Flutter

↓

Firebase Authentication

↓

Firebase ID Token

↓

Node.js + TypeScript API

↓

Firebase Admin verifica token

↓

Service/Application Layer

↓

Prisma

↓

PostgreSQL

Manter autenticação separada da lógica de domínio.

Nunca confiar simplesmente em um UID enviado manualmente pelo aplicativo.

A identidade deve vir do token Firebase validado no backend.

---

# 31. OBJETIVO ATUAL

Não crie novas telas ou funcionalidades sem solicitação específica. As implementações já autorizadas e documentadas na seção 32 fazem parte do estado atual do projeto.

Use estas informações apenas como contexto permanente para nossa conversa.

Quando começarmos a desenvolver, vou enviar uma tela ou funcionalidade de cada vez.

Quero que toda implementação futura respeite:

1. este contexto;

2. as screenshots do projeto;

3. o Style Guide Obsidian Kinetic;

4. a arquitetura definida;

5. consistência entre todas as telas.

Caso uma decisão futura contradiga as screenshots ou o Style Guide, me avise antes de alterar o design por conta própria.

---

# 32. IMPLEMENTAÇÃO ATUAL DO PROTÓTIPO

As telas abaixo já foram implementadas em Flutter e representam a base visual e funcional que o backend deverá suportar:

* `lib/main.dart` — inicialização do app, `MaterialApp`, shell e navegação principal.

* `lib/design_system/theme.dart` — tokens de cores, espaçamento, raios, tipografia e tema Obsidian Kinetic.

* `lib/design_system/components.dart` — cards de superfície, chips, artwork, cabeçalhos, bottom navigation e bottom sheets.

* `lib/features/feed/feed_screen.dart` — For You/feed vertical, ações laterais, comentários e abertura de detalhes.

* `lib/features/feed/feed_controller.dart` — estado do feed e coordenação das ações; preserve a integração atual com repositórios/API e os estados locais que ainda forem específicos da sessão.

* `lib/features/explore/explore_screen.dart` — Explorar, busca, filtros, categorias e descoberta por escolhas.

* `lib/features/explore/explore_controller.dart` — estado de busca, categoria, plataforma, escolhas e salvos.

* `lib/features/explore/explore_data.dart` — modelo `DiscoveryGame`, catálogo demonstrativo e dados editoriais.

* `lib/features/explore/explore_widgets.dart` — cards e widgets específicos de Explorar.

* `lib/features/game_detail/game_detail_screen.dart` — tela completa de detalhes, ações, informações, gameplay, lojas, jogos parecidos e comunidade.

* `lib/features/library/library_screen.dart` — Minha Biblioteca, filtros Quero jogar/Já joguei/Favoritos/Avaliações, busca, grade/lista e avaliação.

* `lib/features/library/library_store.dart` — estado compartilhado de salvos, jogados, favoritos e notas.

* `lib/features/forum/forum_screen.dart` — Fórum, busca, categorias, tópicos em alta/recentes e criação de tópico.

* `lib/features/forum/forum_topic_screen.dart` — discussão completa, curtidas, seguir, respostas e respostas aninhadas.

* `lib/features/forum/forum_controller.dart` — tópicos, respostas, curtidas, seguimento e validação de publicação.

* `lib/features/profile/profile_screen.dart` — Perfil, estatísticas, favoritos, gosto, atividade, avaliações e tópicos.

* `lib/features/profile/profile_widgets.dart` — componentes visuais do Perfil.

* `lib/features/profile/profile_controller.dart` — carregamento, estados, edição e curtidas de avaliações.

* `lib/features/profile/profile_models.dart` — modelos demonstrativos de usuário, atividade, avaliação e tópico.

* `lib/features/profile/profile_repository.dart` — repositório mock que será substituído pela API.

* `lib/features/auth/auth_controller.dart` — abstração de estado visitante/autenticado usada pela UI; produção usa repositório Firebase, e fakes ficam restritos a testes/injeção explícita.

* `lib/features/auth/auth_screen.dart` — login/criação de conta com e-mail, Google, Apple, visitante e animação da marca.

As telas de comentários do For You são um Bottom Sheet sobre o feed. A tela de detalhes é compartilhada por Feed, Explorar e Biblioteca. Autenticação, catálogo/feed e Biblioteca já possuem integração real com backend em partes relevantes; Fórum, comentários e Perfil ainda podem conter dados demonstrativos/em memória. Não substituir integração real por mocks ou fallbacks silenciosos.

---

# 33. NAVEGAÇÃO E RODAPÉ

As cinco posições do rodapé são fixas e permanecem nesta ordem:

Início | Explorar | Fórum | Biblioteca | Perfil

O item selecionado recebe animação, fundo e texto Electric Violet. A ordem nunca deve ser reorganizada para centralizar o item ativo. Fórum e Biblioteca são áreas reais do app e devem permanecer acessíveis pelo shell principal.

---

# 34. MODO VISITANTE E AUTENTICAÇÃO

O primeiro acesso não exige cadastro. Um visitante pode navegar no For You, Explorar, busca, detalhes e conteúdo público do Fórum.

Uma ação que cria ou altera dados exige autenticação. Isso inclui:

* curtir jogo, comentário, tópico ou resposta;

* Quero jogar, Já joguei, Favoritar e Avaliar;

* comentar no For You;

* criar tópico, responder ou seguir uma discussão;

* editar Perfil e seguir outro usuário.

Ao bloquear uma ação, abrir a tela ou modal de autenticação preservando a intenção original. Depois de concluir o login, executar a ação pendente automaticamente. O usuário pode fechar e continuar como visitante.

O fluxo visual de autenticação usa a marca NextPlay sem atrasar o acesso ao Feed. Email/senha e Google já estão integrados. Apple permanece como opção planejada e não deve ser tratada como implementada sem validação/configuração específica.

Autenticação:

Flutter usa Firebase Authentication. O cliente envia `Authorization: Bearer <firebaseIdToken>` para a API. O backend usa Firebase Admin SDK exclusivamente para validar o token e obter o `firebaseUid`. Nunca aceitar um UID enviado livremente pelo cliente. O header legado `x-user-id` não faz parte do fluxo normal de produção.

Para preservar a intenção do visitante, é permitido usar uma sessão anônima ou um `guestSessionId` local. Quando ele cria ou vincula uma conta, ações compatíveis podem ser transferidas para o usuário autenticado. A API deve aplicar uma política explícita de migração e evitar duplicatas.

---

# 35. CONTRATO DE DADOS PARA O BACKEND

O PostgreSQL é a fonte dos dados do produto. Firebase guarda a identidade; não armazenar senhas no PostgreSQL.

## Entidades principais

### `users`

`id` UUID primary key, `firebaseUid` unique not null, `email` nullable/unique, `name`, `username` unique, `avatarUrl`, `bio`, `createdAt`, `updatedAt`, `deletedAt` nullable.

Um usuário pode ter várias identidades Firebase apenas se a política de vinculação permitir. E-mail, username e firebaseUid devem possuir índices únicos apropriados.

### `guest_sessions`

`id` UUID primary key, `userId` nullable foreign key, `deviceIdHash` nullable, `createdAt`, `lastSeenAt`, `convertedAt` nullable, `expiresAt` nullable.

Serve para leituras e eventos antes do login. Não armazenar dados pessoais desnecessários. Quando uma sessão vira conta, associar os registros migráveis ao `userId` e marcar `convertedAt`.

### `games`

O Game interno possui UUID próprio. IGDB é a fonte principal do catálogo e Steam é enriquecimento opcional. O modelo persistido deve manter igdbId quando disponível e steamAppId nullable somente quando houver matching confiável, além de campos como title, slug, description, studio, publisher, coverUrl, heroUrl, rating, releaseDate, modo/jogadores e timestamps conforme o schema atual.

Nunca usar igdbId como fallback para steamAppId, nunca montar URL Steam a partir de IGDB ID e nunca unir registros apenas porque possuem nomes parecidos.

### `genres`, `gameGenres`, `platforms`, `gamePlatforms`

Catálogos normalizados para filtros e recomendações. `genres(id, name, slug)`, `platforms(id, name, slug)`, tabelas de relação com chave composta (`gameId`, `genreId`) e (`gameId`, `platformId`).

### `gameMedia`

`id`, `gameId`, `type` (TRAILER, GAMEPLAY, SCREENSHOT), `url`, `thumbnailUrl`, `durationSeconds`, `sortOrder`, `createdAt`.

### `userGameLibrary`

Uma linha por usuário e jogo: `userId`, `gameId`, `status` nullable (WANT_TO_PLAY ou PLAYED), `liked`, `isFavorite`, `rating` de 1 a 5 nullable, `reviewText` nullable, `reviewUpdatedAt`, `createdAt`, `updatedAt`. Chave composta (`userId`, `gameId`). Avaliar registra o jogo como PLAYED. Jogos apenas curtidos/favoritados têm status nulo; registros sem interação ativa são removidos.

Curtidas de jogos agora pertencem a `userGameLibrary`; a antiga tabela `GameLike` foi copiada e removida pela migration de consolidação. Se no futuro curtidas de visitante forem permitidas, usar `guestSessionId` em uma estrutura separada, nunca uma identidade inventada.

### `comments`

`id`, `userId`, `gameId`, `parentId` nullable para respostas, `body`, `createdAt`, `updatedAt`, `deletedAt` nullable. Índices por (`gameId`, `createdAt`) e `parentId`. Comentários são carregados no Bottom Sheet e não criam uma tela independente.

### `commentLikes`

`userId`, `commentId`, `createdAt`, chave única (`userId`, `commentId`).

### `forumCategories`

`id`, `name`, `slug`, `sortOrder`, `isActive`. Categorias iniciais: Geral, Recomendações, Perguntas e Análises.

### `forumTopics`

`id`, `userId`, `categoryId`, `gameId` nullable, `title`, `body`, `createdAt`, `updatedAt`, `lastActivityAt`, `isPinned`, `deletedAt` nullable. Índices por `categoryId`, `lastActivityAt` e `createdAt`.

### `forumTopicTags`, `forumTags`

Tags normalizadas para tópicos. Chaves únicas por slug e por (`topicId`, `tagId`).

### `forumReplies`

`id`, `topicId`, `userId`, `parentId` nullable, `body`, `createdAt`, `updatedAt`, `deletedAt` nullable. `parentId` permite respostas aninhadas com profundidade limitada pela aplicação.

### `forumTopicLikes`, `forumReplyLikes`, `forumTopicFollows`

Tabelas de relação com chaves únicas por usuário e alvo. Seguir uma discussão deve alimentar notificações futuramente, sem misturar isso com curtidas.

### `userFollows`

`followerId`, `followingId`, `createdAt`, chave única composta e restrição para impedir seguir a si próprio.

### `recommendationEvents`

`id`, `userId` nullable, `guestSessionId` nullable, `gameId` nullable, `eventType`, `position` nullable, `watchDurationMs` nullable, `metadata` JSONB nullable, `createdAt`. Eventos: IMPRESSION, VIEW, LIKE, SAVE, PLAYED, DISLIKE, SEARCH, SWIPE_YES, SWIPE_NO, DETAIL_OPEN, COMMENT.

### `searchQueries`

`id`, `userId` nullable, `guestSessionId` nullable, `query`, `parsedFilters` JSONB nullable, `resultCount`, `createdAt`. Não armazenar texto sensível sem necessidade; aplicar retenção e anonimização.

### `notifications` (fase posterior)

`id`, `userId`, `type`, `actorUserId` nullable, `topicId` nullable, `commentId` nullable, `readAt` nullable, `createdAt`. Necessária quando seguir discussões, respostas e interações forem persistentes.

---

# 36. REGRAS DE DOMÍNIO

* Salvar no Feed ou Explorar cria/atualiza `userGameLibrary` com status WANT_TO_PLAY.

* Já joguei atualiza o mesmo registro para PLAYED.

* Favorito e avaliação são propriedades do registro do usuário com o jogo.

* Remover uma ação não deve apagar o jogo do catálogo.

* Curtidas são relações idempotentes: repetir a mesma ação não cria duplicata.

* Comentários do For You pertencem ao jogo, não ao tópico do Fórum.

* Tópicos do Fórum são persistentes e podem ter jogo relacionado, tags e respostas.

* O catálogo é público; mutações exigem usuário autenticado. AuthController continua como abstração da UI, mas a integração de produção usa Firebase Authentication e Firebase ID Token real. Fakes só podem ser usados por injeção explícita em testes.

* Todas as rotas protegidas devem derivar o usuário do Firebase ID Token validado no backend.

* Listagens devem ter paginação, ordenação determinística e estados loading, empty e error.

* Exclusão de conteúdo deve preferir soft delete e preservar auditoria básica.

---

# 37. CAMADAS RECOMENDADAS

Flutter: tela/widget → controller ou state layer → repository → API client.

Backend: route/controller → autenticação Firebase Admin → service/application → repository Prisma → PostgreSQL.

Widgets não conhecem Prisma, PostgreSQL, Firebase Admin ou regras de consulta. O cliente Firebase conhece apenas autenticação. O backend concentra autorização, validação, normalização e regras de domínio.

---

# 38. VALIDAÇÃO ATUAL

Os testes em test/ cobrem Feed, navegação, trailer/player, comentários e ações, Explorar e descoberta, Perfil, Biblioteca, Fórum, discussões, detalhes do jogo, estado compartilhado e responsividade. A contagem de testes muda ao longo do desenvolvimento; não hardcode um número como requisito.

Para validar Flutter, sempre usar o wrapper da raiz:

powershell.exe -ExecutionPolicy Bypass -File "./flutter.ps1" analyze

powershell.exe -ExecutionPolicy Bypass -File "./flutter.ps1" test

Nunca usar flutter cru neste repositório, porque o wrapper existe para lidar corretamente com o caminho local do projeto.

---

# 39. CATÁLOGO IGDB + STEAM

IGDB é a fonte principal do catálogo. Steam é enriquecimento complementar para disponibilidade, loja, preço, screenshots e outros metadados de PC quando existir matching confiável. As duas APIs são acessadas somente pelo backend; Flutter consome apenas a API do NextPlay.

Pipeline:

IGDB → normalização → matching/upsert → Steam enrichment → PostgreSQL → API → Flutter.

Os clientes, tipos e mappers ficam em backend/src/modules/integrations/. O matching deve ser conservador. Não duplicar o mesmo jogo por fonte, mas também não unir remakes, bundles, demos, playtests, DLCs ou edições distintas sem confiança.

Trailers da IGDB usam game_videos.video_id e são normalizados como YouTube. YouTube vindo da IGDB é a preferência para primaryTrailer; Steam é fallback/complementar. Não requer YouTube API key.

Quando IGDB fornece múltiplos Steam IDs, preserve candidatos válidos e resolva no enriquecimento Steam. Rejeite candidatos cujo nome indique playtest, beta, demo, dlc, soundtrack ou tool. Se continuar ambíguo, mantenha o jogo IGDB sem steamAppId em vez de escolher arbitrariamente.

O script backend/src/scripts/sync-games.ts suporta execução controlada por ID e modos de seleção. Exemplos seguros:

pnpm.cmd run sync:games -- --id 113112

pnpm.cmd run sync:games -- --mode popular --limit 20

pnpm.cmd run sync:games -- --mode recent --limit 20

pnpm.cmd run sync:games -- --mode discover --limit 20 --dry-run

Para lotes, preferir --dry-run antes da persistência. Não executar sync massivo/default por conveniência. O campo IGDB popularity já causou query inválida e não deve ser reintroduzido sem validação da API.

Credenciais devem existir apenas em .env local, com nomes documentados em backend/.env.example. Não versionar tokens, não chamar IGDB/Steam a partir do Flutter e não expor endpoint de sincronização sem autenticação administrativa, limite e logs seguros.

A sincronização externa automática de produção continua pendente; isso não significa que a integração manual/CLI esteja pendente.

---

# 40. SEPARAÇÃO FRONTEND/BACKEND

O frontend Flutter fica nas pastas `lib/`, `android/`, `web/`, `assets/` e `test/`; sua documentação de organização está em `frontend/README.md`. O Flutter permanece com `pubspec.yaml` na raiz para não quebrar o fluxo de desenvolvimento e o wrapper `flutter.ps1`.

O backend fica exclusivamente em `backend/`, com código TypeScript em `backend/src/`, schema e migrations em `backend/prisma/`, dependências em `backend/package.json` e configuração segura em `backend/.env.example`. Não misturar imports, credenciais, regras ou dependências entre as duas áreas.

## Manutenção do protótipo / estado atual

- lib/features/feed/feed_comments_sheet.dart concentra o painel de comentários e descarta seus recursos ao fechar. Comentários ainda podem usar estado demonstrativo/local enquanto essa área não for migrada explicitamente.

- Abrir conteúdo público pode ser permitido a visitante; ações persistentes/mutações exigem autenticação.

- O contrato backend/src/modules/games/game.repository.ts exige o ID persistido nos candidatos; nunca usar título ou slug como ID do banco.

- O backend possui lockfile pnpm e comandos typecheck, test, format e format:check. Dependências e dist/ não são versionados.

- API/Prisma de catálogo e Biblioteca estão implementados. Firebase Authentication também está integrado no frontend/backend para o fluxo normal protegido. Não usar x-user-id como autenticação normal; se código legado de teste/desenvolvimento ainda existir, ele não deve escapar para produção.

- Feed consome a API real e não deve substituir silenciosamente falhas da API por catálogo demo. Biblioteca usa LibraryStore/ApiLibraryRepository e restaura estado persistido. Avaliar implica PLAYED conforme a regra atual. Explorar pode conter conteúdo editorial/demonstrativo onde isso estiver explícito; Fórum, comentários e Perfil ainda podem manter partes demonstrativas/em memória até tarefas específicas de migração.

- Logout pode limpar estado privado em memória, mas não deve apagar dados persistidos do usuário no banco.

## Primeira migration aplicada

`backend/prisma/migrations/20260912000100_initial_schema/migration.sql` foi

aplicada ao PostgreSQL local nextplay. O banco contém a estrutura inicial e

relações explícitas das curtidas, seguidores e pesquisas. IDs relacionados

usam UUID compatível. Notas são de 1 a 5 e exigem PLAYED; seguir a si mesmo

é proibido por CHECK, assim como valores inválidos de ofertas e jogadores.

Esses CHECKs são mantidos no SQL. A migration `20260913000100_unify_user_game_interaction` também foi aplicada ao banco local: preservou status/notas/favoritos, copiou as curtidas para `UserGameLibrary.liked` e tornou `status` opcional. Não editar migrations já aplicadas.

pnpm.cmd run test:db e os testes de API, executados em backend/, verificam o PostgreSQL local com transações revertidas. A API e o GameRepository Prisma estão implementados. Nunca editar migration já aplicada e nunca reintroduzir identidade manual como substituto do Firebase ID Token.

---

# 41. REGRAS OPERACIONAIS E SEGURANÇA DO REPOSITÓRIO

Antes de alterar código:

* ler este AGENTS.md;

* executar git status --short;

* inspecionar git diff das alterações existentes;

* preservar trabalho não commitado de outro agente ou do usuário.

Sem autorização explícita, NÃO executar:

* git reset --hard;

* git clean;

* git restore .;

* git checkout .;

* git stash;

* commit;

* push.

Banco de dados:

* nunca executar prisma migrate reset;

* nunca executar prisma db push sem justificativa e aprovação explícita;

* não editar migration já aplicada;

* não criar migration sem aprovação quando a tarefa não exige schema;

* não apagar catálogo ou dados pessoais de usuário para “facilitar” um teste;

* seeds e syncs devem ser idempotentes e conservadores.

Segredos:

* backend/.env não deve ser versionado;

* nunca imprimir, pedir ou colar em chat FIREBASE_PRIVATE_KEY, IGDB_CLIENT_SECRET, STEAM_API_KEY, tokens ou credenciais;

* se uma chave aparecer acidentalmente em screenshot/log, tratar como potencialmente comprometida e recomendar rotação antes de produção.

Flutter:

* executar a partir da raiz com powershell.exe -ExecutionPolicy Bypass -File "./flutter.ps1" ...;

* não usar flutter cru;

* testar com analyze + test e, quando aplicável, git diff --check.

Backend:

* executar comandos pnpm dentro de backend/;

* não reinstalar dependências ou apagar node_modules sem necessidade;

* se o pnpm tentar verificação/reinstalação indevida, pode-se usar --config.verify-deps-before-run=false;

* neste repositório dentro do OneDrive, reinstalações já exigiram --package-import-method=copy; só repetir se realmente necessário.

---

# 42. FEED, TRAILERS E MÍDIA

O For You é um feed vertical 9:16.

Quando o trailer original é 16:9:

* manter a proporção 16:9;

* centralizar dentro do feed vertical;

* usar comportamento de contain/letterbox, com áreas pretas quando necessário;

* nunca esticar o vídeo;

* não cortar o vídeo apenas para preencher o 9:16.

Deve existir ação de tela cheia. No mobile, fullscreen deve permitir experiência horizontal/landscape para o trailer 16:9 e, ao sair, retornar ao For You vertical preservando o contexto do jogo.

Integração atual de trailer:

* TrailerInfo é tipado com provider, url e videoId;

* YouTube/IGDB é a fonte primária de trailer quando válido;

* youtube_player_iframe é usado para o player;

* manter um único player/controller reutilizável no Feed, não um player por card;

* ao trocar de card, pausar o anterior e carregar o videoId ativo;

* pausar ao sair da aba/rota/background quando aplicável;

* estado visual Play/Pause deve acompanhar eventos reais do player, não apenas bool local otimista;

* fallback visual: heroUrl → coverUrl → placeholder;

* URL Steam só pode ser construída com steamAppId explícito e válido;

* nunca usar igdbId como steamAppId.

No Flutter Web, alguns assets steamstatic.com podem falhar por CORS. Não mascarar esse problema inventando IDs ou trocando a arquitetura do backend sem solicitação; tratar apenas URLs Steam realmente válidas e de forma isolada.

---

# 43. AUTENTICAÇÃO E BIBLIOTECA — ESTADO ATUAL

Fluxo de produção:

Flutter/Firebase Authentication → Firebase ID Token → Authorization: Bearer <token> → Fastify → Firebase Admin → usuário interno/PostgreSQL.

Email/senha e Google já foram testados no fluxo real. Sessão restaura após reload quando esperado. Logout limpa estado privado em memória sem apagar a persistência do banco.

Biblioteca:

* ações protegidas usam o token Firebase real;

* ApiLibraryRepository é a integração persistente;

* Curtir, Quero jogar, Já joguei, Favoritar e Avaliar não devem depender de x-user-id;

* avaliar implica PLAYED conforme regra atual;

* não apagar dados de biblioteca para corrigir problema de catálogo/feed.

---

# 44. PRIORIDADE ENTRE ESPECIFICAÇÃO E ESTADO ATUAL

Este arquivo mistura visão de produto de longo prazo com partes já implementadas.

Ao trabalhar:

requisito explícito mais recente do usuário para a tarefa atual;

estado real do código e testes;

regras de segurança/arquitetura deste AGENTS.md;

especificações futuras deste documento.

Se uma seção antiga disser que algo “será implementado”, mas o código atual já contém implementação real validada, não reverta para mock nem refaça do zero. Atualize a documentação quando necessário.

Quando houver dúvida sobre estado atual, inspecione o código antes de assumir.
