# NextPlay Frontend

O frontend é um aplicativo Flutter/Dart mobile-first. Para manter a estrutura esperada pelo Flutter e preservar os comandos existentes, o projeto Flutter continua na raiz do repositório.

## Organização

* `lib/` — código de produção Flutter.
  * `design_system/` — tokens e componentes Obsidian Kinetic.
  * `features/` — módulos de Feed, Explorar, Detalhes, Biblioteca, Fórum, Perfil e Auth.
* `assets/` — fontes e recursos locais.
* `android/` — plataforma Android.
* `web/` — plataforma web e shell da prévia.
* `test/` — testes do frontend.
* `pubspec.yaml` — dependências e configuração Flutter.

## Limites

O frontend não acessa IGDB, Steam, PostgreSQL, Prisma ou Firebase Admin. Ele deve consumir apenas a API do NextPlay e usar Firebase Client SDK somente para autenticação quando essa integração for ativada.

Na raiz do projeto, use `.\flutter.ps1 analyze` e `.\flutter.ps1 test`. O diretório `backend/` possui comandos e dependências próprios.
