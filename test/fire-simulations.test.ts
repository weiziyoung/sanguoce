import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { fireGeneralDefinitions } from '../src/content/fire/content.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { settlementSummary } from '../src/web/settlement.ts';
for (const cards of ['standard', 'junzheng'] as const) {
  test(`八名火将AI对决合法运行至终局，结算武将名正确（${cards}）`, { timeout: 120000 }, () => {
    const policy = new StrategicPolicy(undefined, contentForCards(cards, ['wind', 'fire']).deck);
    for (const g of fireGeneralDefinitions) {
      const game = GameEngine.standard({ seed: 7, cards, generalPacks: ['wind', 'fire'], players: [
        { label: g.label, general: g.id, sex: g.sex }, { label: '孙权', general: 'standard.sunquan', sex: 'male' }] });
      let n = 0; while (!game.finished && n++ < 2500) { const d = game.getDecision(); assert.ok(d); game.choose(policy.choose(game.getObservation(d.actor), d)); }
      assert.equal(game.finished, true, `${g.label}, ${n}次决策`); assert.equal(settlementSummary(game.getObservation(0)).rows[0].general, g.label);
    }
  });
  for (const count of [5, 8]) test(`${count}人风火混合身份局完整结束（${cards}）`, { timeout: 180000 }, () => {
    const ids = ['fire.yuanshao', 'fire.xunyu', 'fire.taishici', 'fire.pangtong', 'wind.xiaoqiao', 'fire.wolong', 'fire.yanliangwenchou', 'wind.zhangjiao'].slice(0, count);
    const roles = count === 5 ? ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] : ['lord', 'loyalist', 'rebel', 'rebel', 'renegade', 'loyalist', 'rebel', 'rebel'];
    const game = GameEngine.standard({ seed: 7, cards, generalPacks: ['wind', 'fire'], mode: 'identity', roles,
      players: ids.map(general => ({ label: general, general, sex: 'male' })) });
    const policy = new StrategicPolicy(undefined, contentForCards(cards, ['wind', 'fire']).deck);
    let n = 0; while (!game.finished && n++ < 4000) { const d = game.getDecision(); assert.ok(d); game.choose(policy.choose(game.getObservation(d.actor), d)); }
    assert.equal(game.finished, true, `${count}人${cards}, ${n}次决策`);
  });
}
