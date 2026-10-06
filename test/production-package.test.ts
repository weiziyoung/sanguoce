import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';

test('Docker 最小运行包可独立加载服务，健康页与 Jev 路由不依赖完整开发仓库', { timeout: 10_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sanguoce-package-'));
  const dockerfile = await readFile(new URL('../deploy/Dockerfile', import.meta.url), 'utf8');
  const allowed = (await readFile(new URL('../.dockerignore', import.meta.url), 'utf8')).split('\n');
  try {
    for (const line of dockerfile.split('\n').filter(line => line.startsWith('COPY '))) {
      const parts = line.slice(5).trim().split(/\s+/);
      const destination = parts.pop()!;
      for (const source of parts.filter(source => source.endsWith('.ts'))) {
        assert.ok(allowed.includes(`!${source}`), `${source} 被排除在 Docker 构建上下文之外`);
        const target = join(directory, destination, basename(source));
        await mkdir(dirname(target), { recursive: true });
        await copyFile(new URL(`../${source}`, import.meta.url), target);
      }
    }
    await mkdir(join(directory, 'dist'));
    await writeFile(join(directory, 'dist/index.html'), '<title>发布包测试</title>');
    const script = `import { createProductionServer } from './src/web/production-server.ts';
      const server = createProductionServer({ directory: 'dist', traceDirectory: 'traces' });
      server.listen(0, '127.0.0.1', () => console.log(server.address().port));
      process.on('SIGTERM', () => server.close());`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostic = '';
    child.stderr.on('data', chunk => { diagnostic += chunk; });
    const closed = once(child, 'close');
    try {
      const port = await new Promise<number>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(new Error(`发布包启动超时：${diagnostic}`)), 5000);
        child.stdout.on('data', chunk => {
          output += chunk;
          if (output.includes('\n')) { clearTimeout(timer); resolve(Number(output.trim())); }
        });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', () => { clearTimeout(timer); reject(new Error(`发布包提前退出：${diagnostic}`)); });
      });
      const base = `http://127.0.0.1:${port}`;
      assert.equal((await fetch(`${base}/healthz`)).status, 200);
      assert.equal((await fetch(base)).status, 200);
      assert.equal((await fetch(`${base}/api/ai/jev`)).status, 405);
      assert.equal((await fetch(`${base}/api/ai/jev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    } finally { if (child.exitCode === null) child.kill('SIGTERM'); await closed; }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
