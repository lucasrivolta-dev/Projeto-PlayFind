# AGENTS.md — Instruções do projeto NextPlay / PlaySweep

> Escopo: estas instruções se aplicam a todo o repositório. Use este documento como referência de produto, arquitetura e Design System em trabalhos futuros.

>

> O projeto está em implementação ativa. Não crie novas telas, migrations, refactors amplos ou mudanças de arquitetura sem solicitação explícita. Alterações devem preservar o working tree e respeitar o estado real do repositório.

>

> Antes de implementar, consulte este documento, o código atual, git status --short, git diff e as screenshots fornecidas para a tarefa. Não aplique uma solução baseada em arquitetura antiga lembrada de outra sessão. Se uma decisão entrar em conflito com screenshots, Design System ou código já estabilizado, avise antes de alterar o design ou a arquitetura por conta própria.

Este documento é a especificação operacional do NextPlay. Ele deve ser mantido atualizado conforme decisões de produto e arquitetura forem aprovadas.

Não implemente telas, migrations ou funcionalidades fora do escopo solicitado. As áreas descritas na seção 32 já existem e devem ser tratadas como base ativa do projeto.

---

# 1. O PRODUTO

Estamos desenvolvendo um aplicativo mobile de descoberta de videogames.

O nome atual do projeto pode aparecer como NextPlay, PlayFind ou PlaySweep. Trata-se do mesmo projeto.

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

DESCOBRIR → SE INTERESSAR → QUERO JOGAR → JOGAR

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

Ações principais do Feed:

* Curtir;

* Quero jogar;

* Já joguei;

* Comentar;

* Compartilhar.

Não existe ação separada de Favoritar/Favorito, nem rótulo "Salvo" no Feed. "Quero jogar" é o nome de produto da intenção WANT_TO_PLAY. Usuários não seguem criadores de trailer porque usuários não publicam vídeos. Seguir usuários ou tópicos do Fórum é uma funcionalidade separada e não deve ser confundida com o Feed.

---

# 3. RECOMENDAÇÕES

O aplicativo deve futuramente aprender o gosto do jogador utilizando sinais como:

* gêneros favoritos;

* plataformas;

* jogos curtidos;

* jogos marcados como Quero jogar;

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

* Curtir;

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

* Curtidos;

* Quero jogar;

* Já joguei;

* Avaliações.

"Curtidos" usa a relação/estado de like (liked == true). Favorito/Favoritar não é uma feature ativa do produto. Se isFavorite ainda existir fisicamente no banco, ele é legado temporário e não deve voltar para a UX sem nova decisão explícita.

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

* jogos curtidos;

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

Durante o desenvolvimento atual, Android físico é a prioridade operacional de validação. O dispositivo real de referência é o Samsung SM-G780G / Galaxy S20 FE, Android 13, device id RQ8T209FPFE.

Regra de validação: testar primeiro no Android físico; Edge/Web vem depois como regressão secundária. Uma tarefa não deve ser considerada concluída apenas porque funciona no Edge se estiver incorreta no Android.

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

A autenticação usa Firebase Authentication no cliente e Firebase Admin SDK no backend.

Métodos suportados/planejados conforme plataforma e configuração atual:

* Email + senha;

* Google;

* Apple.

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

Possui cinco opções em posições visuais fixas, nesta ordem:

Explorar

Fórum

Início

Biblioteca

Perfil

Altura base aproximada:

64px + safe area.

Visual:

glass/frosted obsidian.

Ícones:

aproximadamente 22px.

IMPORTANTE:

A ordem visual obrigatória é:

Explorar | Fórum | Início | Biblioteca | Perfil

Início fica exatamente no centro, com destaque circular/elevado em Electric Violet.

A seleção NÃO reorganiza o rodapé. O item ativo recebe animação, fundo/glow roxo discreto e label correspondente.

A ordem visual não deve depender diretamente de AppDestination.values; usar uma lista explícita quando necessário, preservando o mapeamento lógico/pageIndex correto do shell.

Todos continuam mostrando ícone + label.

Ativo:

Electric Violet.

Inativos:

Text Muted/Text Secondary.

Esse comportamento deve ser tratado como componente reutilizável, não implementado separadamente em cada página.

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

Ainda definiremos a arquitetura Flutter em detalhes antes da implementação.

Como princípio:

UI

→ state/application layer

→ repositories

→ data sources/API.

Widgets não devem conhecer diretamente Prisma, PostgreSQL ou Firebase Admin.

Firebase Authentication ficará no cliente somente para autenticação do usuário.

Dados de produto virão da API Node.

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

O NextPlay está em implementação ativa. Trabalhe somente no escopo solicitado e preserve comportamento já validado.

Toda implementação deve respeitar:

1. este documento atualizado;

2. o código real e o git diff atual;

3. as screenshots/referências fornecidas para a tarefa;

4. o Style Guide Obsidian Kinetic;

5. a arquitetura definida;

6. dados reais do produto — não inventar contadores, estados, features ou metadata para copiar um mock.

Caso uma decisão futura contradiga o código estabilizado, as screenshots ou o Style Guide, avise antes de alterar design/arquitetura por conta própria.

---

# 32. IMPLEMENTAÇÃO ATUAL DO PROTÓTIPO

As telas abaixo já foram implementadas em Flutter e representam a base visual e funcional que o backend deverá suportar:

* `lib/main.dart` — inicialização do app, `MaterialApp`, shell e navegação principal.

* `lib/design_system/theme.dart` — tokens de cores, espaçamento, raios, tipografia e tema Obsidian Kinetic.

* `lib/design_system/components.dart` — cards de superfície, chips, artwork, cabeçalhos, bottom navigation e bottom sheets.

