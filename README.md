# NextPlay

Aplicativo Flutter de descoberta de jogos, com API Node.js/TypeScript e PostgreSQL. O Design System e as regras de produto estão em `DESIGN.md` e `AGENTS.md`.

## Rodar localmente

No Git Bash, na raiz do projeto:

```bash
./run-app.sh
```

O script descarta apenas os caches `.dart_tool/` e `build/`, obtém as dependências Flutter, verifica ou inicia a API local e abre o app no Edge. O backend precisa de `backend/.env` com `DATABASE_URL` configurada e do banco `nextplay` já migrado. O log de desenvolvimento fica em `backend-dev.log` (ignorado pelo Git). Se houver outro servidor na porta 3333, encerre-o antes de testar esta versão.

No PowerShell, também é possível iniciar separadamente:

```powershell
cd backend
pnpm.cmd run dev
```

Em outro terminal, na raiz:

```powershell
.\flutter.ps1 pub get
.\flutter.ps1 run -d edge
```

O wrapper Flutter usa uma unidade temporária para contornar o caminho com acentos e a libera ao terminar. Quando `.dart_tool/package_config.json` apontar para uma unidade antiga, use `./run-app.sh` para recriar os caches.

Para abrir a versão web compilada, com Node.js disponível:

```powershell
.\flutter.ps1 build web --no-web-resources-cdn
node scripts/preview.mjs
```

A prévia abre em `http://127.0.0.1:8765`; mantenha a API local iniciada para consultar e alterar a biblioteca. Encerre os servidores com Ctrl+C.

O projeto Android usa o SDK, Java e ADB em `.tools/`. Com o celular conectado por USB e a Depuração USB autorizada, rode `.\flutter.ps1 devices` e `.\flutter.ps1 run`. Para criar um APK de teste, rode `.\flutter.ps1 build apk --debug`; o arquivo fica em `build/app/outputs/flutter-apk/app-debug.apk` e usa assinatura de desenvolvimento, inadequada para publicação. No Android físico, a configuração atual da API local não funciona sem uma configuração de rede própria. A estrutura iOS ainda não foi gerada; compilar para iOS exige macOS e Xcode.

## Estado atual

As cinco abas são Início/For You, Explorar, Fórum, Biblioteca e Perfil; os ícones do rodapé permanecem em posições fixas. Feed e Explorar leem jogos da API, mas usam catálogo demonstrativo quando ela falha. O Feed, Explorar e Biblioteca compartilham um `LibraryStore` ligado ao `ApiLibraryRepository`. `Quero jogar`, `Já joguei`, favorito, avaliação e curtida de jogo usam `/api/v1/library` e são persistidos no PostgreSQL. O `GET /api/v1/library` recupera status, favoritos, avaliações e curtidas após recarregar, inclusive curtidas de jogos fora da Biblioteca. A identificação no Flutter usa Steam ID ou IGDB ID; jogos sem ambos ainda não podem ser reidratados por esse cliente. Avaliar marca o jogo como `PLAYED`, conforme a regra existente do backend.

A API usa `Authorization: Bearer <Firebase ID token>` nas ações pessoais; o backend valida o token com Firebase Admin e deriva dele o usuário persistido. `x-user-id: dev-user` continua disponível somente em instâncias de teste explicitamente autorizadas. O servidor de desenvolvimento escuta apenas `127.0.0.1` e rejeita IDs arbitrários e tokens Bearer não verificados. O Flutter usa Firebase Authentication e nunca contém credenciais administrativas.

O Feed tem descoberta vertical e comentários em bottom sheet. Explorar oferece busca, filtros e escolhas de descoberta. A Biblioteca reúne Quero jogar, Já joguei, Favoritos e Avaliações com visualizações em grade/lista; Feed, Explorar e Biblioteca abrem a mesma tela de detalhes. Fórum, comentários, perfil, login e parte das ações de descoberta permanecem em memória. O backend agora oferece sincronização manual de catálogo por IGDB com enriquecimento Steam; o Flutter consome somente os dados já normalizados pela API e não contém credenciais dessas fontes. Ainda faltam agendamento e um disparador administrativo para sincronização de produção. As fontes Sora e Manrope são empacotadas em `assets/fonts`; capas externas exigem internet.

## Organização e verificação

- `lib/`, `assets/`, `android/`, `web/`, `test/`: frontend Flutter.
- `backend/src/`: API, serviços, repositórios e integrações.
- `backend/prisma/`: schema, migration e seed local de 10 jogos.
- `backend/test/`: testes do backend e da API com transações revertidas.

```powershell
.\flutter.ps1 analyze
.\flutter.ps1 test
cd backend
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run prisma:validate
pnpm.cmd run prisma:status
```

No PowerShell que bloqueia scripts, use `pnpm.cmd` e `npm.cmd`. Nunca versione `backend/.env`; mantenha senhas apenas ali. Veja `backend/README.md` para detalhes da API e do banco.

Para importar o catálogo real manualmente, configure `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET` em `backend/.env` (e opcionalmente `STEAM_API_KEY`) e execute `pnpm.cmd run sync:games` dentro de `backend/`. O processo é idempotente e mantém um único registro por jogo.
