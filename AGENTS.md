# AGENTS.md — Instruções do projeto NextPlay / PlaySweep

> Escopo: estas instruções se aplicam a todo o repositório. Use este documento como referência de produto, arquitetura e Design System em trabalhos futuros.
>
> Estado inicial: apenas documentação está autorizada. Não criar telas ou funcionalidades até que o usuário solicite a implementação correspondente. Essa restrição não impede implementações explicitamente solicitadas em mensagens futuras.
>
> Antes de implementar, consulte este documento e as screenshots fornecidas para a tarefa. Não invente referências visuais ausentes. Se uma decisão entrar em conflito com as screenshots ou com o Style Guide, avise o usuário antes de alterar o design. A arquitetura Flutter detalhada ainda precisa ser definida antes da implementação.
Antes de começarmos a programar, quero que você entenda completamente o projeto, sua arquitetura e seu Design System.

NÃO implemente nenhuma tela ainda.

Neste momento, apenas considere estas informações como a especificação base do projeto. Nas próximas mensagens vou pedir as telas e funcionalidades individualmente.

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

A autenticação será feita através do Firebase Authentication.

Métodos planejados:

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

O item atualmente selecionado deve SEMPRE ir para o centro do footer.

Exemplo:

Início selecionado:
Início fica no centro.

Biblioteca selecionada:
Biblioteca fica no centro.

Perfil selecionado:
Perfil fica no centro.

Os outros itens se reorganizam ao redor dele.

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

Por enquanto NÃO crie telas e NÃO implemente funcionalidades.

Use estas informações apenas como contexto permanente para nossa conversa.

Quando começarmos a desenvolver, vou enviar uma tela ou funcionalidade de cada vez.

Quero que toda implementação futura respeite:

1. este contexto;
2. as screenshots do projeto;
3. o Style Guide Obsidian Kinetic;
4. a arquitetura definida;
5. consistência entre todas as telas.

Caso uma decisão futura contradiga as screenshots ou o Style Guide, me avise antes de alterar o design por conta própria.

