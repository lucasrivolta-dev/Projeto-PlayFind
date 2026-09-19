# Validação da rodada — 18/09/2026

Amostras lidas do banco configurado no backend local, usando GameService.getFeedGames, o mesmo serviço da rota /feed. Sem alterar preferências de contas ou dados do catálogo. Não representa deploy do backend público. Compatibilidade conforme metadata persistida, sem auditoria externa de cada lançamento.

| Preferência | Total | Compatíveis | Fora | Percentual |
|---|---:|---:|---:|---:|
| PlayStation | 20 | 20 | 0 | 100% |
| PlayStation + Steam | 20 | 20 | 0 | 100% |

Antes: 20/20 nos dois cenários. Depois: 20/20 nos dois cenários. Peso mantido em +15, aplicado uma vez por união das preferências. Substituído matching por substring por aliases exatos de famílias canônicas; Steam exige steamAppId ou oferta disponível. Com Steam, Slay the Spire II, Hrot e Fear & Hunger 2: Termina passam a entrar na amostra, evidenciando a correção. PC sem evidência Steam não conta como Steam.

O ranking não ganhou filtro por plataforma. Teste de serviço cobre bônus único +15 e manutenção de candidato Switch fora das preferências. Uma primeira amostra 100% compatível não garante proporção futura; nenhum percentual mínimo de exploração foi imposto.

## PlayStation

| Jogo | ID | Plataformas | Steam app ID |
|---|---|---|---|
| Kingdom Come: Deliverance II | c11fb69a-a61c-4c08-b5bd-522ae4a6dfce | Xbox, Switch, PC, PlayStation | 1771300 |
| Mewgenics | 3e2f4970-2b46-4019-8915-980f7ce2a43e | Xbox, Switch, PC, PlayStation | 686060 |
| Broken Sword: Shadow of the Templars Reforged | dd66a13c-3565-4e07-9b86-7f84ec37b443 | Xbox, PlayStation, PC, Switch, Mobile | 2544110 |
| Shinobi: Art of Vengeance | a78e28ad-cb4e-4461-a89f-cf8a07cb7519 | Xbox, PlayStation, Switch, PC | 2361770 |
| Black Myth: Wukong | 734032f4-2064-4e3b-b743-3c9b768c7f1a | Xbox, PC, PlayStation | 2358720 |
| Hades II | ac6b684b-5850-4f70-92e7-36350c8b3b0e | Xbox, Switch, PC, PlayStation | 1145350 |
| Metal Gear Solid Delta: Snake Eater | 04808b0b-01d2-4e7b-8e82-9ecca372c5a1 | Xbox, PC, PlayStation | 2417610 |
| Indiana Jones and the Great Circle | 5baf80a6-f6d9-4136-872a-917b2bed7880 | Xbox, Switch, PC, PlayStation | 2677660 |
| Gothic 1 Remake | b4177c56-565d-4c75-a664-c673f3fc471f | Xbox, PC, PlayStation | 1297900 |
| Pragmata | 694b34b5-b27a-4d1a-b7fa-107a553f7347 | Xbox, Switch, PC, PlayStation | 3357650 |
| Balatro | 0a3e180d-bd4d-467e-ad06-fe78f29e6dca | PC, Switch, PlayStation, Xbox, Mobile | 2379780 |
| Ghost of Yotei | b2e570bb-c4c1-43ea-b6d3-448043a74d9d | PlayStation |  |
| Beast of Reincarnation | 90f28203-93c9-4d79-a148-5ea53bf91aa7 | Xbox, PC, PlayStation | 2001760 |
| Nine Sols | d570bcf3-e77d-40a8-b7f2-0a7d897650e0 | Xbox, PlayStation, PC, Switch | 1809540 |
| The Last of Us Part II Remastered | 43bafeb4-714b-4689-8c94-d61e99e4d3c2 | PC, PlayStation | 2531310 |
| Baldur's Gate III | 47ba1d1b-1d4b-472e-9799-3ebe85a7a8d7 | Other, Xbox, PC, PlayStation | 1086940 |
| Persona 3 Reload | 96118aee-8af5-480d-8261-02632bad01a5 | Xbox, PlayStation, Switch, PC | 2161700 |
| The Case of the Golden Idol | ecdf24dd-87b6-409a-ae18-962b0935ab1d | Xbox, PlayStation, Mobile, PC, Switch | 1677770 |
| Figment 2: Creed Valley | 94b4fd28-50a8-493b-805c-44716bd6c7b0 | Xbox, PlayStation, Mobile, PC, Switch | 1085220 |
| Elden Ring | 9753b487-48aa-4840-94d9-bed336d847e3 | Xbox, PlayStation, Switch, PC | 1245620 |

## PlayStation + Steam

