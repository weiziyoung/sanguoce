import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecisionPolicy } from '../contracts.ts';
import { StandardRuleset, type GameState } from '../engine.ts';
import { emitEvent } from '../src/domain/event-journal.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { StrategicPolicy as V10 } from '../src/policies/versions/v10/strategic-policy.ts';
import { modelRelationships } from '../src/presentation/model-relationships.ts';
import { ChineseView } from '../chinese-view.ts';
import { fixture } from './support/scenario-builder.ts';

const rules = new StandardRuleset();
const policy = new StrategicPolicy(), old = new V10();
const begin = 'skill:standard.rende:begin';
function scenario(role: 'lord' | 'loyalist' | 'rebel' = 'loyalist') {
  const roles = role === 'lord' ? ['lord','loyalist','rebel','rebel','renegade'] :
    role === 'rebel' ? ['rebel','lord','rebel','loyalist','renegade'] : ['loyalist','lord','rebel','rebel','renegade'];
  const f = fixture(5, { mode: 'identity', roles });
  f.state.players[0].general = 'standard.liubei';
  return f;
}
function choose(state: GameState, p: DecisionPolicy = policy): string {
  const decision = rules.decision(state)!;
  return p.choose(rules.observe(state, decision.actor), decision) as string;
}
function transfer(state: GameState): GameState {
  assert.equal(choose(state), begin);
  state = rules.apply(state, begin);
  for (let i = 0; i < 40; i++) {
    if (rules.decision(state)?.kind === 'play') return state;
    state = rules.apply(state, choose(state));
  }
  assert.fail('仁德选牌与选目标应正常结束');
}
function finishTurn(state: GameState, p: DecisionPolicy = policy): GameState {
  for (let i = 0; i < 80 && state.active === 0; i++) state = rules.apply(state, choose(state, p));
  assert.notEqual(state.active, 0);
  return state;
}
const giftEvents = (state: GameState) => state.events.filter(event => event.kind === 'gained')
  .filter(event => event.data.cause === 'standard.rende');

test('v10刘备宁愿弃掉溢出闪；v11先仁德给主公、保留基本防守并真实完成回合', () => {
  const f = scenario();
  const cards = Array.from({ length: 6 }, () => f.hand(0, 'shan')).sort((a, b) => a - b);
  const initial = f.start();
  assert.equal(choose(initial, old), 'end-play');
  const before = finishTurn(initial, old);
  assert.equal(giftEvents(before).length, 0);
  assert.equal(before.events.filter(event => event.kind === 'discarded' && event.data.player === 0).length, 2);
  assert.equal(choose(initial), begin);
  const after = finishTurn(initial);
  assert.ok(giftEvents(after).length >= 2);
  assert.ok(giftEvents(after).every(event => event.data.to === 1));
  assert.ok(after.players[0].hand.includes(cards[0]), '留一张闪保护自己');
  assert.equal(after.events.filter(event => event.kind === 'discarded' && event.data.player === 0).length, 0);
});

test('负仇恨的未知盟友离开近期窗口后仍能收到仁德，敌人和中立座位不会被赠牌', () => {
  const f = scenario('lord');
  for (let i = 0; i < 6; i++) f.hand(0, 'shan');
  emitEvent(f.state, 'nullificationUsed', { player: 1, card: f.hand(1, 'wuxie'), cname: 'juedou', target: 0, parityBefore: 0 });
  emitEvent(f.state, 'damaged', { source: 2, target: 0, amount: 1, hp: 4, maxHp: 5, card: null });
  for (let i = 0; i < 45; i++) emitEvent(f.state, 'drawn', { player: 4, count: 1 });
  const state = f.start(), obs = rules.observe(state, 0);
  assert.equal(obs.others.find(player => player.id === 1)?.role, undefined);
  assert.equal(obs.events.some(event => event.kind === 'nullificationUsed'), false);
  assert.equal(modelRelationships(obs).find(row => row.player.id === 1)?.hate, -0.5);
  assert.equal(choose(state, old), 'end-play');
  const after = transfer(state);
  assert.ok(giftEvents(after).length > 0);
  assert.ok(giftEvents(after).every(event => event.data.to === 1));
});

test('反贼刘备把牌给曾主动攻击主公的潜在盟友，友善方向与忠臣相反', () => {
  const f = scenario('rebel');
  for (let i = 0; i < 6; i++) f.hand(0, 'shan');
  emitEvent(f.state, 'damaged', { source: 2, target: 1, amount: 1, hp: 4, maxHp: 5, card: null });
  const state = f.start();
  assert.equal(modelRelationships(rules.observe(state, 0)).find(row => row.player.id === 2)?.hate, -1);
  const after = transfer(state);
  assert.ok(giftEvents(after).every(event => event.data.to === 2));
  const g = scenario();
  for (let i = 0; i < 6; i++) g.hand(0, 'shan');
  emitEvent(g.state, 'damaged', { source: 2, target: 1, amount: 1, hp: 4, maxHp: 5, card: null });
  assert.ok(modelRelationships(rules.observe(g.start(), 0)).find(row => row.player.id === 2)!.hate > 0);
});