* `lib/features/feed/feed_screen.dart` — For You/feed vertical, ações laterais, comentários e abertura de detalhes.

* `lib/features/feed/feed_controller.dart` — itens do feed, curtidas, estado Quero jogar, jogados e comentários da sessão; nomes internos legados como saved podem existir, mas a UX usa "Quero jogar".

* `lib/features/explore/explore_screen.dart` — Explorar, busca, filtros, categorias e descoberta por escolhas.

* `lib/features/explore/explore_controller.dart` — estado de busca, categoria, plataforma, escolhas e intenção Quero jogar; nomes internos legados podem existir sem mudar o rótulo de produto.

* `lib/features/explore/explore_data.dart` — modelo `DiscoveryGame`, catálogo demonstrativo e dados editoriais.

* `lib/features/explore/explore_widgets.dart` — cards e widgets específicos de Explorar.

* `lib/features/game_detail/game_detail_screen.dart` — tela completa de detalhes, ações, informações, gameplay, lojas, jogos parecidos e comunidade.

* `lib/features/library/library_screen.dart` — Minha Biblioteca, filtros Curtidos/Quero jogar/Já joguei/Avaliações, busca, grade/lista e avaliação.

* `lib/features/library/library_store.dart` — estado compartilhado de curtidos, Quero jogar, jogados e notas; Favorito não é feature ativa.

* `lib/features/forum/forum_screen.dart` — Fórum, busca, categorias, tópicos em alta/recentes e criação de tópico.

* `lib/features/forum/forum_topic_screen.dart` — discussão completa, curtidas, seguir, respostas e respostas aninhadas.

* `lib/features/forum/forum_controller.dart` — tópicos, respostas, curtidas, seguimento e validação de publicação.

* `lib/features/profile/profile_screen.dart` — Perfil, estatísticas, jogos curtidos, gosto, atividade, avaliações e tópicos.

* `lib/features/profile/profile_widgets.dart` — componentes visuais do Perfil.

* `lib/features/profile/profile_controller.dart` — carregamento, estados, edição e curtidas de avaliações.

* `lib/features/profile/profile_models.dart` — modelos demonstrativos de usuário, atividade, avaliação e tópico.

* `lib/features/profile/profile_repository.dart` — repositório mock que será substituído pela API.

* `lib/features/auth/auth_controller.dart` — estado visitante/autenticado e adaptador temporário dos provedores.

* `lib/features/auth/auth_screen.dart` — login/criação de conta com e-mail, Google, Apple, visitante e animação da marca.

As telas de comentários do For You são um Bottom Sheet sobre o feed. A tela de detalhes é compartilhada por Feed, Explorar e Biblioteca.

O projeto já possui API real e persistência para catálogo/biblioteca. Feed e Biblioteca compartilham LibraryStore/ApiLibraryRepository. Algumas áreas sociais ainda podem conter partes demonstrativas/em memória; confirmar sempre o código atual antes de assumir.

---

# 33. NAVEGAÇÃO E RODAPÉ

As cinco posições visuais do rodapé são fixas e permanecem nesta ordem:

Explorar | Fórum | Início | Biblioteca | Perfil

Início é o item central e recebe destaque circular/elevado quando ativo. A seleção não deve reorganizar o rodapé.

Preservar o mapeamento interno do shell/pageIndex. A ordem visual deve ser controlada explicitamente para não quebrar a navegação lógica.

Fórum e Biblioteca são áreas reais do app e devem permanecer acessíveis pelo shell principal.

---

# 34. MODO VISITANTE E AUTENTICAÇÃO

O primeiro acesso não exige cadastro. Um visitante pode navegar no For You, Explorar, busca, detalhes e conteúdo público do Fórum.

Uma ação que cria ou altera dados exige autenticação. Isso inclui:

* curtir jogo, comentário, tópico ou resposta;

* Curtir, Quero jogar, Já joguei e Avaliar;

* comentar no For You;

* criar tópico, responder ou seguir uma discussão;

* editar Perfil e seguir outro usuário.

Ao bloquear uma ação, abrir a tela ou modal de autenticação preservando a intenção original. Depois de concluir o login, executar a ação pendente automaticamente. O usuário pode fechar e continuar como visitante.

O fluxo visual de autenticação terá logo NextPlay com uma animação curta e discreta, campos de e-mail/senha, criar conta, entrar, continuar com Google e continuar com Apple. A animação deve reforçar a marca sem atrasar o acesso ao Feed.

Autenticação:

Flutter usa Firebase Authentication para e-mail/senha, Google e Apple. O cliente envia `Authorization: Bearer <firebaseIdToken>` para a API. O backend usa Firebase Admin SDK exclusivamente para validar o token e obter o `firebaseUid`. Nunca aceitar um UID enviado livremente pelo cliente.

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

`id` UUID primary key, `source` (ex.: STEAM), `sourceId` unique, `title`, `slug` unique, `description`, `studio`, `publisher`, `coverUrl`, `heroUrl`, `rating`, `ratingCount`, `totalRating`, `totalRatingCount`, `releaseDate` nullable, `mode` nullable, `playerCountMin` nullable, `playerCountMax` nullable, `isFree`, `createdAt`, `updatedAt`.

Os quatro sinais de avaliação do IGDB preservam semânticas separadas: `rating`/`ratingCount` representam avaliações de usuários, enquanto `totalRating`/`totalRatingCount` representam a média combinada do IGDB. As notas usam a escala interna 0–10. O ranking prefere o par total quando completo, usa o par de usuários como fallback e trata nota sem contagem como confiança desconhecida, sem fabricar votos.

### `genres`, `gameGenres`, `platforms`, `gamePlatforms`

