import { defineConfig } from 'vite';
import { saveWebGame } from './src/web/web-game-upload.ts';

export default defineConfig({
  plugins: [{
    name: 'web-game-upload',
    configureServer(server) {
      server.middlewares.use('/api/web-games', (request, response) => { void saveWebGame(request, response); });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/web-games', (request, response) => { void saveWebGame(request, response); });
    },
  }],
});
