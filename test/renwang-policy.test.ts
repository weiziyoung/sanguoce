import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardRuleset, type GameState } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { archivedPolicy } from './support/archived-policy.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import type { ScoredAction } from '../src/policies/evaluation-registry.ts';
import { fixture } from './support/scenario-builder.ts';

const rules = new StandardRuleset();
const policy = new StrategicPolicy();
const V3Policy = await archivedPolicy('v3');
function selected(state: GameState, ai: Pick<StrategicPolicy, 'choose'> = policy) {
  const decision = rules.decision(state)!;
  const id = ai.choose(rules.observe(state, decision.actor), decision);
  return { id, action: rules.legalActions(state).find(choice => choice.id === id)!.data as ScoredAction };
}
function applyWhere(state: GameState, predicate: (action: ScoredAction) => boolean) {
  const choice = rules.legalActions(state).find(choice => predicate(choice.data as ScoredAction));
  assert.ok(choice, '缺少预期合法选择');
  return rules.apply(state, choice.id);
}

for (const suit of ['spade', 'club']) {
  test(`仁王盾：不主动消耗${suit}黑杀，即使敌人一血且无手牌`, () => {
    const f = fixture();
    f.hand(0, 'sha', suit);
    f.equip(1, 'renwang', 'armor');
    f.state.players[1].hp = 1;
    const state = f.start();
    assert.equal(selected(state).action.type, 'endPlay');
    if (V3Policy) assert.equal(selected(state, new V3Policy()).action.type, 'endPlay');
  });
}

test('仁王盾：有红杀时选择红杀，黑杀留在手中', () => {
  const f = fixture();
  const black = f.hand(0, 'sha', 'spade');
  const red = f.hand(0, 'sha', 'heart');
  f.equip(1, 'renwang', 'armor');
  let state = f.start();
  assert.equal(selected(state).action.cid, red);
  state = rules.apply(state, selected(state).id);
  state = applyWhere(state, action => action.type === 'pass');
  assert.equal(state.players[1].hp, 3);
  assert.ok(state.players[0].hand.includes(black));
});

test('青釭剑无视仁王盾时，黑杀仍有收益并实际造成伤害', () => {
  const f = fixture();
  const black = f.hand(0, 'sha', 'spade');
  f.equip(0, 'qinggang', 'weapon');
  f.equip(1, 'renwang', 'armor');
  let state = f.start();
  assert.equal(selected(state).action.cid, black);
  state = rules.apply(state, selected(state).id);
  state = applyWhere(state, action => action.type === 'pass');
  assert.equal(state.players[1].hp, 3);
});

for (const black of [false, true]) {
  test(`龙胆转化杀按实际颜色判断仁王盾：${black ? '黑闪不出' : '红闪可出'}`, () => {
    const f = fixture();
    f.state.players[0].general = 'standard.zhaoyun';
    const shan = f.hand(0, 'shan');
    // The standard deck has red Shan; a custom black Shan exercises transformation color.
    if (black) f.state.cards[shan].suit = 'club';
    f.equip(1, 'renwang', 'armor');
    const state = f.start();
    assert.equal(selected(state).action.type, black ? 'endPlay' : 'virtualSha');
  });
}

for (const mixed of [false, true]) {
  test(`丈八蛇矛转化杀：${mixed ? '红黑混合无色，不被仁王盾阻挡' : '双黑被仁王盾阻挡'}`, () => {
    const f = fixture();
    f.hand(0, 'shandian', 'spade');
    f.hand(0, mixed ? 'wugu' : 'sha', mixed ? 'heart' : 'club');
    f.equip(0, 'zhangba', 'weapon');
    f.equip(1, 'renwang', 'armor');
    const state = f.start();
    assert.equal(selected(state).action.type, mixed ? 'virtualSha' : 'endPlay');
  });
}

for (const black of [true, false]) {
  test(`青龙追击遇仁王盾：${black ? '保留黑杀并放弃追击' : '红杀仍能正常追击'}`, () => {
    const f = fixture();
    const first = f.hand(0, 'sha', 'heart');
    const second = f.hand(0, 'sha', black ? 'club' : 'diamond');
    f.hand(1, 'shan');
    f.equip(0, 'qinglong', 'weapon');
    f.equip(1, 'renwang', 'armor');
    let state = applyWhere(f.start(), action => action.type === 'play' && action.cid === first);
    state = applyWhere(state, action => action.type === 'respond');
    assert.equal(rules.decision(state)?.kind, 'qinglong');
    if (V3Policy) assert.equal(selected(state, new V3Policy()).action.type, 'qinglong');
    assert.equal(selected(state).action.type, black ? 'pass' : 'qinglong');
    state = rules.apply(state, selected(state).id);
    if (!black) state = applyWhere(state, action => action.type === 'pass');
    assert.equal(state.players[1].hp, black ? 4 : 3);
    assert.equal(state.players[0].hand.includes(second), black);
  });
}

test('方天多目标逐一计算收益，仁王盾目标不加分也不抹掉其他目标收益', () => {
  const f = fixture(3);
  const black = f.hand(0, 'sha', 'spade');
  f.equip(0, 'fangtian', 'weapon');
  f.equip(1, 'renwang', 'armor');
  const state = f.start();
  const observation = rules.observe(state, 0);
  const context = new EvaluationContext(observation);
  assert.equal(context.shaEffect(1, [black]), 0);
  assert.ok(context.shaEffect(2, [black]) > 0);
  const ranks = policy.rank(observation, rules.decision(state)!);
  const actions = rules.legalActions(state);
  const scoreFor = (targets: number[]) => {
    const choice = actions.find(choice => {
      const action = choice.data as ScoredAction;
      return action.cid === black && JSON.stringify(action.targets) === JSON.stringify(targets);
    });
    assert.ok(choice);
    return ranks.find(rank => rank.id === choice.id)!.score;
  };
  assert.ok(scoreFor([1]) < 0);
  assert.ok(scoreFor([1, 2]) > 0);
  assert.equal(scoreFor([1, 2]), scoreFor([2]));
  const multiple = actions.find(choice => JSON.stringify((choice.data as ScoredAction).targets) === '[1,2]')!;
  if (V3Policy) assert.ok(new V3Policy().rank(observation, rules.decision(state)!)
    .find(rank => rank.id === multiple.id)!.score < 0);
});

test('借刀响应仍可用被仁王盾挡住的黑杀保住武器', () => {
  const f = fixture();
  f.hand(0, 'jiedao');
  f.equip(0, 'renwang', 'armor');
  const weapon = f.equip(1, 'zhuge', 'weapon');
  const black = f.hand(1, 'sha', 'spade');
  let state = applyWhere(f.start(), action => action.type === 'play' && action.targets?.[1] === 0);
  assert.equal(rules.decision(state)?.kind, 'jiedao');
  assert.equal(selected(state).action.type, 'jiedaoSha');
  state = rules.apply(state, selected(state).id);
  assert.equal(state.players[1].equip.weapon, weapon);
  assert.ok(state.discard.includes(black));
  assert.equal(state.players[0].hp, 4);
});
