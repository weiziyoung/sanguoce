import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPANDED_DECK } from '../catalog.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { expandedContent } from '../src/app/game-content.ts';
import { StandardRuleset, preparePlayScenario } from '../engine.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { fixture } from './support/scenario-builder.ts';
import type { DecisionPolicy } from '../contracts.ts';
import type { ActionData, GameState } from '../src/domain/state.ts';

const rules = new StandardRuleset(undefined, undefined, expandedContent);
const runtime = new ContentRuntime(expandedContent);
const policy = new StrategicPolicy(undefined, EXPANDED_DECK);
const start = (s: GameState) => preparePlayScenario(s, 0, runtime);
function selected(s: GameState, p: DecisionPolicy = policy): ActionData {
  const decision = rules.decision(s)!;
  return rules.legalActions(s).find(choice => choice.id === p.choose(rules.observe(s, decision.actor), decision))!.data as ActionData;
}
function advance(s: GameState): GameState {
  const decision = rules.decision(s)!;
  return rules.apply(s, policy.choose(rules.observe(s, decision.actor), decision));
}
function settle(s: GameState): GameState {
  for (let i = 0; i < 30 && s.outcome.status === 'ongoing' && rules.decision(s)?.kind !== 'play'; i++) s = advance(s);
  return s;
}
const identity = () => {
  const f = fixture(5, { cards: 'junzheng', mode: 'identity', roles: ['lord', 'rebel', 'rebel', 'loyalist', 'renegade'] });
  for (const p of f.state.players) f.state.mode.knownTo[p.id] = f.state.players.map(p => p.id);
  return f;
};

test('策略不为白银狮子浪费酒，青釭绕过狮子时仍会利用酒增伤', () => {
  for (const ignores of [false, true]) {
    const f = fixture(2, { cards: 'junzheng' });
    const sha = f.hand(0, 'sha');
    const wine = f.hand(0, 'jiu');
    f.equip(1, 'baiyin', 'armor');
    if (ignores) f.equip(0, 'qinggang', 'weapon');
    const state = start(f.state);

    assert.equal((selected(state) as { cid: number }).cid, ignores ? wine : sha);
    let result = advance(state);
    if (ignores) result = advance(result);
    result = settle(result);
    assert.equal(result.players[1].hp, ignores ? 2 : 3);
  }
});

test('酒是唯一武圣费用时，策略直接转杀，避免喝完之后无牌可杀', () => {
  const f = fixture(2, { cards: 'junzheng' });
  f.state.players[0].general = 'standard.guanyu';
  const wine = f.hand(0, 'jiu', 'diamond');
  const state = start(f.state);

  assert.equal(selected(state).type, 'virtualSha');
  assert.deepEqual((selected(state) as { ids: number[] }).ids, [wine]);
  assert.equal(settle(advance(state)).players[1].hp, 3);
});

test('吕蒙继续克己蓄牌时不先喝酒，连弩就位后才为可出的杀饮酒', () => {
  for (const crossbow of [false, true]) {
    const f = fixture(2, { cards: 'junzheng' });
    f.state.players[0].general = 'standard.lvmeng';
    f.hand(0, 'sha');
    const wine = f.hand(0, 'jiu');
    if (crossbow) f.equip(0, 'zhuge', 'weapon');
    const state = start(f.state);

    if (crossbow) assert.equal((selected(state) as { cid: number }).cid, wine);
    else assert.equal(selected(state).type, 'endPlay');
  }
});

test('只有一个敌人且没有连环同伴时，策略重铸铁索；已有己方连环时只解链', () => {
  for (const chained of [false, true]) {
    const f = fixture(2, { cards: 'junzheng' });
    f.hand(0, 'tiesuo');
    if (chained) f.state.players[0].chained = true;
    const state = start(f.state);

    if (chained) assert.deepEqual((selected(state) as { targets: number[] }).targets, [0]);
    else assert.equal(selected(state).type, 'recast');
  }
});