test('受伤时按两张赠牌回血规划，累计次数公开，回血后不再虚算下一次回血', () => {
  const f = scenario();
  f.state.players[0].hp = 2;
  f.hand(0, 'shan'); f.hand(0, 'sha'); f.hand(0, 'sha');
  let state = transfer(f.start());
  assert.equal(giftEvents(state).length, 2);
  assert.equal(state.players[0].hp, 3);
  assert.deepEqual(rules.observe(state, 0).skillProgress, [{ ability: 'standard.rende', count: 2 }]);
  assert.equal(rules.observe(state, 1).skillProgress, undefined);
  assert.match(new ChineseView().stateForDecision(rules.observe(state, 0), rules.decision(state)!), /仁德本回合已赠牌2张/);
  assert.equal(choose(state), 'end-play');
  state = rules.apply(state, 'end-play');
  assert.equal(rules.observe(state, 0).skillProgress, undefined);
  assert.equal(state.events.filter(event => event.kind === 'recovered' && event.data.player === 0).length, 1);
});

test('已赠一张时允许送出最后一张合适手牌完成回血，不受旧的至少两手牌门槛阻挡', () => {
  const f = scenario();
  f.state.players[0].hp = 2;
  const first = f.hand(0, 'sha'); f.hand(0, 'sha');
  let state = rules.apply(f.start(), begin);
  state = rules.apply(state, `skill-cost:standard.rende:${first}`);
  state = rules.apply(state, 'skill-cost:standard.rende:confirm');
  state = rules.apply(state, 'skill-target:standard.rende:0');
  assert.equal(state.players[0].hand.length, 1);
  assert.equal(state.players[0].hp, 2);
  assert.equal(choose(state, old), 'end-play');
  for (let i = 0; i < 45; i++) emitEvent(state, 'drawn', { player: 4, count: 1 });
  assert.equal(rules.observe(state, 0).events.some(event => event.kind === 'gained'), false);
  assert.deepEqual(rules.observe(state, 0).skillProgress, [{ ability: 'standard.rende', count: 1 }]);
  const restored = JSON.parse(JSON.stringify(state));
  state = transfer(restored);
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.players[0].hp, 3);
  assert.equal(giftEvents(state).length, 2);
});

test('目标评分考虑队友缺牌与低血量，避免破坏空城，不把负仇恨当作后台已知身份', () => {
  const f = scenario('lord');
  f.state.players[1].hp = 1;
  for (let i = 0; i < 5; i++) f.hand(2, 'shan');
  for (const player of [1, 2, 3]) emitEvent(f.state, 'nullificationUsed', {
    player, card: f.take('wuxie'), cname: 'juedou', target: 0, parityBefore: 0 });
  f.state.players[3].general = 'standard.zhugeliang';
  for (let i = 0; i < 6; i++) f.hand(0, 'shan');
  const hidden = f.hand(4, 'sha');
  const state = f.start();
  const after = transfer(state);
  assert.ok(giftEvents(after).every(event => event.data.to === 1));
  const obs = rules.observe(state, 0), decision = rules.decision(state)!;
  [state.mode.roles[1], state.mode.roles[4]] = [state.mode.roles[4], state.mode.roles[1]];
  state.cards[hidden].name = 'tao';
  assert.deepEqual(rules.observe(state, 0), obs);
  assert.equal(policy.choose(rules.observe(state, 0), decision), policy.choose(obs, decision));
});

test('仅有中立或敌对角色、队友阵亡、只剩空城队友时不乱赠，1v1也不送给对手', () => {
  for (const kind of ['neutral', 'dead', 'kongcheng', 'duel'] as const) {
    const f = kind === 'duel' ? fixture() : scenario('lord');
    f.state.players[0].general = 'standard.liubei';
    for (let i = 0; i < 6; i++) f.hand(0, 'shan');
    if (kind === 'dead' || kind === 'kongcheng') {
      emitEvent(f.state, 'nullificationUsed', { player: 1, card: f.take('wuxie'), cname: 'juedou', target: 0, parityBefore: 0 });
      if (kind === 'dead') f.state.players[1].alive = false;
      else f.state.players[1].general = 'standard.zhugeliang';
    }
    assert.equal(choose(f.start()), 'end-play', kind);
  }
});

test('酒状态和基本防守仍保留，刘备下一次出牌优先兑现酒杀', () => {
  const f = scenario();
  const sha = f.hand(0, 'sha'), shan = f.hand(0, 'shan'); f.hand(0, 'sha');
  f.state.players[0].drunk = 1;
  f.equip(0, 'qinggang', 'weapon');
  emitEvent(f.state, 'damaged', { source: 2, target: 1, amount: 1, hp: 4, maxHp: 5, card: null });
  const state = f.start();
  const id = choose(state), action = rules.legalActions(state).find(choice => choice.id === id)!.data as { cid?: number };
  assert.equal(state.cards[action.cid!].name, 'sha');
  assert.ok(state.players[0].hand.includes(sha) && state.players[0].hand.includes(shan));
});

test('本回合仁德已回血后，即使仍受伤，也不再为不存在的第二次回血送出高价值牌', () => {
  const f = scenario();
  f.state.players[0].hp = 2;
  f.hand(1, 'shan'); f.hand(1, 'shan');
  f.hand(0, 'sha'); f.hand(0, 'sha'); f.hand(0, 'nanman'); f.hand(0, 'wanjian');
  const state = transfer(f.start());
  assert.equal(state.players[0].hp, 3);
  assert.equal(state.players[0].hand.length, 2);
  assert.deepEqual(rules.observe(state, 0).skillProgress, [{ ability: 'standard.rende', count: 2 }]);
  const obs = rules.observe(state, 0), decision = rules.decision(state)!;
  assert.ok(policy.rank(obs, decision).find(row => row.id === begin)!.score < 0);
  // Removing the progress would incorrectly make this pair look like it can heal again.
  delete obs.skillProgress;
  assert.ok(policy.rank(obs, decision).find(row => row.id === begin)!.score > 0);
});
