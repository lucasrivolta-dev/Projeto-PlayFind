# NextPlay Backend

## Banco local e primeira migration

A migration `prisma/migrations/20260912000100_initial_schema/migration.sql`
cria a estrutura inicial de usuários, catálogo, biblioteca, comentários, fórum,
seguidores e eventos. Foi aplicada ao PostgreSQL local `nextplay`.

- `pnpm.cmd run prisma:status`: verifica migrations pendentes.
- `pnpm.cmd run prisma:deploy`: aplica migrations já revisadas.
- `pnpm.cmd run prisma:generate`: atualiza o cliente usado pelo código.
- `pnpm.cmd run test:db`: verifica relações e regras no banco local; reverte
  todos os registros temporários por transação.

Não editar uma migration que já foi aplicada. Mudanças futuras devem gerar
novas migrations e ter seu SQL revisado antes de aplicação. Não usar reset
para resolver divergências sem avaliar os dados existentes.
Os CHECKs de notas, seguidores, valores de ofertas e quantidade de jogadores
estão no SQL da migration, pois não são representados pelo schema Prisma.

O banco já está estruturado, mas a API HTTP, o repositório Prisma do catálogo
e a autenticação Firebase real ainda precisam ser implementados.

## Organização e verificação

- `src/modules/games/`: modelo normalizado e contrato do repositório.
- `src/modules/integrations/`: clientes, tipos e conversão das fontes externas.
- `src/modules/sync/`: associação e coordenação da sincronização.
- `src/scripts/`: entradas de desenvolvimento.
- `prisma/`: schema do banco; `test/`: regressões sem chamadas externas.

Na pasta `backend/`, use `pnpm install --frozen-lockfile` para instalar as
versões registradas no lockfile. Depois execute `pnpm typecheck`,
`pnpm test` e `pnpm format:check`. Use `pnpm format` para formatar.
Os arquivos compilados ficam em `dist/` e não são versionados.
O pnpm pode solicitar aprovação dos scripts de instalação do Prisma e esbuild;
essa etapa é necessária ao preparar essas ferramentas para uso real.
Os testes atuais não precisam de PostgreSQL nem de credenciais externas.

Esta pasta contém a primeira camada da integração de catálogo. IGDB é a fonte principal de metadados e Steam é o enriquecimento de PC. Ambas são acessadas exclusivamente pelo backend.

## Configuração

Copie `.env.example` para `.env` e preencha localmente `DATABASE_URL`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` e, quando necessário, `STEAM_API_KEY`. Nunca versione `.env` ou tokens.

## Importação inicial

Com dependências instaladas, execute `npm run sync:games`. O script busca IGDB, normaliza os dados e imprime o resultado. A persistência Prisma deve ser conectada ao `GameRepository` antes de uma importação em produção. Um job diário ou endpoint administrativo protegido pode chamar `GameSyncService` futuramente.

## Matching

O matcher compara nome normalizado, lançamento próximo, desenvolvedora, publisher e plataformas. A associação só ocorre acima do limite de confiança; remakes, remasters, edições e sequências sem evidência suficiente permanecem separados.
