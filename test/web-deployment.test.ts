import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssetManifest, resourceUrl } from '../src/web/deployment.ts';
import type { AssetManifest } from '../src/web/assets.ts';

test('根目录、子路径和独立 OSS 前缀均正确解析资源，不改写外部 URL', () => {
  assert.equal(resourceUrl('/assets/manifest.json', '/'), '/assets/manifest.json');
  assert.equal(resourceUrl('/api/web-games', '/sanguoce/'), '/sanguoce/api/web-games');
  assert.equal(resourceUrl('/assets/cards/sha.png', 'https://cdn.example/sanguoce/r1/'),
    'https://cdn.example/sanguoce/r1/assets/cards/sha.png');
  assert.equal(resourceUrl('https://other.example/card.png', '/sanguoce/'), 'https://other.example/card.png');
  assert.equal(resourceUrl('data:image/png;base64,x', '/sanguoce/'), 'data:image/png;base64,x');
});

test('资源清单中的图片、双性别语音和技能数组使用同一 CDN，元数据保持不变', () => {
  const manifest: AssetManifest = {
    background: '/assets/background.png', cards: { sha: '/assets/cards/sha.png' },
    generals: { 'standard.caocao': '/assets/generals/caocao.png' },
    cardAudio: { sha: { male: '/assets/audio/sha-male.mp3', female: '/assets/audio/sha-female.mp3' } },
    generalAudio: { 'standard.caocao': { skills: { jianxiong: ['/assets/audio/jianxiong.mp3'] },
      aliases: { skill: 'jianxiong' }, selection: '/assets/audio/entrance.mp3' } }, systemAudio: {},
  };
  const result = resolveAssetManifest(manifest, 'https://cdn.example/r1/');
  assert.equal(result.cards.sha, 'https://cdn.example/r1/assets/cards/sha.png');
  assert.equal(result.cardAudio.sha.female, 'https://cdn.example/r1/assets/audio/sha-female.mp3');
  assert.equal(result.generalAudio['standard.caocao'].skills.jianxiong[0], 'https://cdn.example/r1/assets/audio/jianxiong.mp3');
  assert.equal(result.generalAudio['standard.caocao'].aliases.skill, 'jianxiong');
  assert.equal(manifest.cards.sha, '/assets/cards/sha.png');
});
