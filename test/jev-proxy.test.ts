import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { createProductionServer } from '../src/web/production-server.ts';
import { JEV_ENDPOINT } from '../src/policies/model-endpoint.ts';

test('生产 Jev 路由只代理固定官方地址，用户密钥从请求头转发，不跟随重定向或暴露原始响应', async () => {
  let calls = 0;
  const server = createProductionServer({ directory: tmpdir(), traceDirectory: tmpdir(), origin: 'https://game.example',
    jevFetcher: (async (url, init) => {
      calls++;
      assert.equal(url, JEV_ENDPOINT);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer user-key');
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body).sort(), ['model', 'questions', 'state']);
      assert.equal(body.model, 'jev-latest');
      assert.equal(body.state, '公开局面');
      return Response.json({ answers: { 本步行动: { choice: '方案一' } }, debug: 'private-upstream-output' });
    }) as typeof fetch });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/jev`;
  const body = { model: 'jev-latest', state: '公开局面', questions: { 本步行动: { type: 'choice', criteria: { 方案一: '合法行动' } } },
    endpoint: 'http://127.0.0.1/private' };
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-key', Origin: 'https://game.example' },
    body: JSON.stringify(body) };
  try {
    const response = await fetch(base, init);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { answers: { 本步行动: { choice: '方案一' } } });
    assert.equal(calls, 1);
    assert.equal((await fetch(base)).status, 405);
    assert.equal((await fetch(base, { ...init, headers: { ...init.headers, Origin: 'https://unrelated.example' } })).status, 403);
    assert.equal((await fetch(base, { ...init, headers: { 'Content-Type': 'application/json' } })).status, 401);
    assert.equal((await fetch(base, { ...init, headers: { ...init.headers, 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await fetch(base, { ...init, body: '{}' })).status, 400);
    assert.equal((await fetch(base, { ...init, body: 'not-json' })).status, 400);
    assert.equal((await fetch(base, { ...init, body: 'x'.repeat(2 * 1024 * 1024 + 1) })).status, 413);
    assert.equal(calls, 1, '非法请求没有调用付费上游');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('Jev 上游认证失败原样返回状态，网络或解析错误返回 502，密钥不会写入错误响应', async () => {
  let result: Response | Error = new Response('user-key private-error-body', { status: 401 });
  const server = createProductionServer({ directory: tmpdir(), traceDirectory: tmpdir(), jevFetcher: (async () => {
    if (result instanceof Error) throw result;
    return result;
  }) as typeof fetch });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/jev`;
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-key' },
    body: JSON.stringify({ model: 'jev-latest', state: 'state', questions: {} }) };
  try {
    const unauthorized = await fetch(url, init);
    assert.equal(unauthorized.status, 401);
    assert.equal(await unauthorized.text(), '');
    result = new Error('user-key upstream exception');
    assert.equal((await fetch(url, init)).status, 502);
    result = new Response('invalid JSON');
    assert.equal((await fetch(url, init)).status, 502);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
