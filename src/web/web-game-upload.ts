import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { WebGameDocument } from '../app/web-game-record.ts';

const MAX_BYTES = 50 * 1024 * 1024;

export async function saveWebGame(request: IncomingMessage, response: ServerResponse,
  directory = resolve(process.cwd(), 'traces/web')): Promise<void> {
  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'POST' }).end();
    return;
  }
  if (!request.headers['content-type']?.startsWith('application/json')) {
    response.writeHead(415).end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const game = JSON.parse(Buffer.concat(chunks).toString('utf8')) as WebGameDocument;
    if (game.format !== 'sanguosha.web-game.v1' || !Array.isArray(game.choices) ||
      !Array.isArray(game.events) || !Array.isArray(game.players) ||
      typeof game.humanSeat !== 'number' || !game.config ||
      !game.outcome || game.outcome.status === 'ongoing') {
      response.writeHead(400).end();
      return;
    }
    const id = randomUUID();
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, `${id}.json`), JSON.stringify(game, null, 2) + '\n', { flag: 'wx' });
    response.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ id }));
  } catch {
    response.writeHead(400).end();
  }
}
