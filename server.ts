import { resolve } from 'node:path';
import { createProductionServer } from './src/web/production-server.ts';

const port = Number(process.env.PORT ?? 8080);
const server = createProductionServer({
  directory: resolve(process.env.SANGUOCE_DIST_DIR ?? 'dist'),
  traceDirectory: resolve(process.env.SANGUOCE_TRACE_DIR ?? 'traces/web'),
  origin: process.env.SANGUOCE_ORIGIN,
  basePath: process.env.SANGUOCE_BASE_PATH,
  authApiUrl: process.env.SANGUOCE_AUTH_API_URL,
});
server.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  console.log(`sanguoce listening on port ${port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
