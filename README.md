<div align="center">

NextPlay

Descubra seu próximo jogo.

Explore jogos em um feed vertical de trailers, encontre títulos que combinam com você e organize o que quer jogar.

Flutter · Dart · Node.js · TypeScript · Fastify · PostgreSQL · Prisma

</div>

O projeto

Sabe quando você quer jogar algo diferente, mas não sabe por onde começar? O NextPlay nasceu dessa ideia. Em vez de depender só de listas e rankings, você pode descobrir jogos pelo trailer, explorar o catálogo e guardar os títulos que chamaram sua atenção.

O projeto reúne um aplicativo Flutter e uma API própria. O aplicativo consome dados normalizados pela API, que mantém o catálogo, as interações dos usuários e o feed de descoberta.

Prévia

<div align="center">
  <img src="samsung_screen.png" alt="Feed do NextPlay em um celular Android" width="290">
</div>

Captura do aplicativo em desenvolvimento. A reprodução e a disponibilidade dos trailers dependem da mídia de cada jogo e do provedor de vídeo.

Funcionalidades

Área

O que já existe no projeto

Feed

Navegação vertical por jogos com trailers quando disponíveis e imagem de fallback.

Descoberta personalizada

Seleção do feed considerando preferências, interações e jogos já vistos.

Explorar

Busca e navegação pelo catálogo de jogos.

Detalhes

Informações e mídia de cada jogo.

Biblioteca

Curtidas, favoritos, jogos que o usuário quer jogar ou já jogou, notas e avaliações.

Comunidade

Comentários e telas de fórum.

Conta

Autenticação com Firebase e perfil do usuário.

Catálogo

Integração e rotinas de aquisição, atualização e verificação de dados da IGDB e da Steam.

O NextPlay está em desenvolvimento. A existência de uma tela ou rotina no repositório não significa que todos os fluxos já estejam prontos para lançamento público.

Como funciona

Flutter (app) ──HTTP──> API Fastify ──Prisma──> PostgreSQL
                         │
                         ├── IGDB e Steam: dados do catálogo
                         └── Firebase Admin: validação da identidade

O app usa o UUID interno de cada jogo nas interações. IDs da IGDB e da Steam ficam como referências externas. A API combina dados do catálogo, preferências e histórico de interações para compor o feed, com mecanismos para reduzir repetições e priorizar jogos ainda não vistos.

Tecnologias

Camada

Tecnologias

Aplicativo

Flutter, Dart

API

Node.js, TypeScript, Fastify

Persistência

PostgreSQL, Prisma

Autenticação

Firebase Authentication, Firebase Admin

Dados de jogos

IGDB, Steam

Reprodução de trailers

YouTube no aplicativo, quando há trailer compatível

Estrutura do repositório

lib/             Aplicativo Flutter, telas e funcionalidades
test/            Testes do aplicativo
assets/          Fontes e recursos do aplicativo
android/         Projeto Android
web/             Suporte à execução web
backend/         API, schema Prisma, integrações, scripts e testes
README.md        Apresentação do projeto

O projeto Flutter fica na raiz do repositório. As dependências e os comandos da API ficam em backend/.

Executar localmente

Pré-requisitos

Flutter compatível com pubspec.yaml (Flutter 3.38 ou superior) e um dispositivo ou navegador configurado.

Node.js e pnpm para a API.

Uma instância PostgreSQL e as credenciais necessárias aos fluxos que você pretende testar.

1. Preparar a API

Na pasta backend/, copie .env.example para .env e configure pelo menos DATABASE_URL. Configure as credenciais do Firebase para rotas autenticadas e as da IGDB/Steam para executar as rotinas de catálogo. Não publique o .env.

cd backend
pnpm install --frozen-lockfile
pnpm run prisma:generate
pnpm run prisma:deploy
pnpm run dev

A API local responde em http://127.0.0.1:3333; confira http://127.0.0.1:3333/health. Use um banco de desenvolvimento ao aplicar migrations e rodar testes que dependem do banco.

2. Executar o aplicativo

Em outro terminal, volte à raiz do repositório:

flutter pub get
flutter run -d edge --dart-define=API_BASE_URL=http://127.0.0.1:3333/api/v1

No Android conectado por USB, a API que roda no computador pode ser acessada pelo celular após configurar o redirecionamento da porta:

adb reverse tcp:3333 tcp:3333
flutter run -d <id-do-dispositivo> --dart-define=API_BASE_URL=http://127.0.0.1:3333/api/v1

No Windows, dev.ps1 reúne os modos edge, mobile e api, mas usa caminhos locais de Flutter, JDK e Android SDK que podem precisar de ajuste na sua máquina.

Mais detalhes de configuração, autenticação, sync e endpoints estão em backend/README.md. A organização do app está em frontend/README.md.

Verificações

Na raiz do projeto:

flutter analyze
flutter test

Na pasta backend/:

pnpm run typecheck
pnpm run test

Parte dos testes da API requer um banco PostgreSQL de teste configurado. Consulte as instruções em backend/README.md antes de executá-los.

Estado atual

O app, a API e as rotinas de catálogo continuam em desenvolvimento e validação. O foco atual é melhorar a qualidade dos jogos apresentados, a correspondência dos trailers, a experiência do feed e a confiabilidade das recomendações. Esta é uma apresentação do código disponível, não um anúncio de lançamento.

Autoria

Projeto idealizado por Lucas e Lucas Rivolta. Confira o histórico de contribuições para acompanhar o desenvolvimento no repositório.