Catálogos normalizados para filtros e recomendações. `genres(id, name, slug)`, `platforms(id, name, slug)`, tabelas de relação com chave composta (`gameId`, `genreId`) e (`gameId`, `platformId`).

### `gameMedia`

Estado implementado/documentado do schema atual: `id`, `gameId`, `type` (TRAILER, GAMEPLAY, SCREENSHOT), `url`, `thumbnailUrl`, `durationSeconds`, `sortOrder`, `createdAt`.

Direção arquitetural aprovada para trailers: o domínio precisa distinguir fonte `direct` autorizada de `youtube` fallback e, quando o schema for evoluído, poderá precisar de metadata como `sourceType`, `provider`, `sourcePage/origin`, `directUrl` ou `youtubeVideoId`, `mimeType`, `poster`, `trailerKind` e `language`. Não afirmar que esses campos já existem no Prisma e não aplicar migration sem aprovação explícita.

### `userGameLibrary`

Uma linha por usuário e jogo: `userId`, `gameId`, `status` (WANT_TO_PLAY ou PLAYED), `isFavorite` legado, `rating` de 1 a 5 nullable, `reviewText` nullable, `reviewUpdatedAt`, `createdAt`, `updatedAt`. Chave única (`userId`, `gameId`). Avaliar deve registrar o jogo como PLAYED conforme a regra atual. `isFavorite` não deve ser usado por novas UIs/fluxos; sua remoção física depende de migration futura aprovada explicitamente.

### `gameLikes`

`userId`, `gameId`, `createdAt`, chave única (`userId`, `gameId`). Se no futuro curtidas de visitante forem permitidas, usar `guestSessionId` em uma tabela separada ou uma coluna mutuamente exclusiva, nunca uma identidade inventada.

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

`id`, `userId` nullable, `guestSessionId` nullable, `gameId` nullable, `eventType`, `position` nullable, `watchDurationMs` nullable, `metadata` JSONB nullable, `createdAt`. Eventos podem representar IMPRESSION, VIEW, LIKE, WANT_TO_PLAY, PLAYED, DISLIKE, SEARCH, SWIPE_YES, SWIPE_NO, DETAIL_OPEN e COMMENT. Se dados/nomes legados como SAVE existirem, tratá-los como compatibilidade histórica; novos fluxos usam a semântica Quero jogar/WANT_TO_PLAY.

### `searchQueries`

`id`, `userId` nullable, `guestSessionId` nullable, `query`, `parsedFilters` JSONB nullable, `resultCount`, `createdAt`. Não armazenar texto sensível sem necessidade; aplicar retenção e anonimização.

### `notifications` (fase posterior)

`id`, `userId`, `type`, `actorUserId` nullable, `topicId` nullable, `commentId` nullable, `readAt` nullable, `createdAt`. Necessária quando seguir discussões, respostas e interações forem persistentes.

---

# 36. REGRAS DE DOMÍNIO

* "Quero jogar" no Feed ou Explorar cria/atualiza `userGameLibrary` com status WANT_TO_PLAY. O rótulo "Salvo" não deve ser usado como ação de produto.

* Já joguei atualiza o mesmo registro para PLAYED.

* Curtir é um estado independente dentro de UserGameLibrary (liked). Favorito não é feature ativa; isFavorite, se ainda existir no schema, é legado até migration futura aprovada. Avaliação continua vinculada ao usuário+jogo.

* Para novas mutações de Curtir, preferir semântica explícita de estado desejado (liked: true/false) via PATCH /library/:gameId/interaction em vez de depender de toggle remoto. A intenção mais recente do usuário deve vencer; nenhum toque deve ser descartado por haver request pendente.

* Remover uma ação não deve apagar o jogo do catálogo.

* Curtidas são relações idempotentes: repetir a mesma ação não cria duplicata.

* Comentários do For You pertencem ao jogo, não ao tópico do Fórum.

* Tópicos do Fórum são persistentes e podem ter jogo relacionado, tags e respostas.

* O catálogo é público; mutações exigem usuário autenticado. Flutter usa Firebase Authentication e envia `Authorization: Bearer <firebaseIdToken>`; o backend valida via Firebase Admin SDK e deriva o usuário do token. Nunca aceitar `x-user-id`, `dev-user` ou UID livremente enviado como identidade normal da API.

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

Os testes em test/ cobrem Feed, comentários e ações, Explorar e descoberta, Perfil, Biblioteca, Fórum, discussões, detalhes do jogo, estado compartilhado e responsividade.

Validação padrão depois de mudanças relevantes:

Backend:

pnpm test

pnpm run typecheck

Flutter:

flutter analyze

flutter test

Também:

git diff --check

git status --short

Problemas de PlatformView, iframe, gestos, autoplay, seek, WebView e interação real não podem ser declarados concluídos apenas por testes automatizados.

Prioridade obrigatória: validar primeiro no Samsung físico RQ8T209FPFE (Android 13). Depois validar Edge/Web como regressão secundária.

---

# 39. CATÁLOGO IGDB + STEAM

O diretório `backend/` contém a base da integração automática de catálogo. IGDB é a fonte principal de metadados; Steam complementa disponibilidade, loja e preço para PC. As duas APIs são acessadas somente pelo backend. O Flutter consome a API do NextPlay e nunca recebe credenciais externas.

Os clientes, tipos e mappers ficam separados em `backend/src/modules/integrations/`. As respostas externas são transformadas em `NormalizedGame` antes de chegar ao domínio. `backend/src/modules/sync/game-matcher.service.ts` associa fontes apenas quando nome normalizado, lançamento, desenvolvedora, publisher e plataformas atingem um limite conservador; IDs externos diferentes não justificam duplicar um `Game` nem unir remakes ou edições sem confiança.

