import { defineConfig, loadEnv } from 'vite';
import { saveWebGame } from './src/web/web-game-upload.ts';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const path = env.SANGUOCE_BASE_PATH ?? '/';
  if (!path.startsWith('/') || path.includes('?') || path.includes('#'))
    throw new Error('SANGUOCE_BASE_PATH must be an absolute URL path');
  const appBase = path.endsWith('/') ? path : `${path}/`;
  return {
  base: env.SANGUOCE_ASSET_BASE_URL || appBase,
  define: { 'import.meta.env.VITE_APP_BASE_PATH': JSON.stringify(appBase) },
  plugins: [{
    name: 'web-game-upload',
    configureServer(server) {
      server.middlewares.use(`${appBase}api/web-games`, (request, response) => { void saveWebGame(request, response); });
    },
    configurePreviewServer(server) {
      server.middlewares.use(`${appBase}api/web-games`, (request, response) => { void saveWebGame(request, response); });
    },
  }],
  };
});
