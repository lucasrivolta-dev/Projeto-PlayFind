import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../build/web');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.css': 'text/css', '.svg': 'image/svg+xml',
};
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': types[path.extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  } catch {
    response.writeHead(404).end('Arquivo não encontrado. Gere a versão web antes de abrir.');
  }
}).listen(8765, '127.0.0.1', () => console.log('NextPlay: http://127.0.0.1:8765'));
