# NextPlay Backend

Esta pasta contém a primeira camada da integração de catálogo. IGDB é a fonte principal de metadados e Steam é o enriquecimento de PC. Ambas são acessadas exclusivamente pelo backend.

## Configuração

Copie `.env.example` para `.env` e preencha localmente `DATABASE_URL`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` e, quando necessário, `STEAM_API_KEY`. Nunca versione `.env` ou tokens.

## Importação inicial

Com dependências instaladas, execute `npm run sync:games`. O script busca IGDB, normaliza os dados e imprime o resultado. A persistência Prisma deve ser conectada ao `GameRepository` antes de uma importação em produção. Um job diário ou endpoint administrativo protegido pode chamar `GameSyncService` futuramente.

## Matching

O matcher compara nome normalizado, lançamento próximo, desenvolvedora, publisher e plataformas. A associação só ocorre acima do limite de confiança; remakes, remasters, edições e sequências sem evidência suficiente permanecem separados.