`backend/src/modules/sync/game-sync.service.ts` coordena importação, atualização, enriquecimento Steam, matching e registro de sincronização por meio de um repositório. O script `backend/src/scripts/sync-games.ts` é uma entrada de desenvolvimento e exige variáveis de ambiente. O schema e a primeira migration já estão aplicados; `PrismaGameRepository` persiste o catálogo. A sincronização externa automática de produção continua pendente.

Credenciais devem existir apenas em `.env` local, com nomes documentados em `backend/.env.example`. Não versionar tokens, não chamar IGDB/Steam a partir do Flutter e não expor publicamente um endpoint de sincronização sem autenticação administrativa, limite e logs seguros.

Princípios de catálogo:

* IGDB é a fonte de verdade principal para metadata de jogo. Steam complementa identidade PC, loja, preço, reviews e sinais de exposição/qualidade quando existir versão Steam confiável.

* `Game.id` UUID interno continua sendo a identidade canônica. IDs Steam/IGDB são metadata e nunca substituem o UUID interno.

* Um jogo antigo não é ruim por ser antigo. Clássicos, AA/AAA, jogos cult, hidden gems e indies podem aparecer se houver evidência suficiente de relevância e qualidade.

* Fama NÃO é motivo de inelegibilidade. Jogos mainstream continuam válidos e podem aparecer no catálogo e no Feed.

* Porém, exposição/popularidade é um sinal de ranking. Depois que os candidatos passam pelos gates mínimos de qualidade, o planejamento de aquisição deve priorizar valor de descoberta, dando mais espaço a hidden gems, indies e jogos mid-tail de qualidade sem excluir completamente títulos famosos.

* O objetivo do discovery é favorecer a experiência:
  "jogo que eu não conhecia, mas parece muito bom"
  e evitar:
  "jogo que quase ninguém conhece porque quase ninguém jogou e não há evidência suficiente de qualidade".

* Não usar obscuridade como substituto de qualidade. Um jogo com pouquíssima exposição não deve superar automaticamente outro muito melhor avaliado apenas por ser menos conhecido.

* Para jogos Steam, o hard gate atual de aquisição automática é:
  - Steam review count >= 100;
  - Steam positive percentage >= 80%.

* Os dois requisitos são obrigatórios. Não existe compensação:
  - 99 reviews / 100% positivas -> não passa;
  - 100 reviews / 79% positivas -> não passa;
  - 100 reviews / 80% positivas -> passa este gate.

* A quantidade de reviews Steam representa principalmente evidência de exposição/adoção, não uma nota de qualidade isolada.

* O percentual positivo Steam representa satisfação dos jogadores e participa do gate/ranking, mas não substitui os demais sinais de qualidade do catálogo.

* Ausência de evidência Steam nunca deve ser convertida em zero reviews.
  - zero é válido apenas quando `total_reviews = 0` veio de uma resposta Steam válida;
  - campo ausente, erro, timeout, snapshot incompleto ou provider indisponível devem resultar em `STEAM_EVIDENCE_UNAVAILABLE`.

* Jogos que legitimamente não possuem versão Steam recebem tratamento NON_STEAM e não devem ser rejeitados apenas pela ausência da Steam. Eles continuam sujeitos aos gates existentes de IGDB, plataforma, metadata, trailer, elegibilidade e dedupe.

* Quando o IGDB retornar múltiplos Steam App IDs, não assumir que o primeiro ID representa o jogo principal. Demo, Playtest, edição secundária ou listing incorreto devem ser evitados. A implementação atual avalia os IDs disponíveis e usa a edição representativa com maior volume válido de reviews.

* O Steam Quality Gate é defesa em profundidade:
  - aplicado durante `CatalogAcquisitionService.plan()`;
  - revalidado antes de escrita em `CatalogAcquisitionService.apply()`.

* Nenhum candidato Steam pode ser inserido automaticamente se o Steam Quality Gate não estiver confirmado como aprovado.

* Evitar desconhecidos sem evidência quase nenhuma no For You principal. Nunca inventar review count, jogadores, popularidade ou metadata para preencher ranking/UI.

* Não usar corte universal por ano como regra de produto. Recência pode influenciar ranking, mas jogos antigos relevantes continuam elegíveis.

* Primary trailer deve favorecer conteúdo official/launch/gameplay/story/announcement/reveal/teaser e penalizar walkthrough, tutorial, guide, review, how-to, let's play, reaction, interview e BTS/dev diary quando existir trailer melhor.

* Preços Steam devem usar o snapshot real mais recente. Quando price_overview.final estiver disponível, ele representa o preço atual/final exibido; não recalcular desconto visualmente a partir do preço cheio. discountPercent e priceCents devem pertencer ao mesmo snapshot.

* Steam é apenas uma fonte de preço/loja para PC. Jogos Nintendo, PlayStation, Xbox, Epic, GOG etc. só podem exibir preço/loja quando houver fonte real e confiável. Não inferir loja a partir de plataforma e não inventar preço para preencher layout.

* A arquitetura de ofertas deve evoluir de forma multi-store sem chamadas externas por card no Feed. Prefira sincronização/backend e dados persistidos/batch; nunca N+1 ou scraping aleatório.

### Discovery-First Ranking

O planejamento de aquisição utiliza ranking discovery-first depois dos gates obrigatórios.

Para candidatos Steam aprovados, a exposição atual é classificada pelas bandas:

* `HIDDEN_GEM`: 100–999 reviews;
* `DISCOVERY`: 1.000–9.999 reviews;
* `ESTABLISHED`: 10.000–49.999 reviews;
* `MAINSTREAM`: 50.000+ reviews.

