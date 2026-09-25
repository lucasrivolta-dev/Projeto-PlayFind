# NextPlay Autopilot v0.2

Executa **tarefas aprovadas em sequência**, valida, pede revisão em outro contexto Codex e devolve um patch para revisão humana. Node.js 22+; nenhuma dependência npm para o orquestrador. Não confundir com a manutenção de catálogo em `backend/src/modules/sync/`.

## Primeiro uso no Windows

Use uma cópia limpa e revisada deste branch. Não copie `.env`, tokens ou arquivos de autenticação para ela. A pasta de desenvolvimento habitual pode continuar com alterações não commitadas.

```powershell
node --version
npm.cmd install -g @openai/codex
codex.cmd login
codex.cmd login status
node --test orchestrator/test/runner.test.mjs
node orchestrator/runner.mjs plan orchestrator/tasks/001-smoke.json
```

`plan` só valida a tarefa e mostra o plano: não cria branch, não chama IA e não instala dependências. O login ocorre pelo fluxo do Codex no seu próprio computador. Nunca cole credenciais no chat.

Depois de conferir o plano, execute:

```powershell
node orchestrator/runner.mjs run orchestrator/tasks/001-smoke.json
```

O exemplo usa **gpt-6-sol / raciocínio Baixo** tanto na implementação quanto na revisão. O modelo precisa estar disponível na sua conta; falha de acesso encerra a execução. Para tarefas normais de backend, selecione `medium` explicitamente no JSON. Não há promoção automática para um modelo mais caro.

A execução real usa a autenticação salva do Codex e está sujeita aos limites da conta. O wrapper não encaminha `OPENAI_API_KEY`, `CODEX_API_KEY` ou credenciais dos serviços para os subprocessos; esta versão é destinada ao login local, não a CI com chaves. Há no máximo duas tentativas de implementação e duas revisões. O timeout vale por processo, não é um teto monetário ou de tokens.

## O que acontece

1. Valida a tarefa e exige Git limpo, incluindo arquivos novos.
2. Obtém lock exclusivo na pasta irmã `<repo>-autopilot`.
3. Cria clone local independente, sem hardlinks, remove o remote e cria `agent/<task-id>` nele. A origem permanece intocada.
4. Prepara dependências apenas quando necessárias: backend usa instalação pelo lockfile e `prisma:generate`; Flutter usa `pub get --enforce-lockfile`. Esses comandos podem acessar a rede e executar scripts das dependências do repositório confiável. Não roda migrations, seed, sync, `test:db` ou manutenção de catálogo.
5. Roda a validação inicial; se já falhar, para antes de gastar chamadas de IA.
6. Executa Codex com sandbox `workspace-write`, aprovação `never`, modelo e esforço explícitos. Bloqueios de sandbox não são contornados.
7. Confere HEAD e escopo, incluindo arquivos novos, e executa os checks.
8. Envia erros reais da validação para no máximo uma correção adicional.
9. Abre novo contexto Codex em `read-only` para revisar tarefa, diff e resultados. Nenhuma sessão do executor é retomada pelo revisor.
10. Confere que o código não mudou durante validação/revisão, grava relatório, patch e texto de PR, libera lock e para.

A execução isolada da v0.1 continua disponível. A v0.2 adiciona uma fila explícita e finita (2–3 tarefas), descrita abaixo. Não há fila infinita, retomada automática, integração Antigravity, commit, push, abertura de PR remoto, merge ou deploy. O texto `PR.md` é um rascunho local. Publicação do resultado é uma ação separada; isso preserva a regra de Git da seção 47 de `AGENTS.md`.

## Duas tarefas em sequência (v0.2)

O primeiro teste da fila é somente de documentação. Veja todas as tarefas, caminhos e modelos em `orchestrator/queues/002-two-step-smoke.json` antes de executá-la:

```powershell
node orchestrator/runner.mjs queue-plan orchestrator/queues/002-two-step-smoke.json
node orchestrator/runner.mjs queue-run orchestrator/queues/002-two-step-smoke.json
```

`queue-plan` não usa IA. `queue-run` faz a primeira tarefa, valida e revisa. Se estiver `READY_FOR_REVIEW`, a segunda começa automaticamente em uma cópia nova do mesmo commit **com o patch completo aprovado da etapa anterior aplicado**. O arquivo herdado fica visível para o executor e é protegido contra alterações fora do escopo da segunda tarefa. A segunda etapa só permite editar seu próprio arquivo. O patch final contém as duas etapas. Nenhuma etapa avança se a anterior retornar `HUMAN_REQUIRED`, falhar no baseline, nos testes, na revisão, no transporte do patch ou violar o escopo.

A fila roda em uma pasta irmã `<repo>-autopilot/queue-<id>-<timestamp>/`, com `queue.json`, `report.json` e `changes.patch` cumulativo quando todas as etapas terminam bem. Os relatórios e logs detalhados de cada tarefa continuam em suas próprias pastas. A fila tem um lock exclusivo; uma execução avulsa é recusada enquanto ela estiver ativa. Para revisar, comece pelo `report.json` da fila e pelo `changes.patch`, depois abra os relatórios individuais. O limite de 2–3 tarefas e no máximo duas tentativas por tarefa é fixo nesta versão.

