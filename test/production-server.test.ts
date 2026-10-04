import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createProductionServer } from '../src/web/production-server.ts';

test('生产服务提供入口和健康检查，轨迹私有保存，拒绝跨站提交和目录穿越', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sanguoce-server-'));
  const dist = join(directory, 'dist');
  const traces = join(directory, 'traces');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<title>三国策</title>');
  await writeFile(join(directory, 'private.json'), 'private');
  const server = createProductionServer({ directory: dist, traceDirectory: traces, origin: 'https://weiziyang.wiki' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    assert.match(await page.text(), /三国策/);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/%2e%2e%2fprivate.json`)).status, 404);
    assert.equal((await fetch(`${base}/traces/test.json`)).status, 404);
    const game = { format: 'sanguosha.web-game.v1', humanSeat: 0, config: { seed: 7 },
      choices: [], events: [], players: [], outcome: { status: 'draw', reason: 'test' } };
    const request = { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://weiziyang.wiki' }, body: JSON.stringify(game) };
    const saved = await fetch(`${base}/api/web-games`, request);
    assert.equal(saved.status, 201);
    const { id } = await saved.json() as { id: string };
    assert.deepEqual(JSON.parse(await readFile(join(traces, `${id}.json`), 'utf8')), game);
    assert.equal((await fetch(`${base}/api/web-games`, { ...request,
      headers: { ...request.headers, Origin: 'https://unrelated.example' } })).status, 403);
    assert.equal((await fetch(`${base}/api/web-games`)).status, 405);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
