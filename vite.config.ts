import { defineConfig, loadEnv, type ViteDevServer, type PreviewServer } from 'vite';
import { forwardJev } from './src/web/jev-proxy.ts';
import { PlayerService } from './src/web/player-service.ts';
import { resolve } from 'node:path';

export default defineConfig(({ mode, command, isPreview }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const production = command === 'build' && mode === 'production' && !isPreview;
  const path = production ? env.SANGUOCE_BASE_PATH ?? '/' : '/';
  if (!path.startsWith('/') || path.includes('?') || path.includes('#'))
    throw new Error('SANGUOCE_BASE_PATH must be an absolute URL path');
  const appBase = path.endsWith('/') ? path : `${path}/`;
  const traceDirectory = resolve(env.SANGUOCE_TRACE_DIR ?? 'traces/web');
  function installPlayers(server: ViteDevServer | PreviewServer) {
    let players: PlayerService | undefined;
    server.httpServer?.once('close', () => players?.close());
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (!pathname.startsWith('/api/player/') && pathname !== '/api/web-games') { next(); return; }
      players ??= new PlayerService({ traceDirectory,
        basePath: appBase, authApiUrl: env.SANGUOCE_AUTH_API_URL });
      void players.handle(request, response, pathname).catch(next);
    });
  }
  return {
  base: production && env.SANGUOCE_ASSET_BASE_URL || appBase,
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', `${traceDirectory}/**`, '**/players.sqlite*'] } },
  build: { outDir: mode === 'preview' || isPreview ? 'dist-preview' : 'dist' },
  define: { 'import.meta.env.VITE_APP_BASE_PATH': JSON.stringify(appBase) },
  plugins: [{
    name: 'web-game-upload',
    configureServer(server) {
      installPlayers(server);
      server.middlewares.use(`${appBase}api/ai/jev`, (request, response) => { void forwardJev(request, response); });
    },
    configurePreviewServer(server) {
      installPlayers(server);
      server.middlewares.use(`${appBase}api/ai/jev`, (request, response) => { void forwardJev(request, response); });
    },
  }],
  };
});
