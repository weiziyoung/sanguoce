import test from 'node:test';
import assert from 'node:assert/strict';
import configure from '../vite.config.ts';

test('生产配置只用于生产构建，开发与预览始终使用本地资源和独立预览产物', () => {
  const priorPath = process.env.SANGUOCE_BASE_PATH;
  const priorAssets = process.env.SANGUOCE_ASSET_BASE_URL;
  process.env.SANGUOCE_BASE_PATH = '/sanguoce/';
  process.env.SANGUOCE_ASSET_BASE_URL = 'https://cdn.example/sanguoce/r1/';
  try {
    assert.equal(typeof configure, 'function');
    if (typeof configure !== 'function') throw new Error('Expected Vite config factory');
    const production = configure({ mode: 'production', command: 'build' });
    assert.equal(production.base, 'https://cdn.example/sanguoce/r1/');
    assert.equal(production.define?.['import.meta.env.VITE_APP_BASE_PATH'], '"/sanguoce/"');
    assert.equal(production.build?.outDir, 'dist');
    for (const config of [
      configure({ mode: 'development', command: 'serve' }),
      configure({ mode: 'production', command: 'serve' }),
      configure({ mode: 'preview', command: 'build' }),
      configure({ mode: 'preview', command: 'serve', isPreview: true }),
      configure({ mode: 'production', command: 'serve', isPreview: true }),
    ]) {
      assert.equal(config.base, '/');
      assert.equal(config.define?.['import.meta.env.VITE_APP_BASE_PATH'], '"/"');
    }
    assert.equal(configure({ mode: 'preview', command: 'build' }).build?.outDir, 'dist-preview');
    assert.equal(configure({ mode: 'production', command: 'serve', isPreview: true }).build?.outDir, 'dist-preview');
  } finally {
    if (priorPath === undefined) delete process.env.SANGUOCE_BASE_PATH;
    else process.env.SANGUOCE_BASE_PATH = priorPath;
    if (priorAssets === undefined) delete process.env.SANGUOCE_ASSET_BASE_URL;
    else process.env.SANGUOCE_ASSET_BASE_URL = priorAssets;
  }
});
