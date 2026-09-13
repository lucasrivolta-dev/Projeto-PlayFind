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

- `GET /api/v1/games`, `GET /api/v1/games/:idOrSlug`, `GET /api/v1/feed`: catálogo e feed públicos. As respostas incluem os identificadores IGDB/Steam, `isFree` e, nos detalhes/feed, mídia normalizada.
- `GET /api/v1/library`: biblioteca do usuário local com status, favorito, avaliação e `igdbId`; o campo `likes` traz curtidas mesmo de jogos fora da biblioteca.
- `PUT /api/v1/library/:gameId`: define `WANT_TO_PLAY` ou `PLAYED`.
- `DELETE /api/v1/library/:gameId`: remove da biblioteca.
- `POST /api/v1/library/:gameId/favorite`: define/alternar favorito.
- `POST /api/v1/library/:gameId/like`: alterna curtida persistida.
- `POST` e `DELETE /api/v1/library/:gameId/rate`: atribui ou remove nota. Atribuir nota implica `PLAYED`.

Em desenvolvimento automatizado, `allowTestUsers: true` aceita explicitamente `x-user-id: dev-user`. No servidor normal, as rotas pessoais exigem `Authorization: Bearer <Firebase ID token>`; o token é validado pelo Firebase Admin e somente o `uid` verificado identifica o usuário. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no `.env` local. Nunca versione a chave privada nem use `x-user-id` no fluxo normal.

## Código e testes

`src/modules/games/` resolve UUID, slug, Steam ID e IGDB ID; `src/modules/library/` contém as regras de biblioteca. `src/modules/integrations/` contém clientes e mappers IGDB/Steam; `src/modules/sync/` coordena matching e persistência. O script `pnpm.cmd run sync:games` já executa a importação manual idempotente: IGDB é a fonte principal, e Steam enriquece o mesmo registro quando encontra um App ID por relação externa ou nome exato. Ainda faltam agendamento e um disparador administrativo para operação de produção.

## Sincronizar o catálogo

Preencha `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET` no `.env` local e, se quiser o fallback de busca por nome, `STEAM_API_KEY`. O catálogo nunca recebe essas credenciais. Depois execute:

```powershell
pnpm.cmd run sync:games
```

O fluxo consulta IGDB, normaliza capas, artworks, screenshots, vídeos, gêneros, plataformas, empresas e IDs externos, faz upsert no `Game` e então consulta os detalhes públicos da Steam para preço, disponibilidade, capa, screenshots e trailers adicionais. Vídeos IGDB/YouTube são a fonte principal: o ID e o provedor são preservados em `trailerDetails` e `primaryTrailer`; a mídia legada continua disponível em `trailers`. Como o schema atual guarda a URL canônica, essa informação é recuperável sem migration. Steam só assume `primaryTrailer` quando não há YouTube válido. IDs externos são preferidos; o matching por metadados só associa títulos idênticos com sinais suficientes de lançamento, empresa ou plataforma. Edições, remakes, demos e sequências permanecem separados. Repetir o comando atualiza o mesmo jogo e não duplica mídia nem snapshots Steam idênticos.

```powershell
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run test:db
pnpm.cmd run prisma:validate
pnpm.cmd run prisma:status
pnpm.cmd run format:check
```

Os testes de API usam transações revertidas no PostgreSQL local. `prisma:validate` e `prisma:status` não alteram o banco. O Prisma Client é código gerado localmente; se os tipos de modelos estiverem ausentes após instalar dependências, rode `pnpm.cmd run prisma:generate`.
