import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, decision, observe } from '../engine.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { fixture } from './support/scenario-builder.ts';
import { unavailableSkillDetail } from '../src/web/skill-availability.ts';

function setup(count = 2, cards = 3) {
  const f = fixture(count, count === 5 ? { mode: 'identity' } : {});
  Object.assign(f.state.players[0], { general: 'standard.sunshangxiang', sex: 'female', hp: 1, maxHp: 3 });
  Object.assign(f.state.players[1], { general: 'standard.luxun', sex: 'male', hp: 3, maxHp: 3 });
  const ids = ['sha', 'shan', 'wanjian'].slice(0, cards).map(name => f.hand(0, name));
  const model = (state: typeof f.state) => new TableInteraction(decision(state)!);
  return { f, ids, model };
}

for (const count of [2, 5]) {
  test(`${count} 人结姻不能对满血男性发动，也不会进入没有合法目标的费用选择`, () => {
    const { f, model } = setup(count);
    const state = f.start();
    assert.ok(!model(state).leaves.some(choice => choice.ability === 'standard.jieyin'));
    assert.equal(decision(state)?.kind, 'play');
    assert.equal(observe(state, 0).self.handCount, 3);
    assert.equal(state.discard.length, 0);
    assert.equal(unavailableSkillDetail('standard.jieyin', observe(state, 0)), '没有受伤的男性目标');
  });
}

test('受伤女性和已死亡男性都不能成为结姻目标', () => {
  for (const attributes of [{ sex: 'female', hp: 1 }, { sex: 'male', hp: 0, alive: false }] as const) {
    const { f, model } = setup();
    Object.assign(f.state.players[1], attributes);
    assert.ok(!model(f.start()).leaves.some(choice => choice.ability === 'standard.jieyin'));
  }
});

test('结姻费用只能用两张手牌，装备不能弥补手牌不足', () => {
  const { f, model } = setup(2, 1);
  f.state.players[1].hp = 2;
  f.equip(0, 'bagua', 'armor');
  assert.ok(!model(f.start()).leaves.some(choice => choice.ability === 'standard.jieyin'));
  assert.equal(unavailableSkillDetail('standard.jieyin', observe(f.state, 0)), '需要至少两张手牌');
});

test('对决受伤男性可正常结姻，弃两张手牌回复双方且每回合只能一次', () => {
  for (const ownerHp of [1, 3]) {
    const { f, ids, model } = setup();
    f.state.players[0].hp = ownerHp;
    f.state.players[1].hp = 1;
    let state = f.start();
    const begin = model(state).leaves.find(choice => choice.ability === 'standard.jieyin')!;
    assert.ok(begin);
    state = apply(state, begin.id);
    for (const cid of ids.slice(0, 2)) {
      const choice = model(state).leaves.find(choice => choice.actionType === 'toggle' && choice.cardIds.includes(cid))!;
      state = apply(state, choice.id);
    }
    assert.equal(state.discard.length, 0, '确认前不支付费用');
    const confirm = model(state).leaves.find(choice => choice.actionType === 'confirm')!;
    state = apply(state, confirm.id);
    assert.equal(state.players[0].hp, Math.min(ownerHp + 1, 3), '孙尚香满血也可发动');
    assert.equal(state.players[1].hp, 2);
    assert.ok(ids.slice(0, 2).every(id => state.discard.includes(id)));
    assert.ok(!model(state).leaves.some(choice => choice.ability === 'standard.jieyin'));
  }
});

test('五人结姻选目标时只显示受伤男性，点击目标确认提交原始合法选项', () => {
  const { f, ids, model } = setup(5);
  Object.assign(f.state.players[2], { sex: 'male', hp: 2 });
  Object.assign(f.state.players[3], { sex: 'male', hp: 1 });
  Object.assign(f.state.players[4], { sex: 'female', hp: 1 });
  let state = f.start();
  state = apply(state, model(state).leaves.find(choice => choice.ability === 'standard.jieyin')!.id);
  for (const cid of ids.slice(0, 2)) state = apply(state, model(state).leaves.find(choice => choice.cardIds.includes(cid))!.id);
  state = apply(state, model(state).leaves.find(choice => choice.actionType === 'confirm')!.id);
  const targets = model(state);
  assert.equal(targets.decision.kind, 'skillTarget');
  assert.deepEqual(targets.nextTargets, [2, 3]);
  assert.equal(targets.selectTarget(1), false);
  assert.equal(targets.selectTarget(4), false);
  assert.equal(targets.selectTarget(3), true);
  state = apply(state, targets.exact[0].id);
  assert.equal(state.players[0].hp, 2);
  assert.equal(state.players[3].hp, 2);
  assert.equal(state.players[2].hp, 2);
});
