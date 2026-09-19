# Providers de preço — 19/09/2026

## Estado real

| Loja | Estado | Configuração |
|---|---|---|
| Steam | ATIVA COM DADOS REAIS | Sync Steam existente, preservado |
| PlayStation | INATIVA POR DECISÃO DE PRODUTO | Provider preservado para uso futuro |
| Nintendo | INATIVA POR DECISÃO DE PRODUTO | Provider preservado para uso futuro |
| Xbox | SEM PROVIDER ATIVO | PSPrices B2B: contrato, documentação do cliente e chave pendentes |

Clientes HTTP e persistência permanecem implementados e cobertos por testes, mas o comando de sync multi-store está desativado. **Não executar consumo autenticado nem persistir ofertas PlayStation/Nintendo enquanto esta decisão estiver vigente.**

`PSPRICES_API_KEY` é reservado e não ativa Xbox. O contrato `StorePriceProvider` permanece independente da fonte para um futuro adaptador B2B. Steam continua usando `sync:games`, seu cliente e snapshots existentes; `sync:prices` não chama o adaptador legado Steam que apenas descreve uma URL.

## API v2

- [PlatPrices](https://platprices.com/api/v2/docs): base `https://platprices.com/api/v2`; `GET /regions`, `GET /games/search?q=...&region=br&include_dlc=0`, `GET /games/by-psnid/{psnid}?region=br`.
- [NTPrices](https://ntprices.com/api/v2/docs): base `https://ntprices.com/api/v2`; `GET /regions`, `GET /games/search?q=...&region=br&include_dlc=0`, `GET /games/by-nsuid/{nsuid}?region=br`.

Autenticação: `X-API-Key`. Sem v1, scraping, demo em produção ou URL de busca persistida. Exemplos públicos de `/demo` foram consultados somente para confirmar campos; fixtures são sintéticas e restritas aos testes.

O sync verifica BR, permissão do plano e duas casas decimais em `/regions`. Só aceita objetos de BR; usa BRL para a região explicitamente validada e rejeita `PriceCurrency` incompatível. Não muda regiões da conta nem usa US/USD como fallback. O operador deve habilitar BR na chave/conta.

## Matching e segurança dos dados

- Reutiliza PSN ID/NSUID previamente verificado. São IDs da loja, não PPIDs do agregador.
- Sem ID, exige nome completo normalizado, publisher correspondente, edição e lançamento em até 366 dias. Datas ausentes ou desconhecidas não bastam. Ports posteriores e publishers com nomes diferentes podem exigir associação explícita por ID.
- Verifica flags PS4/PS5 e Switch/Switch 2. O token atual `Switch` é uma família; múltiplos produtos de gerações diferentes são ambíguos. Plataforma explícita Switch 2 exige `IsSwitch2`.
- Rejeita DLC/demo/add-on/bundle e Deluxe quando o catálogo pede Standard. Não escolhe primeiro resultado ou menor preço. Mesmo ID explícito continua sujeito a título, edição, tipo e plataforma.
- O schema não tem confidence/matchingReason; não foi criada migration. `skipped` informa ausência de correspondência, ambiguidade ou dados insuficientes.
- Persiste `BasePrice`, `SalePrice` e `DiscPerc` reais, em centavos. Não usa `PlusPrice`, dependente de assinatura, nem recalcula o preço final.
- Exige URL real recebida: PS Store `pt-br/product/{PSNID}` ou eShop `BR/{idioma}/titles/{NSUID}`. Produto removido gera indisponibilidade e preços nulos.
- Timeout 15s; redirects recusados. Em 401/403/429/5xx, interrompe aquele provider sem gravar oferta de erro. Em 429, informa `retryAfter` quando numérico, sem repetição automática de requisições.
- Logs não incluem headers, corpos de erro, chaves ou mensagens brutas de rede/banco.

## Sync inativo

`sync:prices` apenas informa que as integrações multi-store estão inativas. O código abaixo fica preservado no repositório para uma reativação futura explícita; não há comando operacional de PlayStation, Nintendo ou Xbox neste momento.

Não foi criado agendamento ou endpoint público. Nenhuma API externa é chamada durante renderização do feed.

## Histórico e consumo

Usa StoreOffer existente, sem migration. Advisory lock serializa cada jogo/loja/região. Compara com a observação mais recente: se igual, atualiza `observedAt`; se mudou preço, identidade, disponibilidade ou provider, cria snapshot. A → B → A preserva três mudanças. `observedAt` registra confirmação local, não um instante remoto que a API não forneceu.

A consulta do feed passa a ordenar ofertas por `observedAt desc`, como detalhes já fazia, para evitar snapshot antigo após sync. Sem mudança de scoring, UI, autenticação, LibraryStore ou player.

Fixtures cobrem preços, edição, ambiguidade, ID, geração, DLC, moeda/região/URL, sem chave e falhas 401/403/429/503/rede/JSON. Testes de sync cobrem provider relevante, dry-run, erro sem escrita e histórico no PostgreSQL isolado com rollback.

Resultado desta rodada: 164 testes backend e 158 Flutter passaram; `flutter analyze`, typecheck e `git diff --check` passaram. Comandos sem chave e Xbox executados com os estados esperados. Não foi necessária nova alteração ou instalação no Samsung; a validação física anterior foi preservada.

Uma futura reativação exige nova decisão explícita de produto, seguida por validação autenticada em dry-run e sync pequeno. Nenhum commit, push ou deploy nesta rodada.
