import test from 'node:test';
import assert from 'node:assert/strict';
import { standardContent } from '../src/content/standard/content.ts';
import { standardGeneralDefinitions } from '../src/content/standard/generals.ts';
import { selectionDetails, selectionVoice } from '../src/web/selection-preview.ts';
import type { AssetManifest } from '../src/web/assets.ts';

test('25名候选武将均显示全部技能的完整说明，保留英姿和连营的自动发动描述', () => {
  for (const general of standardGeneralDefinitions) {
    const details = selectionDetails(general.id, true);
    assert.ok(details.title.includes(general.label));
    assert.equal(details.skills.length, general.abilities.length);
    for (const [index, skill] of details.skills.entries()) {
      assert.ok(skill.title.includes(standardContent.requireSkill(general.abilities[index]).label!));
      assert.ok(skill.body.length > 8 && !skill.body.includes('暂缺'));
    }
  }
  assert.ok(selectionDetails('standard.zhouyu', false).skills[0].body.includes('自动'));
  assert.ok(selectionDetails('standard.luxun', false).skills[1].body.includes('自动'));
});

test('主公技能显示完整效果，同时标明当前模式或身份下是否可用', () => {
  const duel = selectionDetails('standard.liubei', false);
  assert.equal(duel.skills.find(skill => skill.title.includes('激将'))?.unavailable, true);
  assert.equal(duel.skills.find(skill => skill.title.includes('仁德'))?.unavailable, false);
  assert.equal(selectionDetails('standard.liubei', true).skills.find(skill => skill.title.includes('激将'))?.unavailable, false);
});

test('选将优先播放该武将登场语音，无登场素材时用该武将技能语音，不播放阵亡语音', () => {
  const manifest: AssetManifest = { cards: {}, generals: {}, systemAudio: {}, cardAudio: {},
    generalAudio: { 'standard.liubei': { selection: '/liubei-entrance.mp3',
      skills: { rende: ['/rende.mp3'] }, aliases: {}, death: '/liubei-death.mp3' },
    'standard.zhouyu': { skills: { yingzi: ['/yingzi.mp3'] }, aliases: {} },
    'standard.luxun': { skills: {}, aliases: {}, death: '/luxun-death.mp3' } } };
  assert.equal(selectionVoice('standard.liubei', manifest), '/liubei-entrance.mp3');
  assert.equal(selectionVoice('standard.zhouyu', manifest), '/yingzi.mp3');
  assert.equal(selectionVoice('standard.luxun', manifest), undefined);
  assert.equal(selectionVoice('standard.caocao', manifest), undefined);
});
