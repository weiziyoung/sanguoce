import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardRuleset, type GameState } from '../engine.ts';
import { standardGeneralDefinitions } from '../src/content/standard/generals.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { StrategicPolicy as V5Policy } from '../src/policies/versions/v5/strategic-policy.ts';
import type { ScoredAction } from '../src/policies/evaluation-registry.ts';
import { fixture } from './support/scenario-builder.ts';

const rules = new StandardRuleset();
const policy = new StrategicPolicy();
function chosen(state: GameState) {
  const prompt = rules.decision(state)!;
  const id = policy.choose(rules.observe(state, prompt.actor), prompt);
  return { id, action: rules.legalActions(state).find(choice => choice.id === id)!.data as ScoredAction };
}
function attack(f: ReturnType<typeof fixture>, cardName: 'sha' | 'juedou') {
  f.state.players[0].general = 'standard.lvbu';
  const card = f.hand(0, cardName);
  const state = f.start();
  const option = rules.legalActions(state).find(choice => (choice.data as ScoredAction).cid === card)!;
  return rules.apply(state, option.id);
}

for (const mode of ['sha', 'juedou'] as const) {
  test(`所有无即时补牌的标准武将仅有一张${mode === 'sha' ? '闪' : '杀'}时不浪费在无双${mode === 'sha' ? '杀' : '决斗'}上`, () => {
    for (const general of standardGeneralDefinitions.filter(item => item.id !== 'standard.luxun')) {
      const f = fixture();
      f.state.players[1].general = general.id;
      const response = f.hand(1, mode === 'sha' ? 'shan' : 'sha');
      let state = attack(f, mode);
      assert.equal(rules.decision(state)!.kind, 'respond');
      assert.equal((rules.decision(state)!.context as { remaining: number }).remaining, 2);
      assert.equal(chosen(state).action.type, 'pass', general.id);
      const prompt = rules.decision(state)!;
      const oldId = new V5Policy().choose(rules.observe(state, prompt.actor), prompt);
      assert.equal((rules.legalActions(state).find(choice => choice.id === oldId)!.data as ScoredAction).type, 'respond');
      const hp = state.players[1].hp;
      state = rules.apply(state, chosen(state).id);
      assert.equal(state.players[1].hp, hp - 1);
      assert.ok(state.players[1].hand.includes(response));
    }
  });

  test(`无双${mode}有两张有效响应时连出两张，第二次不会误判仍需要两张`, () => {
    const f = fixture();
    const ids = [f.hand(1, mode === 'sha' ? 'shan' : 'sha'), f.hand(1, mode === 'sha' ? 'shan' : 'sha')];
    let state = attack(f, mode);
    const hp = state.players[1].hp;
    assert.equal(chosen(state).action.type, 'respond');
    state = rules.apply(state, chosen(state).id);
    assert.equal((rules.decision(state)!.context as { remaining: number }).remaining, 1);
    assert.equal(chosen(state).action.type, 'respond');
    state = rules.apply(state, chosen(state).id);
    assert.equal(state.players[1].hp, hp);
    assert.ok(ids.every(id => !state.players[1].hand.includes(id)));
  });
}

test('武圣和龙胆的独立转化费用可以凑齐无双响应', () => {
  for (const [general, mode, physical, converted] of [
    ['standard.guanyu', 'juedou', 'sha', 'tao'],
    ['standard.zhaoyun', 'sha', 'shan', 'sha'],
  ] as const) {
    const f = fixture();
    f.state.players[1].general = general;
    f.hand(1, physical);
    f.hand(1, converted, 'heart');
    let state = attack(f, mode);
    for (let i = 0; i < 2; i++) {
      assert.equal(chosen(state).action.type, 'respond');
      state = rules.apply(state, chosen(state).id);
    }
    assert.equal(state.players[1].hand.length, 0);
    assert.equal(state.players[1].hp, f.state.players[1].hp);
  }
});

test('丈八候选的费用不能复用，三张非杀不足以凑两张杀，四张可以', () => {
  for (const count of [3, 4]) {
    const f = fixture();
    f.equip(1, 'zhangba', 'weapon');
    for (const name of ['shan', 'shan', 'tao', 'tao'].slice(0, count)) f.hand(1, name);
    const state = attack(f, 'juedou');
    assert.equal(chosen(state).action.type, count === 3 ? 'pass' : 'respond');
  }
});

test('不足两闪时先尝试八卦，判定失败仍保留原来的闪', () => {
  const f = fixture();
  f.equip(1, 'bagua', 'armor');
  const shan = f.hand(1, 'shan');
  f.top('sha', 'spade');
  let state = attack(f, 'sha');
  assert.equal(chosen(state).action.type, 'bagua');
  state = rules.apply(state, chosen(state).id);
  assert.equal(chosen(state).action.type, 'pass');
  state = rules.apply(state, chosen(state).id);
  assert.ok(state.players[1].hand.includes(shan));
});

test('陆逊最后一张闪触发连营补到第二闪，保留实际能完成的响应路径', () => {
  const f = fixture();
  f.state.players[1].general = 'standard.luxun';
  f.hand(1, 'shan');
  f.top('shan');
  let state = attack(f, 'sha');
  const hp = state.players[1].hp;
  for (let i = 0; i < 2; i++) {
    assert.equal(chosen(state).action.type, 'respond');
    state = rules.apply(state, chosen(state).id);
  }
  assert.equal(state.players[1].hp, hp);
});

test('主公只有一闪时先请求护驾，友方代出后再用自己的闪完成无双响应', () => {
  const f = fixture(5, { mode: 'identity', roles: ['lord', 'rebel', 'loyalist', 'rebel', 'renegade'] });
  f.state.players[0].general = 'standard.caocao';
  f.state.players[0].group = 'wei';
  f.state.players[1].general = 'standard.lvbu';
  f.state.players[2].general = 'standard.xuzhu';
  f.state.players[2].group = 'wei';
  f.hand(0, 'shan');
  f.hand(2, 'shan');
  const sha = f.hand(1, 'sha');
  let state = f.start(1);
  const option = rules.legalActions(state).find(choice => {
    const action = choice.data as ScoredAction;
    return action.cid === sha && action.targets?.[0] === 0;
  })!;
  state = rules.apply(state, option.id);
  assert.equal(chosen(state).action.type, 'proxy');
  const hp = state.players[0].hp;
  for (let i = 0; i < 8 && state.players[0].hand.length; i++) state = rules.apply(state, chosen(state).id);
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.players[0].hp, hp);
});

test('普通杀只需一闪，仍正常响应', () => {
  const f = fixture();
  f.hand(1, 'shan');
  const sha = f.hand(0, 'sha');
  const state = f.start();
  const option = rules.legalActions(state).find(choice => (choice.data as ScoredAction).cid === sha)!;
  assert.equal(chosen(rules.apply(state, option.id)).action.type, 'respond');
});
