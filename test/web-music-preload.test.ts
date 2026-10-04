import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadedMusic } from '../src/web/music-preload.ts';

test('音乐进度按下载字节更新，读完全部响应才提供可播放的本地文件', async t => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { stream = controller; },
  }), { headers: { 'content-length': '4', 'content-type': 'audio/mpeg' } }));
  const music = new DownloadedMusic();
  const progress: number[] = [];
  let complete = false;
  const download = music.prepare('https://assets.example/music.mp3', value => progress.push(value))
    .then(url => { complete = true; return url; });
  try {
    stream.enqueue(new Uint8Array([1, 2]));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(complete, false);
    assert.equal(progress.at(-1), 0.5);
    stream.enqueue(new Uint8Array([3, 4]));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(complete, false, '已收到标称字节数也要等待响应真正结束');
    assert.ok(progress.at(-1)! < 1);
    stream.close();
    const localUrl = await download;
    assert.ok(localUrl.startsWith('blob:'));
    assert.equal(progress.at(-1), 1);
    const cached = await originalFetch(localUrl);
    assert.equal(cached.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await cached.arrayBuffer())], [1, 2, 3, 4]);
    music.dispose();
    await assert.rejects(originalFetch(localUrl), /fetch failed/);
  } finally { music.dispose(); }
});

test('下载失败或空文件不会被报告成加载完成', async t => {
  const music = new DownloadedMusic();
  const progress: number[] = [];
  t.mock.method(globalThis, 'fetch', async () => new Response('missing', { status: 404 }));
  await assert.rejects(music.prepare('/missing.mp3', value => progress.push(value)), /HTTP 404/);
  assert.ok(!progress.includes(1));
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array()));
  await assert.rejects(music.prepare('/empty.mp3', value => progress.push(value)), /文件为空/);
  assert.ok(!progress.includes(1));
  music.dispose();
});

for (const reason of ['dispose', 'timeout'] as const) {
  test(`下载${reason === 'dispose' ? '主动停止' : '超时'}会中断网络并报告错误`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let signal!: AbortSignal;
    t.mock.method(globalThis, 'fetch', (_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });
    const music = new DownloadedMusic();
    const progress: number[] = [];
    const rejected = assert.rejects(music.prepare('/slow.mp3', value => progress.push(value)), /下载中断或超时/);
    if (reason === 'dispose') music.dispose();
    else t.mock.timers.tick(120_000);
    await rejected;
    assert.equal(signal.aborted, true);
    assert.ok(!progress.includes(1));
    music.dispose();
  });
}
