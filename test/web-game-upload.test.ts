import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveWebGame } from '../src/web/web-game-upload.ts';

async function submit(game: object, directory: string) {
  const request = Object.assign(Readable.from([Buffer.from(JSON.stringify(game))]),
    { method: 'POST', headers: { 'content-type': 'application/json' } }) as IncomingMessage;
  const reply = { status: 0, body: '',
    writeHead(status: number) { this.status = status; return this; },
    end(body = '') { this.body = body; return this; },
  };
  await saveWebGame(request, reply as unknown as ServerResponse, directory);
  return reply;
}

test('终局轨迹上传后落盘，未结束对局拒绝保存', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sanguosha-web-'));
  try {
    const game = { format: 'sanguosha.web-game.v1', humanSeat: 0,
      config: { seed: 7 }, choices: [], events: [], players: [], outcome: { status: 'draw', reason: 'test' } };
    const response = await submit(game, directory);
    assert.equal(response.status, 201);
    const { id } = JSON.parse(response.body) as { id: string };
    assert.deepEqual(JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8')), game);
    const invalid = await submit({ ...game, outcome: { status: 'ongoing' } }, directory);
    assert.equal(invalid.status, 400);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