Essas bandas são sinais de exposição, não de elegibilidade.

Nenhuma banda possui limite máximo que torne um jogo inelegível.

A implementação atual calcula `discoveryPriority` combinando:

* qualidade IGDB ajustada/Bayesiana;
* bônus de exposição;
* satisfação Steam.

Fórmula operacional atual para candidatos Steam:

`discoveryPriority = adjustedIgdbRating + exposureBonus + 0.35 × (steamPositivePercentage - 90)`

Bônus atuais:

* HIDDEN_GEM: +8;
* DISCOVERY: +5;
* ESTABLISHED: +2;
* MAINSTREAM: +0.

Essa fórmula é uma heurística operacional atual, não uma regra imutável de produto. Mudanças futuras exigem nova validação sobre distribuição real e testes determinísticos.

A lógica deve preservar o princípio:

jogo menos conhecido + qualidade forte
pode superar
jogo extremamente conhecido + qualidade semelhante.

Mas não preservar o princípio incorreto:

jogo mais obscuro
sempre supera
jogo mais conhecido.

Exemplo obrigatório de comportamento:

* 400 reviews / 92% positivas pode receber maior prioridade de descoberta do que 100.000 reviews / 93%, se a qualidade global for semelhante;
* 110 reviews / 80% não deve automaticamente superar 800–1.000 reviews / 97% apenas por estar na banda HIDDEN_GEM.

Jogos NON_STEAM não recebem banda Steam inventada. Eles continuam ordenados pelos sinais IGDB disponíveis, com tratamento neutro na comparação entre fontes.

A ordenação final deve continuar determinística. O comportamento atual considera, em ordem:

1. `discoveryPriority`;
2. qualidade ajustada;
3. menor exposição Steam quando aplicável;
4. IGDB ID como desempate estável.

O manifest de aquisição pode expor diagnóstico como:

* `steamExposureBand`;
* `discoveryPriority`;
* `steamReviewCount`;
* `steamPositivePercentage`;
* `steamEvidenceStatus`.

Esses campos de planejamento não precisam ser persistidos no `Game` sem decisão explícita de schema.

### Catalog Acquisition Safety

`CatalogAcquisitionService.plan()` é a etapa de planejamento/auditoria e não deve escrever no catálogo.

A escrita é explícita e controlada via `CatalogAcquisitionService.apply()`.

Regras obrigatórias para aquisição real:

* exigir limite positivo explícito;
* nunca usar fallback implícito para "todos os READY";
* revalidar identidade/dedupe imediatamente antes da escrita;
* não inserir ALREADY_EXISTS;
* não inserir AMBIGUOUS;
* não inserir REJECTED;
* não inserir candidato Steam que falhe no Steam Quality Gate;
* erro em um candidato não deve autorizar processamento silencioso de outro quando a operação for um canary controlado.

Para operações canary, `--limit 1` sozinho não é suficiente se não houver garantia de identidade do candidato auditado. O CLI deve ser capaz de fixar explicitamente o candidato antes de permitir uma escrita supervisionada.

Não usar SQL manual ou `Prisma.create()` ad hoc para contornar esse fluxo.

O caminho oficial de escrita é:

`CatalogAcquisitionService.apply()`
→ revalidação
→ `GameSyncService`
→ repository
→ PostgreSQL.

### External API Safety

IGDB discovery deve possuir ordenação explícita e resultado determinístico.

O ranking local deve possuir desempates estáveis.

Steam utiliza fila centralizada de requests com pacing e retry controlado.

A implementação atual:

* limita o ritmo das requests Steam;
* trata HTTP 429;
* respeita `Retry-After` quando fornecido;
* possui número finito de retries;
* não cria retry infinito;
* não remove dados IGDB válidos apenas porque um enriquecimento Steam falhou.

Não criar chamadas Steam/IGDB por card durante renderização do Feed.

---

# 40. SEPARAÇÃO FRONTEND/BACKEND

O frontend Flutter fica nas pastas `lib/`, `android/`, `web/`, `assets/` e `test/`; sua documentação de organização está em `frontend/README.md`. O Flutter permanece com `pubspec.yaml` na raiz para não quebrar o fluxo de desenvolvimento e o wrapper `flutter.ps1`.

O backend fica exclusivamente em `backend/`, com código TypeScript em `backend/src/`, schema e migrations em `backend/prisma/`, dependências em `backend/package.json` e configuração segura em `backend/.env.example`. Não misturar imports, credenciais, regras ou dependências entre as duas áreas.

## Manutenção do protótipo

- `lib/features/feed/feed_comments_sheet.dart` concentra o painel de comentários e descarta seus recursos ao fechar. Curtidas e contagens permanecem no `FeedController` durante a sessão.

- Abrir os comentários é público. Curtir, responder e enviar exigem autenticação; cancelar o login preserva o rascunho.

- O contrato `backend/src/modules/games/game.repository.ts` exige o ID persistido nos candidatos; nunca usar título ou slug como ID do banco.

- O backend possui lockfile pnpm e comandos `typecheck`, `test`, `format` e `format:check`. Dependências e arquivos de `dist/` não são versionados.

- A API e a persistência Prisma do catálogo/biblioteca estão implementadas. A autenticação real usa Firebase Authentication no Flutter e Firebase Admin SDK no backend; rotas protegidas derivam o usuário do ID Token validado. Não reintroduzir `x-user-id`, `dev-user` ou identidade livre enviada pelo cliente. A sincronização externa automática de produção continua sendo uma preocupação separada.