Se o subprocesso for interrompido após uma etapa aprovada, é possível recomeçar **somente a etapa interrompida** com `node orchestrator/runner.mjs queue-resume <caminho-do-report.json-da-fila>`. Esse comando lê a definição congelada em `queue.json`, confere as evidências da etapa anterior e reutiliza o patch aprovado numa cópia nova. Não reaproveita alterações parciais do agente interrompido. A retomada também aceita uma falha de autenticação `401 Unauthorized` comprovada no log da execução do Codex, após renovar o login; uma decisão `HUMAN_REQUIRED` explícita, falha de testes ou escopo não são retomadas automaticamente. Se a branch tiver avançado desde então, o clone da etapa retomada usa o commit original, que precisa ser ancestral do HEAD atual.

O exemplo usa **gpt-6-sol / raciocínio Baixo** em cada executor/revisor. Duas tarefas gastam mais limite do Codex que o smoke de uma etapa. Não inclua trabalho de produto na fila sem definir previamente o objetivo e os caminhos específicos de cada tarefa. O status final `READY_FOR_REVIEW` ainda requer revisão humana antes de publicar qualquer mudança.

## Resultados e acompanhamento

Cada execução fica na pasta irmã `<repo>-autopilot/<task-id>-<timestamp>/`:

- `work/`: código proposto, branch própria, sem remote;
- `task.json`: tarefa congelada;
- `baseline-*.log`, `attempt-*.log`, `setup-*.log`: validações/preparação;
- `executor-*.jsonl`, `reviewer-*.jsonl`: eventos e stderr;
- `executor-*.json`, `reviewer-*.json`: decisões estruturadas;
- `changes.patch`: diff de arquivos rastreados e novos;
- `report.json`: resultado e evidências;
- `PR.md`: rascunho de descrição para revisão humana.

Durante a execução, acompanhe os processos Codex no terminal/sistema. Os logs de cada subprocesso são gravados quando ele termina. `report.json` é gravado ao final. `Ctrl+C` cancela o subprocesso e encerra o ciclo, preservando a cópia de trabalho.

Estados:

| Estado | Significado |
| --- | --- |
| `DRY_RUN` | Plano validado; nenhuma IA executada |
| `READY_FOR_REVIEW` | Checks e revisão automática aprovados; você ainda revisa |
| `HUMAN_REQUIRED` | Falha, limite, bloqueio ou validação manual pendente |

`APPROVED` no JSON do agente não significa merge aprovado. Alterações Flutter sempre exigem validação manual. Player/gestos continuam exigindo Samsung físico primeiro, conforme `AGENTS.md`.

Se o processo for encerrado abruptamente, o lock pode permanecer. Leia `run.lock` ou `queue.lock`, confirme que o PID e seus subprocessos terminaram e só então remova esse arquivo específico. O runner nunca remove lock de outra execução por conta própria. A retomada usa uma cópia nova e só transporta o trabalho já aprovado.

## Formato da tarefa

Use `tasks/001-smoke.json` como referência. Cada JSON é uma autorização concreta: objetivo, arquivos permitidos, checks, modelo, raciocínio, limite e validação humana. Uma fila contém de duas a três tarefas inline com IDs distintos, na ordem aprovada. O runner aceita apenas arquivos/prefixos de `docs/`, `backend/src/`, `backend/test/`, `lib/` e `test/`. Prefixo de diretório deve terminar com `/`. Prefira nomes exatos de arquivos.

Schema/migrations, manifests/lockfiles, `.env`, chaves, `AGENTS.md`, `.git`, `.github`, `.codex` e o próprio orquestrador ficam fora do escopo editável. Uma tarefa backend exige checks backend. Uma tarefa Flutter exige checks Flutter e `requiresManualValidation: true`, o que para a fila até uma decisão humana.

| Grupo | Validações |
| --- | --- |
| `orchestrator` | Testes locais do runner, sem chamada de IA |
| `backend` | `pnpm --dir backend run typecheck`, `pnpm --dir backend test` |
| `flutter` | `flutter analyze`, `flutter test` |
| Todos | `git diff --check` |

Não coloque migrações, operações no banco, publicação, pagamentos ou decisões de autenticação na fila. Elas precisam de um escopo e fluxo próprios antes de ampliar esta versão.

## Limites de isolamento

O clone evita compartilhar working tree, índice, objetos Git por hardlink ou remotes com sua cópia principal. A conferência de escopo detecta violações **depois** da execução e impede a aprovação; ela não é uma barreira de escrita por arquivo. O sandbox do Codex continua sendo a barreira operacional. A leitura de `AGENTS.md`, proibição de serviços externos e regras de Git também entram no prompt, não constituem uma VM.

Use somente código/dependências confiáveis e revise seus servidores MCP e configuração do Codex. O runner preserva as regras e políticas locais do Codex; não usa flags de bypass. Para agentes sobre código não confiável, adote um ambiente separado sem credenciais de produção antes de ampliar a autonomia.

## Validação desta entrega

Testes automatizados locais cobrem aprovação, feedback/correção, limite de tentativas, working tree sujo, falha de baseline, lock, escopo, inclusão de novos arquivos no patch, resposta inválida, mudanças durante revisão, validação manual, filtragem de ambiente, quoting Windows, timeout, transporte do patch entre etapas, parada, preservação do escopo herdado, retomada após interrupção com a branch atualizada e autenticação 401 comprovada sem liberar outras falhas.

O fluxo dos agentes nos testes automatizados é simulado. O smoke de **uma tarefa** da v0.1 foi executado com Codex autenticado no Windows: baseline e checks passaram, uma tentativa, revisão APPROVED, resultado READY_FOR_REVIEW. A fila v0.2 ainda precisa do teste autenticado no Windows. Backend, Flutter e Android não foram executados para esta mudança isolada no orquestrador.

Documentação oficial consultada:

- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/codex-sdk
