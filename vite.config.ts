import { defineConfig, loadEnv } from 'vite';
import { saveWebGame } from './src/web/web-game-upload.ts';
import { forwardJev } from './src/web/jev-proxy.ts';

export default defineConfig(({ mode, command, isPreview }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const production = command === 'build' && mode === 'production' && !isPreview;
  const path = production ? env.SANGUOCE_BASE_PATH ?? '/' : '/';
  if (!path.startsWith('/') || path.includes('?') || path.includes('#'))
    throw new Error('SANGUOCE_BASE_PATH must be an absolute URL path');
  const appBase = path.endsWith('/') ? path : `${path}/`;
  return {
  base: production && env.SANGUOCE_ASSET_BASE_URL || appBase,
  build: { outDir: mode === 'preview' || isPreview ? 'dist-preview' : 'dist' },
  define: { 'import.meta.env.VITE_APP_BASE_PATH': JSON.stringify(appBase) },
  plugins: [{
    name: 'web-game-upload',
    configureServer(server) {
      server.middlewares.use(`${appBase}api/ai/jev`, (request, response) => { void forwardJev(request, response); });
      server.middlewares.use(`${appBase}api/web-games`, (request, response) => { void saveWebGame(request, response); });
    },
    configurePreviewServer(server) {
      server.middlewares.use(`${appBase}api/ai/jev`, (request, response) => { void forwardJev(request, response); });
      server.middlewares.use(`${appBase}api/web-games`, (request, response) => { void saveWebGame(request, response); });
    },
  }],
  };
});