- Feed e Explorar usam a API de jogos. Feed e Biblioteca compartilham `LibraryStore`/`ApiLibraryRepository`; o estado ativo do produto usa Curtidos, Quero jogar, Já joguei e avaliações. `isFavorite` pode existir no banco apenas como legado. Avaliar implica PLAYED. Fórum, comentários e perfil podem conter partes demonstrativas/em memória conforme o código atual; confirme no repositório antes de assumir.

## Primeira migration aplicada

`backend/prisma/migrations/20260912000100_initial_schema/migration.sql` foi

aplicada ao PostgreSQL local nextplay. O banco contém a estrutura inicial e

relações explícitas das curtidas, seguidores e pesquisas. IDs relacionados

usam UUID compatível. Notas são de 1 a 5 e exigem PLAYED; seguir a si mesmo

é proibido por CHECK, assim como valores inválidos de ofertas e jogadores.

Esses CHECKs são mantidos no SQL. Não editar migrations já aplicadas.

`pnpm.cmd run test:db` e os testes de API, executados em backend, verificam o PostgreSQL local com transações revertidas quando o banco de teste está disponível. A API e o GameRepository Prisma estão implementados. Nunca editar migration aplicada, resetar o banco ou reintroduzir identidade temporária `dev-user` como autenticação.

---

# 41. TRAILERS E PLAYBACK — ARQUITETURA CANÔNICA

O NextPlay deve tratar trailer como mídia de catálogo, não como postagem de usuário.

Estratégia de source:

1. Direct autorizado — MP4/HLS ou formato direto permitido, vindo de press kit oficial, site oficial, publisher, desenvolvedor, parceiro autorizado ou submissão autorizada. É a opção preferencial porque permite player próprio e controle integral de UX.

2. YouTube — fallback quando não existir fonte Direct autorizada. Usar somente APIs públicas suportadas. Não prometer remoção completa de branding, recomendações ou elementos inevitáveis do iframe.

É proibido implementar como parte normal do produto:

* scraping/download não autorizado de YouTube;

* yt-dlp/youtube-dl para extrair trailers;

* extração de URLs internas de stream do YouTube;

* uso do CDN da Steam como CDN do NextPlay sem permissão;

* re-hospedagem de trailer comercial sem autorização;

* assumir que URL pública implica licença de redistribuição.

A arquitetura é multi-source e vale para AAA, AA, clássicos, jogos médios, cult, hidden gems, indies conhecidos e indies pequenos. Direct não é uma solução exclusiva para indie.

## Abstração de source

Direção arquitetural aprovada: TrailerPlaybackSource distingue pelo menos direct e youtube, com metadata de origem suficiente para rastrear provider/source quando disponível. A UI do Feed não deve conhecer detalhes internos do provider.

## Abstração de player

A interface comum de player deve expor, conforme aplicável:

* load/source;

* play;

* pause;

* seekTo;

* position;

* duration;

* state;

* buffering;

* mute/unmute;

* volume;

* dispose.

Implementações esperadas: DirectTrailerPlayer e YoutubeTrailerPlayer. Não adicionar múltiplos players concorrentes sem necessidade comprovada.

## Autoridade de playback

* Um card ativo pode iniciar autoplay uma vez.

* A intenção explícita do usuário tem prioridade sobre autoplay/reconcile/page update.

* Se o usuário pausar, o mesmo card não pode voltar a tocar automaticamente por lógica de reconciliação.

* Se o usuário pedir play, lógica automática não deve pausá-lo imediatamente enquanto o card continua ativo.

* buffering é estado real do player, não intenção do usuário.

* Ao diagnosticar, instrumentar origem dos comandos (userTap, pageActivation, pageDeactivation, lifecycle, reconcile etc.) em vez de logs genéricos PLAY/PAUSE.

## Seekbar NextPlay

A Home/Feed deve ter uma única seekbar visível.

Ela pertence ao NextPlay e deve consumir a abstração comum do player (position, duration, seekTo). Deve funcionar em playing e paused, suportar tap e drag/scrub, reconciliar com a posição real e não disparar Play/Pause nem swipe vertical acidentalmente.

Posição visual obrigatória no Feed:

conteúdo/metadados → preço/lojas/CTA → seekbar real → bottom navigation.

Não manter simultaneamente scrubber antigo dentro/sobre o player e seekbar inferior.

## Direct player

Para source Direct:

* tap no trailer alterna Play/Pause;

* pausar preserva frame/timestamp;

* resume continua do mesmo ponto;

* mute/unmute e seek são controlados pelo NextPlay;

* loading usa artwork/capa real do jogo e nunca deve virar retângulo preto por falha de thumbnail externa;

* ended permite replay sem UI externa.

Validar separadamente Android/iOS e Web/Edge. URLs Direct usadas na Web precisam de CORS compatível; não contornar CORS pelo frontend.

## YouTube fallback

Preservar o player YouTube como fallback. Não criar hacks visuais que obscureçam o iframe para fingir remoção de UI inevitável. Usar apenas parâmetros/APIs públicas realmente suportadas pela versão instalada. O iframe não deve roubar foco/input do Feed quando a configuração pública permitir pointerEvents: none/equivalente e teclado desabilitado.

## Lifecycle sensível

O player já passou por correções delicadas. Preserve controller único/reutilizado e proteções contra callbacks atrasados/revisões de vídeo. Não reintroduzir ready gate customizado, fila serial de comandos ou controller por card sem causa técnica comprovada e teste de regressão.

## Validação de player

Testes automatizados são obrigatórios, mas não bastam para declarar concluídos problemas de PlatformView/iframe/gestos. Validar manualmente no Edge e em Android físico, incluindo Samsung Galaxy S20 FE como aparelho real de referência, sem criar layout específico para ele.

