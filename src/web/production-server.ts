import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { saveWebGame } from './web-game-upload.ts';
import { forwardJev } from './jev-proxy.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

export interface ProductionServerOptions {
  directory: string;
  traceDirectory: string;
  origin?: string;
  jevFetcher?: typeof fetch;
}

export function createProductionServer(options: ProductionServerOptions) {
  const root = resolve(options.directory);
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  server.requestTimeout = 60_000;

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === '/api/web-games' || pathname === '/api/ai/jev') {
      response.setHeader('Cache-Control', 'no-store');
      if (options.origin && request.headers.origin && request.headers.origin !== options.origin) {
        response.writeHead(403).end(); return;
      }
      if (pathname === '/api/ai/jev') await forwardJev(request, response, options.jevFetcher);
      else await saveWebGame(request, response, options.traceDirectory);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    if (pathname === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : '{"status":"ok"}'); return;
    }
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(404).end(); return;
    }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) { response.writeHead(404).end(); return; }
    const extension = extname(file);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  }
  return server;
}
