import test from 'node:test';
import assert from 'node:assert/strict';
import { decision, legalActions, observe, preparePlayScenario, StandardRuleset } from '../engine.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { fixture } from './support/scenario-builder.ts';

for (const cards of ['standard', 'junzheng'] as const) {
  test(`${cards} 方天最后手牌杀可任意顺序点选三个目标，提交合法原候选并逐人结算`, () => {
    const f = fixture(5, { cards });
    const sha = f.hand(0, 'sha');
    f.equip(0, 'fangtian', 'weapon');
    const content = contentForCards(cards);
    const rules = new StandardRuleset(undefined, undefined, content);
    let state = preparePlayScenario(f.state, 0, new ContentRuntime(content));
    const model = new TableInteraction(decision(state)!, observe(state, 0).self.hand);
    model.selectCard(sha);
    assert.equal(model.targetLimit, 3);
    assert.deepEqual([...model.nextTargets].sort(), [1, 2, 3, 4]);
    for (const target of [3, 1, 2]) assert.equal(model.selectTarget(target), true);
    assert.equal(model.nextTargets.length, 0);
    assert.equal(model.selectTarget(4), false);
    assert.deepEqual(model.exact[0].targetIds, [1, 2, 3]);
    const choice = model.exact[0];
    assert.ok(legalActions(state).some(action => action.id === choice.id));
    state = rules.apply(state, choice.id);
    for (const target of [1, 2, 3]) {
      assert.equal(decision(state)?.actor, target);
      const pass = legalActions(state).find(action => action.data?.type === 'pass');
      assert.ok(pass);
      state = rules.apply(state, pass.id);
    }
    assert.deepEqual(state.players.map(player => player.hp), [4, 3, 3, 3, 4]);
    model.selectTarget(1); // Cancel a selected unordered target without discarding the others.
    assert.deepEqual(model.targets, [3, 2]);
    model.selectTarget(4);
    assert.deepEqual(model.exact[0].targetIds, [2, 3, 4]);
  });
}

test('方天仍要求杀是最后手牌；普通杀不能选额外目标', () => {
  for (const extraHand of [false, true]) {
    const f = fixture(5);
    const sha = f.hand(0, 'sha');
    if (extraHand) { f.equip(0, 'fangtian', 'weapon'); f.hand(0, 'shan'); }
    const state = f.start();
    const model = new TableInteraction(decision(state)!, observe(state, 0).self.hand);
    model.selectCard(sha);
    assert.equal(model.targetLimit, 1);
    assert.equal(model.selectTarget(1), true);
    assert.equal(model.nextTargets.length, 0);
    assert.equal(model.selectTarget(4), false);
  }
});

test('铁索连环可先选高座位再选自己，最多两人，可取消或确认一个目标', () => {
  const f = fixture(5, { cards: 'junzheng' });
  const chain = f.hand(0, 'tiesuo');
  const state = preparePlayScenario(f.state, 0, new ContentRuntime(contentForCards('junzheng')));
  const model = new TableInteraction(decision(state)!, observe(state, 0).self.hand);
  model.selectCard(chain);
  assert.equal(model.targetLimit, 2);
  assert.equal(model.selectTarget(4), true);
  assert.deepEqual(model.exact[0].targetIds, [4]);
  assert.equal(model.selectTarget(0), true);
  assert.deepEqual(model.exact[0].targetIds, [0, 4]);
  assert.equal(model.selectTarget(2), false);
  model.selectTarget(4);
  assert.deepEqual(model.exact[0].targetIds, [0]);
});

test('借刀杀人的被借刀者与杀目标保持有序，携带手牌元数据也不能交换角色', () => {
  const f = fixture(5);
  const borrow = f.hand(0, 'jiedao');
  f.equip(1, 'fangtian', 'weapon');
  const state = f.start();
  const model = new TableInteraction(decision(state)!, observe(state, 0).self.hand);
  model.selectCard(borrow);
  assert.equal(model.unorderedTargets, false);
  assert.deepEqual(model.nextTargets, [1]);
  assert.equal(model.selectTarget(3), false);
  model.selectTarget(1);
  model.selectTarget(3);
  assert.deepEqual(model.exact[0].targetIds, [1, 3]);
});