---

# 42. ESCALA DO FEED E CATÁLOGO — DIREÇÃO FUTURA APROVADA

O produto deve ser preparado para centenas e depois milhares de jogos sem carregar todo o catálogo no cliente.

Direção:

* Feed paginado/infinito, recebendo lotes pequenos do backend.

* Prefetch antes do lote atual acabar para permitir dezenas/centenas de swipes numa única sessão sem reiniciar o app.

* Histórico persistente de impressões/visualizações por usuário/guest session para reduzir repetição entre sessões e dispositivos.

* Não excluir um jogo para sempre apenas porque foi visto. Usar cooldown/rebaixamento e permitir reentrada futura quando fizer sentido.

* Evitar duplicatas na fila atual e manter ordenação determinística/paginação segura.

* Essa direção ainda não autoriza implementar catálogo de 500 jogos, feed infinito ou novo algoritmo sem solicitação específica. Ela existe para impedir escolhas arquiteturais que bloqueiem essa evolução.

---

# 43. ESTADO OPERACIONAL ATUAL — 2026-09-21

Infraestrutura ativa:

* Backend público: https://projeto-playfind.onrender.com
* API base: https://projeto-playfind.onrender.com/api/v1
* Health: https://projeto-playfind.onrender.com/health
* Banco: Neon PostgreSQL.
* Render Free pode sofrer cold start.

O catálogo persistido possuía 343 jogos na última verificação operacional anterior ao primeiro canary de Catalog Acquisition.

Não confundir:

* quantidade de jogos persistidos no banco;
* quantidade descoberta pelo planning;
* quantidade READY para possível aquisição.

Na validação read-only mais recente do Catalog Acquisition:

* discovered: 727;
* already existing: 194;
* ambiguous: 33;
* rejected: 87;
* READY: 413.

Dos 413 READY:

* HIDDEN_GEM: 8;
* DISCOVERY: 174;
* ESTABLISHED: 113;
* MAINSTREAM: 45;
* NON_STEAM: 73.

Esses números são snapshot de planejamento/auditoria e não significam que 413 jogos já estejam persistidos.

O ranking discovery-first reduziu a dominância de mainstream sem criar exclusão por popularidade.

Na validação:

Top 20:
* HIDDEN_GEM: 4;
* DISCOVERY: 5;
* ESTABLISHED: 1;
* MAINSTREAM: 2;
* NON_STEAM: 8.

Top 50:
* HIDDEN_GEM: 6;
* DISCOVERY: 27;
* ESTABLISHED: 2;
* MAINSTREAM: 4;
* NON_STEAM: 11.

Top 100:
* HIDDEN_GEM: 7;
* DISCOVERY: 62;
* ESTABLISHED: 8;
* MAINSTREAM: 6;
* NON_STEAM: 17.

Não tentar forçar quota de hidden gems quando o pool não possuir candidatos suficientes. Na validação atual existem apenas 8 HIDDEN_GEM entre os 413 READY.

Nunca reduzir o piso de qualidade apenas para atingir composição percentual.

O hard gate Steam atual permanece:

* >= 100 reviews;
* >= 80% positivas.

O primeiro canary real ainda NÃO foi executado com sucesso. A tentativa anterior foi interrompida antes da escrita porque o CLI não garantia que `--limit 1` processaria exatamente o candidato previamente auditado.

Nenhum jogo foi inserido durante esse canary interrompido.

O próximo canary somente deve ocorrer quando for possível fixar explicitamente a identidade do candidato auditado e garantir que nenhum outro candidato seja processado como fallback.

Tratamento atual de cold start do Feed, conforme implementação validada:

* timeout inicial de aproximadamente 60s;

* timeout de loadMore de aproximadamente 15s;

* no máximo 1 retry automático adicional para timeout/erro de conexão, com pequeno atraso;

* manter loading enquanto ainda houver tentativa válida;

* Feed real não deve cair silenciosamente para catálogo demo.

Não reexecutar a limpeza destrutiva, não reintroduzir os 99 registros removidos e não desfazer catalog hygiene sem análise/solicitação explícita.

---

# 44. HOME / FOR YOU — CONTRATO VISUAL E DE DADOS

A referência visual aprovada funciona como contrato de composição, não como fonte de valores.

Hierarquia desejada:

HEADER
↓
TRAILER 16:9
↓
AÇÕES
↓
respiro visual
↓
BADGES / RATING / AFINIDADE
↓
TÍTULO / GÊNEROS / METADATA
↓
DESCRIÇÃO
↓
PREÇO / PLATAFORMAS / LOJAS / CTA
↓
SEEK BAR REAL
↓
BOTTOM NAV

Header principal:

* busca;

* marca NextPlay;

* controle de áudio único.

Ações principais:

* Curtir;

* Quero jogar;

* Já joguei;

* Comentários;

* Enviar/Compartilhar.

Regra absoluta:

ZERO DADOS FICTÍCIOS NA HOME.

Valores presentes em mockups/screenshots, como números de curtidas, comentários, nota, preço, desconto, plataformas, lojas ou badge de trailer, são somente referência visual.

Quando faltar dado:

procurar/implementar fonte real;

persistir/expor corretamente;

usar estado verdadeiro se a fonte não existir.

Exemplos:

* likeCount = 0 → mostrar 0;

* commentCount = 0 → mostrar 0;

* sem rating → “Sem avaliações”;

* sem desconto → não mostrar desconto inventado;

* sem preço confiável → “Preço indisponível”;

* trailer real sem prova de oficialidade → “TRAILER”;

* “TRAILER OFICIAL” apenas com evidência rastreável.

