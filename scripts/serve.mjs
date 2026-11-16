import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.env.SERVE_DIR || 'dist');
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    const name = path === '/' ? '/index.html' : path;
    if (!/^\/(index\.html|app\.js|api\.js|config\.js|style\.css)$/.test(name)) {
      response.writeHead(404); response.end('Not found'); return;
    }
    const body = await readFile(resolve(root, '.' + name));
    response.writeHead(200, { 'Content-Type': types[name.split('.').at(-1)] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(500); response.end('Build the board before serving it.'); }
}).listen(Number(process.env.PORT || 4174), '127.0.0.1', () => console.log('Board static server ready'));
