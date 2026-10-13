import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { contentForCards, GENERAL_PACKS } from '../src/app/game-content.ts';
import { mountainGeneralDefinitions } from '../src/content/mountain/content.ts';
for (const cards of ['standard', 'junzheng'] as const) {
  test(`山包八将对孙权的完整对决（${cards}）`, {timeout: 180000}, () => {
    const policy = new StrategicPolicy(undefined, contentForCards(cards, ['mountain']).deck);
    for (const g of mountainGeneralDefinitions) {
      const game = GameEngine.standard({seed: 7, cards, generalPacks: ['mountain'], players: [{label: g.label, general: g.id, sex: g.sex}, {label: '孙权', general: 'standard.sunquan', sex: 'male'}]});
      let n = 0; while (!game.finished && n++ < 3000) { const d = game.getDecision(); assert.ok(d); game.choose(policy.choose(game.getObservation(d.actor), d)); }
      assert.equal(game.finished, true, `${g.label}未结束：${n}次选择`);
    }
  });
  for (const count of [5, 8]) test(`${count}人风火林山混合身份局完整结束（${cards}）`, {timeout: 180000}, () => {
    const ids = ['mountain.sunce', 'mountain.liushan', 'mountain.zhanghe', 'mountain.zuoci', 'mountain.caiwenji', 'mountain.dengai', 'mountain.jiangwei', 'mountain.zhangzhaozhanghong'].slice(0, count);
    const roles = count === 5 ? ['lord','loyalist','rebel','rebel','renegade'] : ['lord','loyalist','rebel','rebel','renegade','loyalist','rebel','rebel'];
    const game = GameEngine.standard({seed: 7, cards, generalPacks: [...GENERAL_PACKS], mode: 'identity', roles, players: ids.map(general => ({label: general, general, sex: 'male'}))});
    const policy = new StrategicPolicy(undefined, contentForCards(cards, GENERAL_PACKS).deck);
    let n = 0; while (!game.finished && n++ < 5000) { const d = game.getDecision(); assert.ok(d); game.choose(policy.choose(game.getObservation(d.actor), d)); }
    assert.equal(game.finished, true, `${count}人${cards}未结束：${n}次选择`);
  });
}
