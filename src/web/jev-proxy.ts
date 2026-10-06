import type { IncomingMessage, ServerResponse } from 'node:http';
import { JEV_ENDPOINT } from '../policies/model-endpoint.ts';

/** Fixed upstream only. Custom endpoints are called by the browser, never this server. */
export async function forwardJev(request: IncomingMessage, response: ServerResponse,
  fetcher: typeof fetch = fetch): Promise<void> {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }).end(); return; }
  if (!request.headers['content-type']?.startsWith('application/json')) { response.writeHead(415).end(); return; }
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4103 || !authorization.slice(7).trim()) {
    response.writeHead(401).end(); return;
  }
  const controller = new AbortController();
  const closed = () => { if (!response.writableEnded) controller.abort(); };
  response.on('close', closed);
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) { response.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { response.writeHead(400).end(); return; }
    const input = body as { model?: unknown; state?: unknown; questions?: unknown } | null;
    if (!input || typeof input.model !== 'string' || typeof input.state !== 'string'
      || !input.questions || typeof input.questions !== 'object' || Array.isArray(input.questions)) {
      response.writeHead(400).end(); return;
    }
    const upstream = await fetcher(JEV_ENDPOINT, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: input.model, state: input.state, questions: input.questions }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
    });
    if (!upstream.ok) { response.writeHead(upstream.status).end(); return; }
    const data = await upstream.json() as { answers?: unknown };
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ answers: data.answers }));
  } catch {
    if (!response.destroyed) response.writeHead(controller.signal.aborted ? 499 : 502).end();
  } finally { response.off('close', closed); }
}
