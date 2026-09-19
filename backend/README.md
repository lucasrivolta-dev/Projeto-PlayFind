# NextPlay Backend

Providers multi-store, estado real e comandos de sync: [PRICE_PROVIDERS.md](PRICE_PROVIDERS.md).

API local Node.js/TypeScript com Fastify, Prisma e PostgreSQL. O Flutter consome esta API; não acessa o banco, IGDB ou Steam diretamente.

## Preparar e executar

Na pasta `backend/`, copie `.env.example` para `.env` e configure `DATABASE_URL` para o banco local `nextplay`. Nunca versione ou imprima o arquivo com credenciais. No PowerShell:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run prisma:generate
pnpm.cmd run prisma:status
pnpm.cmd run dev
```

O servidor escuta somente `127.0.0.1:3333`. `GET /health` verifica se está ativo. As migrations versionadas devem ser aplicadas com `pnpm.cmd run prisma:deploy`; não edite migrations aplicadas nem use reset para resolver divergências. O seed de desenvolvimento contém 10 jogos e usa upsert por identidade externa.

## API atual

- `GET /api/v1/games`, `GET /api/v1/games/:idOrSlug`, `GET /api/v1/feed`: catálogo e feed públicos. Cada jogo inclui `id` (UUID interno), além de `igdbId` e `steamAppId` opcionais, `isFree` e mídia normalizada conforme a rota.
- `GET /api/v1/library`: um item por usuário e jogo com `gameId` e `game.id` internos, status, `liked`, favorito, avaliação e IDs externos opcionais. Jogos apenas curtidos ou favoritados aparecem com `status: null`; linhas vazias não aparecem. Aceita filtros `status`, `favorite=true`, `liked=true` e `rated=true`. O campo `likes` continua disponível e inclui `gameId`.
- `GET /api/v1/library/:gameId/interaction` e `PATCH /api/v1/library/:gameId/interaction`: `gameId` exige o UUID interno. Leem ou definem campos independentes (`liked`, `isFavorite`, `status`, `rating`, `reviewText`) de forma idempotente. `status` aceita `WANT_TO_PLAY`, `PLAYED` ou `null`; nota inteira de 1 a 5 implica `PLAYED`.
- `PUT /api/v1/library/:gameId`: define `WANT_TO_PLAY` ou `PLAYED`.
- `DELETE /api/v1/library/:gameId`: limpa status e avaliação, preservando curtida e favorito independentes.
- `POST /api/v1/library/:gameId/favorite`: define/alternar favorito.
- `POST /api/v1/library/:gameId/like`: alterna curtida persistida.
- `POST` e `DELETE /api/v1/library/:gameId/rate`: atribui ou remove nota. Atribuir nota implica `PLAYED`.

`UserGameLibrary` é a fonte única do estado usuário-jogo, protegida pela chave composta `(userId, gameId)`. A migration de consolidação copiou as curtidas antigas antes de remover `GameLike`; não altera jogos nem comentários. Quando a última interação é removida, o registro vazio é eliminado. Os endpoints anteriores continuam aceitando identificadores legados por compatibilidade; o Flutter usa o UUID interno.

Em desenvolvimento automatizado, `allowTestUsers: true` aceita explicitamente `x-user-id: dev-user`. No servidor normal, as rotas pessoais exigem `Authorization: Bearer <Firebase ID token>`; o token é validado pelo Firebase Admin e somente o `uid` verificado identifica o usuário. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` no `.env` local. Nunca versione a chave privada nem use `x-user-id` no fluxo normal.

## Código e testes

`src/modules/games/` resolve UUID, slug, Steam ID e IGDB ID; `src/modules/library/` contém as regras de biblioteca. `src/modules/integrations/` contém clientes e mappers IGDB/Steam; `src/modules/sync/` coordena matching e persistência. O script `pnpm.cmd run sync:games` já executa a importação manual idempotente: IGDB é a fonte principal, e Steam enriquece o mesmo registro quando encontra um App ID por relação externa ou nome exato. Ainda faltam agendamento e um disparador administrativo para operação de produção.

## Sincronizar o catálogo

Preencha `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET` no `.env` local e, se quiser o fallback de busca por nome, `STEAM_API_KEY`. O catálogo nunca recebe essas credenciais. Depois execute:

```powershell
pnpm.cmd run sync:games
```

Para uma sincronização previsível, a CLI aceita seleção explícita sem editar o
`.env`:

```powershell
pnpm.cmd run sync:games -- --id 113112
pnpm.cmd run sync:games -- --mode popular --limit 20
pnpm.cmd run sync:games -- --mode recent --limit 20
pnpm.cmd run sync:games -- --mode discover --limit 20 --dry-run
pnpm.cmd run sync:games -- --limit 20
```

`--id` consulta exatamente um jogo (`where id = ...; limit 1`). `popular`
seleciona jogos sem versão pai, com capa, lançamento e
`total_rating_count`, ordenados pelo maior volume combinado de avaliações
(`sort total_rating_count desc`); isso mede relevância por participação, não
apenas a maior nota média. `recent` usa uma janela dos últimos cinco anos até
o momento atual, exige capa e data de lançamento, exclui datas futuras e ordena
por `first_release_date desc`. A API IGDB documenta
`where`, `sort`, `limit`, `first_release_date`, `rating`, `rating_count`,
`total_rating`, `total_rating_count`, `cover` e
`version_parent` para essas operações. O limite aceito é de 1 a 100.

Quando `IGDB_SYNC_QUERY` está definida e nenhum argumento CLI é informado, a
query personalizada é preservada, com `videos.video_id` acrescentado caso
esteja ausente. Argumentos CLI têm precedência e não são combinados
silenciosamente com essa variável.

`discover` busca um pool de até cinco vezes o limite solicitado (teto de 100)
com jogos principais (`game_type = 0` e `version_parent = null`) lançados nos
últimos cinco anos, com capa, nota total de pelo menos 70 e entre 20 e 500
avaliações. O pool é reordenado localmente pelo rating bayesiano:

```text
adjustedRating = (v / (v + 50)) * R + (50 / (v + 50)) * 75
```

`R` é `total_rating` e `v` é `total_rating_count`. O resultado não significa
“mais bem avaliados” nem “mais populares”: combina qualidade observada com
evidência suficiente para descoberta. Empates usam volume de avaliações e,
por fim, o ID IGDB. `--dry-run` consulta e classifica sem criar ou atualizar
qualquer registro no banco.

Na persistência, `rating`/`ratingCount` mantêm a avaliação de usuários do IGDB
e `totalRating`/`totalRatingCount` mantêm a avaliação combinada. As notas são
normalizadas para 0–10 e contagens ausentes permanecem nulas. O feed prefere o
par total completo, usa o par de usuários como fallback e considera nota sem
contagem como confiança desconhecida, sem atribuir um número artificial de votos.

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
