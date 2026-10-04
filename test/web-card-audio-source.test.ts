import test from 'node:test';
import assert from 'node:assert/strict';
import { cardAudioSource } from '../scripts/card-audio-source.ts';

const edition = '/素材/三国杀配音/卡牌配音/音乐/旧互通版/装备牌/武器牌/身份局';
const mislabeled = [`${edition}/麒麟弓/男.mp3`, `${edition}/麒麟弓/女.mp3`];

test('旧互通版麒麟弓的男女素材文件名标反，生成时纠正录音归属', () => {
  assert.equal(cardAudioSource('麒麟弓', 'male', mislabeled), `${edition}/麒麟弓/女.mp3`);
  assert.equal(cardAudioSource('麒麟弓', 'female', mislabeled), `${edition}/麒麟弓/男.mp3`);
});

test('麒麟弓的其他版本保持性别映射和既有素材优先级', () => {
  const correct = ['/素材/音乐/手杀/麒麟弓/男.mp3', '/素材/音乐/手杀/麒麟弓/女.mp3'];
  const candidates = [...correct, ...mislabeled];
  assert.equal(cardAudioSource('麒麟弓', 'male', candidates), correct[0]);
  assert.equal(cardAudioSource('麒麟弓', 'female', candidates), correct[1]);
});

test('其余标准武器按原性别文件映射，单一录音仍可回退', () => {
  for (const label of ['诸葛连弩', '雌雄双股剑', '青釭剑', '青龙偃月刀', '丈八蛇矛', '贯石斧', '方天画戟', '寒冰剑']) {
    const candidates = [`${edition}/${label}/男.mp3`, `${edition}/${label}/女.mp3`];
    assert.equal(cardAudioSource(label, 'male', candidates), candidates[0]);
    assert.equal(cardAudioSource(label, 'female', candidates), candidates[1]);
  }
  const effect = '/素材/三国杀配音/卡牌配音/音效/武器牌/麒麟弓.mp3';
  assert.equal(cardAudioSource('麒麟弓', 'male', [effect]), effect);
  assert.equal(cardAudioSource('麒麟弓', 'female', [effect]), effect);
  assert.equal(cardAudioSource('麒麟弓', 'male', []), undefined);
});
