import 'dotenv/config';
import { IgdbClient } from '../modules/integrations/igdb/igdb.client.js';
import { mapIgdbGame } from '../modules/integrations/igdb/igdb.mapper.js';
import type { IgdbGameDto } from '../modules/integrations/igdb/igdb.types.js';
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} não configurada. Copie .env.example para .env e preencha as credenciais localmente.`); return value; };
const query = process.env.IGDB_SYNC_QUERY ?? 'fields name,slug,summary; where version_parent = null; limit 50;';
const client = new IgdbClient(required('IGDB_CLIENT_ID'), required('IGDB_CLIENT_SECRET'));
const games = (await client.search(query)).map((game) => mapIgdbGame(game as IgdbGameDto));
console.log(`IGDB: ${games.length} jogos normalizados. O repositório Prisma será conectado na próxima etapa.`);
