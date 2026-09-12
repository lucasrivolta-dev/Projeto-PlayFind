# NextPlay Backend

API local Node.js/TypeScript com Fastify, Prisma e PostgreSQL. O Flutter consome esta API; não acessa o banco, IGDB ou Steam diretamente.

## Preparar e executar

Na pasta `backend/`, copie `.env.example` para `.env` e configure `DATABASE_URL` para o banco local `nextplay`. Nunca versione ou imprima o arquivo com credenciais. No PowerShell:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run prisma:generate
pnpm.cmd run prisma:status
pnpm.cmd run dev
```

O servidor escuta somente `127.0.0.1:3333`. `GET /health` verifica se está ativo. A migration inicial já foi aplicada ao banco local; não edite migrations aplicadas nem use reset para resolver divergências. O seed de desenvolvimento contém 10 jogos e usa upsert por identidade externa.

## API atual

- `GET /api/v1/games`, `GET /api/v1/games/:idOrSlug`, `GET /api/v1/feed`: catálogo e feed públicos.
- `GET /api/v1/library`: biblioteca do usuário local com status, favorito, avaliação e `igdbId`; o campo `likes` traz curtidas mesmo de jogos fora da biblioteca.
- `PUT /api/v1/library/:gameId`: define `WANT_TO_PLAY` ou `PLAYED`.
- `DELETE /api/v1/library/:gameId`: remove da biblioteca.
- `POST /api/v1/library/:gameId/favorite`: define/alternar favorito.
- `POST /api/v1/library/:gameId/like`: alterna curtida persistida.
- `POST` e `DELETE /api/v1/library/:gameId/rate`: atribui ou remove nota. Atribuir nota implica `PLAYED`.

Em desenvolvimento automatizado, `allowTestUsers: true` aceita explicitamente `x-user-id: dev-user`. No servidor normal, as rotas pessoais exigem `Authorization: Bearer <Firebase ID token>`; o token é validado pelo Firebase Admin e somente o `uid` verificado identifica o usuário. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no `.env` local. Nunca versione a chave privada nem use `x-user-id` no fluxo normal.

## Código e testes

`src/modules/games/` resolve UUID, slug, Steam ID e IGDB ID; `src/modules/library/` contém as regras de biblioteca. `src/modules/integrations/` contém clientes e mappers IGDB/Steam; `src/modules/sync/` coordena matching e persistência. A sincronização externa de produção ainda requer credenciais, agendamento e controle administrativo.

```powershell
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run test:db
pnpm.cmd run prisma:validate
pnpm.cmd run prisma:status
pnpm.cmd run format:check
```

Os testes de API usam transações revertidas no PostgreSQL local. `prisma:validate` e `prisma:status` não alteram o banco. O Prisma Client é código gerado localmente; se os tipos de modelos estiverem ausentes após instalar dependências, rode `pnpm.cmd run prisma:generate`.