test('策略先连接两个敌人，再打属性杀', () => {
  const f = identity();
  f.equip(0, 'qilin', 'weapon');
  const chain = f.hand(0, 'tiesuo');
  const fire = f.hand(0, 'sha', 'heart', 4);
  const state = start(f.state);

  assert.equal((selected(state) as { cid: number }).cid, chain);
  assert.deepEqual((selected(state) as { targets: number[] }).targets, [1, 2]);
  const linked = advance(state);
  assert.equal((selected(linked) as { cid: number }).cid, fire);
  const result = settle(advance(linked));
  assert.equal(result.players[1].hp, 3);
  assert.equal(result.players[2].hp, 3);
  assert.equal(result.players[3].hp, 4);
});

test('火攻先考虑付款价值：唯一费用是急需的桃时，不先出火攻再放弃', () => {
  const f = fixture(2, { cards: 'junzheng' });
  const fire = f.hand(0, 'huogong');
  f.hand(0, 'tao');
  f.hand(1, 'shan');
  f.state.players[0].hp = 1;
  const state = start(f.state);
  const decision = rules.decision(state)!;
  const observation = rules.observe(state, 0);
  const score = (p: StrategicPolicy) => p.rank(observation, decision).find(row => row.id === `play:${fire}:1`)!.score;

  assert.ok(score(policy) < 0);
});

test('只覆盖一个花色且目标有多张手牌时，策略保留火攻；不读取暗牌花色', () => {
  const f = fixture(2, { cards: 'junzheng' });
  f.hand(0, 'huogong'); f.hand(0, 'shandian');
  for (let i = 0; i < 4; i++) f.hand(1, 'shan');
  const state = start(f.state);

  assert.equal(selected(state).type, 'endPlay');
  const changed = structuredClone(state);
  for (const id of changed.players[1].hand) changed.cards[id].suit = 'spade';
  assert.deepEqual(rules.observe(changed, 0), rules.observe(state, 0));
  assert.equal(selected(changed).type, 'endPlay');
});

test('火攻仍会用于藤甲收尾，真实展示后支付低价值同花色费用', () => {
  const f = fixture(2, { cards: 'junzheng' });
  const fire = f.hand(0, 'huogong');
  const cost = f.hand(0, 'shandian', 'spade');
  f.hand(1, 'sha', 'spade');
  f.equip(1, 'tengjia', 'armor');
  f.state.players[1].hp = 2;
  let state = start(f.state);
  assert.equal((selected(state) as { cid: number }).cid, fire);
  state = advance(advance(state));
  assert.equal((selected(state) as { cid: number }).cid, cost);
  state = advance(state);
  assert.equal(state.outcome.status, 'finished');
  assert.equal(state.players[1].alive, false);
});

test('面对公开羽扇威胁时不盲目穿藤甲，制衡和空城规划也服从风险判断', () => {
  for (const general of [undefined, 'standard.sunquan', 'standard.zhugeliang']) {
    const f = fixture(2, { cards: 'junzheng' });
    f.state.players[0].general = general;
    f.hand(0, 'tengjia');
    f.equip(1, 'zhuque', 'weapon'); f.hand(1, 'sha');
    const state = start(f.state);

    assert.notEqual(selected(state).type, 'play');
  }
});

test('没有公开火焰威胁时仍会穿藤甲，也会替换在场藤甲避开羽扇', () => {
  const f = fixture(2, { cards: 'junzheng' });
  const armor = f.hand(0, 'tengjia');
  f.hand(1, 'sha');
  assert.equal((selected(start(f.state)) as { cid: number }).cid, armor);
  const g = fixture(2, { cards: 'junzheng' });
  g.equip(0, 'tengjia', 'armor');
  const replacement = g.hand(0, 'bagua');
  g.equip(1, 'zhuque', 'weapon'); g.hand(1, 'sha');
  assert.equal((selected(start(g.state)) as { cid: number }).cid, replacement);
});

test('甘宁认识队友的兵粮：先用过拆，再选择判定牌帮队友恢复摸牌', () => {
  const f = identity();
  f.state.players[0].general = 'standard.ganning';
  const remove = f.hand(0, 'guohe');
  const supply = f.take('bingliang');
  f.state.players[3].judge.push(supply);
  const state = start(f.state);

  assert.equal((selected(state) as { cid: number }).cid, remove);
  assert.deepEqual((selected(state) as { targets: number[] }).targets, [3]);
  const zone = advance(state);
  assert.equal((selected(zone) as { cid: number }).cid, supply);
  assert.ok(advance(zone).discard.includes(supply));
});