Plataforma e loja são conceitos diferentes. Nintendo Switch não implica automaticamente uma URL/preço da Nintendo eShop; PlayStation não implica PS Store; PC não implica Steam.

Evitar N+1 no /feed. Agregados como likeCount, commentCount, rating e lojas devem ser resolvidos por queries/batches/includes adequados no backend.

---

# 45. PLAYER DO FEED — REGRAS VISUAIS ATUAIS

O player passou por correções delicadas e está estabilizado no Samsung físico. Alterações visuais não autorizam reescrever o playback.

Preservar:

* controller reutilizado;
* lifecycle;
* WebView/YouTube;
* fallback de candidatos;
* startup timeout;
* visual guard;
* artwork;
* fade de aproximadamente 200ms;
* swipe vertical;
* seek engine;
* mute;
* play/pause.

Na Home:

* o controle principal de play/pause é o botão pequeno no canto inferior direito do trailer;
* não exibir um grande botão customizado central ao pausar;
* o controle de áudio principal deve aparecer uma única vez no header;
* a seekbar visível é única e fica abaixo do conteúdo/CTA, imediatamente acima da bottom nav.

---

# 46. PROBLEMAS CONHECIDOS EM TESTE MANUAL — PENDENTES

Os itens abaixo foram observados no Samsung físico e não devem ser descritos como concluídos até nova validação:

Curtir pode exigir múltiplos toques.
LibraryStore.toggleLike atualmente pode descartar novos toques enquanto o mesmo gameId está em _pendingLikes. A correção deve manter Optimistic UI, registrar a última intenção e preferir persistência explícita liked: true/false via interaction PATCH. Regra: last user intent wins.

Bloco de metadata da Home está alto demais.
Rating/afinidade/gênero/título e detalhes estão visualmente colados à linha de ações. Deve haver mais respiro após as ações, aproximando o bloco de metadata/CTA/seekbar sem causar overflow.

Alguns preços Steam promocionais aparecem incorretos.
Alguns jogos em promoção mostram preço final correto; outros exibem preço original. Auditar snapshot, atualização/sync e escolha de SteamOffer mais recente. Não corrigir com cálculo fake no Flutter.

Jogos de Nintendo e outras lojas podem ficar sem preço.
Exemplos observados: Xenoblade, Zelda e Bayonetta 3. Não inventar preço. O problema requer fonte/estrutura multi-store real quando disponível.

Alguns jogos aparecem sem plataforma.
Auditar IGDB → mapper → GamePlatform → API → Flutter. Não usar fallback fake PC.

Overlay grande central de play aparece ao pausar.
Deve ser removido visualmente; manter somente o controle pequeno no canto inferior direito e preservar a engine do player.

Bottom navigation ainda pode estar na ordem antiga em implementações locais.
A ordem correta e obrigatória é: Explorar | Fórum | Início | Biblioteca | Perfil, com Início no centro.

Ao corrigir esses itens, validar Android físico primeiro e só então Edge/Web.

---

# 47. REGRAS DE GIT E CONTINUIDADE

Antes de qualquer alteração:

git status --short

git diff

Não executar automaticamente:

* reset;
* restore;
* checkout;
* stash;
* clean;
* commit;
* push;
* deploy.

Preservar alterações não commitadas.

Ao receber uma tarefa, comparar sempre:

AGENTS.md;

código atual;

git diff;

screenshots/referências fornecidas;

comportamento observado no Android físico.

Não assumir que uma implementação descrita em sessão anterior continua igual ao código real.
---

# 48. PROVIDERS DE PREÇO — 2026-09-19

Steam mantém integração real existente. PlatPrices v2 (PlayStation) e NTPrices v2 (Nintendo) possuem clientes HTTP reais e sync explícito `pnpm.cmd --dir backend run sync:prices`, usando `X-API-Key` e região BR verificada. As variáveis são `PLATPRICES_API_KEY` e `NTPRICES_API_KEY`. Sem chave: INTEGRAÇÃO PRONTA — FALTA API KEY; não criar ofertas. Implementação testada com fixtures não equivale a fonte ativa: consumo autenticado e persistência real dessas lojas continuam pendentes das chaves.

Xbox permanece SEM PROVIDER ATIVO. `PSPRICES_API_KEY` está reservado para futuro adaptador PSPrices B2B; não há endpoint presumido nem ativação fictícia. `StorePriceProvider` continua desacoplado.

Matching rejeita ambiguidade, DLC/demo/bundle e edição incompatível. Sem ID conhecido, exige nome, publisher e lançamento compatíveis. Preços vêm da resposta real; não usar preço de assinatura como preço geral. Sync grava StoreOffer existente, atualiza observedAt quando igual e preserva snapshots nas mudanças. Não chamar API externa durante render do feed. Não aplicar migration para esse fluxo.

Estado, limitações, endpoints e comandos estão em `backend/PRICE_PROVIDERS.md`. Preservar as validações físicas anteriores de feed, interações e player.

---

# 49. PREÇOS ATIVOS — DECISÃO ATUAL

Por enquanto, somente preços reais da Steam estão ativos no produto. PlayStation, Xbox e Nintendo continuam como plataformas disponíveis e preferências de recomendação, mas suas ofertas e providers não devem ser ativados nem apresentados na UI. A Home só exibe preço quando há `SteamOffer` real. A tela de detalhes separa plataformas disponíveis de preço/loja e mostra somente Steam, com preço atual, preço original em promoção, desconto e ação `Abrir Steam`.

Preservar `StoreOffer`, `UserPlatformPreference`, PlatPrices, NTPrices e a arquitetura multi-store para uma decisão futura. Não inventar preços nem exibir `Preço indisponível` para consoles como se suas integrações estivessem ativas.
