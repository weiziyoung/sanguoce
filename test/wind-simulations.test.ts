import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { windGeneralDefinitions } from '../src/content/wind/content.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { settlementSummary } from '../src/web/settlement.ts';

for (const cards of ['standard', 'junzheng'] as const) {
  test(`七名风将均可完成规则AI对决，结算识别武将名（${cards}）`, { timeout: 120000 }, () => {
    const policy = new StrategicPolicy(undefined, contentForCards(cards, ['wind']).deck);
    for (const general of windGeneralDefinitions) {
      const game = GameEngine.standard({ seed: 7, cards, generalPacks: ['wind'], players: [
        { label: general.label, sex: general.sex, general: general.id },
        { label: '孙权', sex: 'male', general: 'standard.sunquan' },
      ] });
      let decisions = 0;
      while (!game.finished && decisions < 2000) {
        const d = game.getDecision(); assert.ok(d);
        game.choose(policy.choose(game.getObservation(d.actor), d)); decisions++;
      }
      assert.equal(game.finished, true, `${general.label}, ${decisions}次决策`);
      assert.equal(settlementSummary(game.getObservation(0)).rows[0].general, general.label);
    }
  });
  for (const count of [5, 8]) test(`${count}人风包混合身份局规则AI完成至阵营胜负（${cards}）`, { timeout: 180000 }, () => {
    const generals = ['wind.zhangjiao', 'wind.xiaoqiao', 'wind.weiyan', 'wind.zhoutai', 'wind.huangzhong',
      'wind.caoren', 'wind.xiahouyuan', 'standard.sunquan'].slice(0, count);
    const roles = count === 5 ? ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] :
      ['lord', 'loyalist', 'rebel', 'rebel', 'renegade', 'loyalist', 'rebel', 'rebel'];
    const game = GameEngine.standard({ seed: 7, cards, generalPacks: ['wind'], mode: 'identity', roles,
      players: generals.map(general => ({ label: general, general, sex: 'male' })) });
    const policy = new StrategicPolicy(undefined, contentForCards(cards, ['wind']).deck);
    let decisions = 0;
    while (!game.finished && decisions < 3000) {
      const d = game.getDecision(); assert.ok(d);
      game.choose(policy.choose(game.getObservation(d.actor), d)); decisions++;
    }
    assert.equal(game.finished, true, `${count}人${cards}在${decisions}次决策后尚未结束`);
    assert.equal(game.getObservation(0).outcome.status, 'finished');
  });
}
