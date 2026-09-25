# NextPlay Autopilot v0.1

Executa **uma tarefa aprovada**, valida, pede revisão em outro contexto Codex e devolve um patch para revisão humana. Node.js 22+; nenhuma dependência npm para o orquestrador. Não confundir com a manutenção de catálogo em `backend/src/modules/sync/`.

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

Não há fila contínua, retomada automática, integração Antigravity, commit, push, abertura de PR remoto, merge ou deploy. O texto `PR.md` é um rascunho local. Publicação do resultado é uma ação separada; isso preserva a regra de Git da seção 47 de `AGENTS.md`.

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

Se o processo for encerrado abruptamente, o lock pode permanecer. Leia `run.lock`, confirme que o PID e seus subprocessos terminaram e só então remova esse arquivo específico. O runner nunca remove lock de outra execução por conta própria. Uma nova execução usa uma cópia nova; não retoma trabalho parcialmente concluído.

## Formato da tarefa

Use `tasks/001-smoke.json` como referência. Cada JSON é uma autorização concreta: objetivo, arquivos permitidos, checks, modelo, raciocínio, limite e validação humana. O runner aceita apenas arquivos/prefixos de `docs/`, `backend/src/`, `backend/test/`, `lib/` e `test/`. Prefixo de diretório deve terminar com `/`. Prefira nomes exatos de arquivos.

Schema/migrations, manifests/lockfiles, `.env`, chaves, `AGENTS.md`, `.git`, `.github`, `.codex` e o próprio orquestrador ficam fora do escopo editável da v0.1. Uma tarefa backend exige checks backend. Uma tarefa Flutter exige checks Flutter e `requiresManualValidation: true`.

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

Testes automatizados locais cobrem aprovação, feedback/correção, limite de tentativas, working tree sujo, falha de baseline, lock, escopo, inclusão de novos arquivos no patch, resposta inválida, mudanças durante revisão, validação manual, filtragem de ambiente, quoting Windows e timeout.

O fluxo dos agentes nesses testes é simulado. A execução autenticada com Codex e os subprocessos nativos do Windows precisam do smoke test no computador do usuário. Backend, Flutter e Android não foram executados para esta mudança isolada no orquestrador.

Documentação oficial consultada:

- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/codex-sdk