| Jogo | ID | Plataformas | Steam app ID |
|---|---|---|---|
| Kingdom Come: Deliverance II | c11fb69a-a61c-4c08-b5bd-522ae4a6dfce | Xbox, Switch, PC, PlayStation | 1771300 |
| Mewgenics | 3e2f4970-2b46-4019-8915-980f7ce2a43e | Xbox, Switch, PC, PlayStation | 686060 |
| Broken Sword: Shadow of the Templars Reforged | dd66a13c-3565-4e07-9b86-7f84ec37b443 | Xbox, PlayStation, PC, Switch, Mobile | 2544110 |
| Shinobi: Art of Vengeance | a78e28ad-cb4e-4461-a89f-cf8a07cb7519 | Xbox, PlayStation, Switch, PC | 2361770 |
| Black Myth: Wukong | 734032f4-2064-4e3b-b743-3c9b768c7f1a | Xbox, PC, PlayStation | 2358720 |
| Hades II | ac6b684b-5850-4f70-92e7-36350c8b3b0e | Xbox, Switch, PC, PlayStation | 1145350 |
| Metal Gear Solid Delta: Snake Eater | 04808b0b-01d2-4e7b-8e82-9ecca372c5a1 | Xbox, PC, PlayStation | 2417610 |
| Indiana Jones and the Great Circle | 5baf80a6-f6d9-4136-872a-917b2bed7880 | Xbox, Switch, PC, PlayStation | 2677660 |
| Gothic 1 Remake | b4177c56-565d-4c75-a664-c673f3fc471f | Xbox, PC, PlayStation | 1297900 |
| Pragmata | 694b34b5-b27a-4d1a-b7fa-107a553f7347 | Xbox, Switch, PC, PlayStation | 3357650 |
| Balatro | 0a3e180d-bd4d-467e-ad06-fe78f29e6dca | PC, Switch, PlayStation, Xbox, Mobile | 2379780 |
| Ghost of Yotei | b2e570bb-c4c1-43ea-b6d3-448043a74d9d | PlayStation |  |
| Beast of Reincarnation | 90f28203-93c9-4d79-a148-5ea53bf91aa7 | Xbox, PC, PlayStation | 2001760 |
| The Last of Us Part II Remastered | 43bafeb4-714b-4689-8c94-d61e99e4d3c2 | PC, PlayStation | 2531310 |
| Slay the Spire II | b8cd9b96-9fa8-49e8-a01a-473c2af6b1c7 | PC | 2868840 |
| Persona 3 Reload | 96118aee-8af5-480d-8261-02632bad01a5 | Xbox, PlayStation, Switch, PC | 2161700 |
| Nine Sols | d570bcf3-e77d-40a8-b7f2-0a7d897650e0 | Xbox, PlayStation, PC, Switch | 1809540 |
| Baldur's Gate III | 47ba1d1b-1d4b-472e-9799-3ebe85a7a8d7 | Other, Xbox, PC, PlayStation | 1086940 |
| Hrot | 90348701-b526-4bbc-a7ef-22389a3004c2 | PC | 824600 |
| Fear & Hunger 2: Termina | 3503f75e-1078-4d6f-9ee7-33ebf3f8492b | PC | 2171440 |

## Samsung SM-G780G / RQ8T209FPFE

APK debug instalado preservando dados. Abrir loja de Kingdom Come: Deliverance II iniciou ACTION_VIEW de https://store.steampowered.com/app/1771300/ no aplicativo Steam (com.valvesoftware.android.steam.community). Voltar saiu da navegação interna Steam e retornou aos detalhes na mesma rolagem; voltar dos detalhes manteve Kingdom Come no segundo card. Curtir e Já joguei, já persistidos e reidratados ao abrir o APK, continuaram ativos; Quero jogar continuou inativo. Não foi criada nova interação para esta validação. Controle de pausa pequeno no canto inferior direito, sem botão customizado central.

Sem URLs reais, os botões de PS Store, Xbox e Nintendo não apareceram. URLs HTTP(S) da oferta são usadas sem reconstrução por UUID; links de busca não são tratados como produto. Falha de abertura exibe mensagem.

## Providers

- Steam: ATIVA COM DADOS REAIS, snapshots do catálogo.
- PlayStation: pendente de PLATPRICES_API_KEY; ressalva da auditoria: o código atual de PlatPricesPriceProvider apenas gera URL de busca, não chama a API. Portanto não é possível confirmar “integração pronta, falta apenas a chave”. Integração real e validação também pendentes. Nenhum provider/preço fictício foi criado.
- Xbox: SEM PROVIDER ATIVO.
- Nintendo: SEM PROVIDER ATIVO.

## Verificações

- flutter analyze: sem problemas.
- flutter test: 158 testes passaram.
- backend test: 93 testes passaram, incluindo os três testes novos de preferência.
- backend typecheck: passou.
- git diff --check: passou após remover somente uma linha vazia extra preexistente no final de feed_screen.dart.
- Nenhuma refatoração de LibraryStore, autenticação, persistência, lifecycle, WebView/controller ou visual guard nesta rodada.
- Sem commit, push ou deploy.
