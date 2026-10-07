import test from 'node:test';
import assert from 'node:assert/strict';
import type { Choice, Decision, Observation } from '../contracts.ts';
import { GameEngine, StandardRuleset } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EvaluationRegistry } from '../src/policies/evaluation-registry.ts';
import { fixture } from './support/scenario-builder.ts';

const card = (id: number, name: import('../catalog.ts').CardName, suit: import('../catalog.ts').Card['suit'] = 'heart') =>
  ({ id, name, suit, rank: 7 });
const emptyEquip = () => ({ weapon: null, armor: null, plusHorse: null, minusHorse: null });
function observation(hand: import('../catalog.ts').Card[] = [], mode = 'duel'): Observation {
  return {
    events: [], mode: { id: mode }, turn: 1, phase: 'play', active: 0, actor: 0,
    self: { id: 0, label: '我', sex: 'male', hp: 4, maxHp: 4, alive: true, handCount: hand.length,
      hand, equip: emptyEquip(), judge: [], role: mode === 'identity' ? 'loyalist' : undefined },
    others: [{ id: 1, label: '甲', sex: 'male', hp: 3, maxHp: 4, alive: true, handCount: 2,
      equip: emptyEquip(), judge: [], role: mode === 'identity' ? 'lord' : undefined },
      { id: 2, label: '乙', sex: 'female', hp: 3, maxHp: 4, alive: true, handCount: 2,
        equip: emptyEquip(), judge: [], role: mode === 'identity' ? 'rebel' : undefined }],
    deckCount: 50, discardCount: 0, discardTop: null, table: [], shaUsed: 0, nullify: null,
    log: [], outcome: { status: 'ongoing' },
  };
}
const decision = (kind: string, options: Choice[], context: unknown = {}): Decision =>
  ({ actor: 0, kind, title: kind, options, context });

test('身份局按可见阵营选择敌方目标，绝不按第一名对手固定评分', () => {
  const obs = observation([card(10, 'sha')], 'identity');
  const options = [
    { id: 'lord', label: '甲', data: { type: 'play', cid: 10, targets: [1] } },
    { id: 'rebel', label: '乙', data: { type: 'play', cid: 10, targets: [2] } },
    { id: 'end', label: '结束', data: { type: 'endPlay' } },
  ];
  assert.equal(new StrategicPolicy().choose(obs, decision('play', options)), 'rebel');
});

test('转化杀与青囊按真实费用、目标收益评分', () => {
  const obs = observation([card(10, 'shan'), card(11, 'shandian')], 'identity');
  const policy = new StrategicPolicy();
  assert.equal(policy.choose(obs, decision('play', [
    { id: 'virtual', label: '龙胆杀', data: { type: 'virtualSha', transformation: 'standard.longdan.sha',
      ids: [10], targets: [2] } },
    { id: 'end', label: '结束', data: { type: 'endPlay' } },
  ])), 'virtual');
  assert.equal(policy.choose(obs, decision('play', [
    { id: 'friend', label: '青囊甲', data: { type: 'activeSkill', ability: 'standard.qingnang', ids: [11], targets: [1] } },
    { id: 'enemy', label: '青囊乙', data: { type: 'activeSkill', ability: 'standard.qingnang', ids: [11], targets: [2] } },
    { id: 'end', label: '结束', data: { type: 'endPlay' } },
  ])), 'friend');
});

test('优势局制衡优先选低价值闪电，选好后确认；苦肉不在一血发动', () => {
  const obs = observation([card(10, 'shandian'), card(11, 'tao')], 'identity');
  const policy = new StrategicPolicy();
  const options = [
    { id: 'low', label: '选择闪电', data: { type: 'toggle', cid: 10 } },
    { id: 'high', label: '选择桃', data: { type: 'toggle', cid: 11 } },
    { id: 'cancel', label: '取消', data: { type: 'cancel' } },
  ];
  assert.equal(policy.choose(obs, decision('skillCost', options, { ability: 'standard.zhiheng', selectedIds: [] })), 'low');
  assert.equal(policy.choose(obs, decision('skillCost', [...options,
    { id: 'confirm', label: '确认', data: { type: 'confirm' } }],
  { ability: 'standard.zhiheng', selectedIds: [10] })), 'confirm');
  obs.self.hp = 1;
  assert.equal(policy.choose(obs, decision('play', [
    { id: 'kurou', label: '苦肉', data: { type: 'activeSkill', ability: 'standard.kurou', ids: [], targets: [] } },
    { id: 'end', label: '结束', data: { type: 'endPlay' } },
  ])), 'end');
});

test('结姻没有两张可支付的低价值牌时不反复发动后取消', () => {
  const obs = observation([card(10, 'tao'), card(11, 'shan'), card(12, 'shan')], 'identity');
  obs.self.sex = 'female';
  obs.self.hp = 3;
  const options = decision('play', [
    { id: 'jieyin', label: '结姻', data: { type: 'beginSkill', ability: 'standard.jieyin' } },
    { id: 'end', label: '结束', data: { type: 'endPlay' } },
  ]);
  const policy = new StrategicPolicy();
  assert.equal(policy.choose(obs, options), 'end');
  obs.self.hand = [card(10, 'shandian'), card(11, 'wugu'), card(12, 'shan')];
  assert.equal(policy.choose(obs, options), 'jieyin');
});

test('评估注册表以技能 ID 接入，重复注册报错，未知技能走通用回退', () => {
  const registry = new EvaluationRegistry().register('test.skill', () => 20);
  assert.throws(() => registry.register('test.skill', () => 1));
  const policy = new StrategicPolicy(registry);
  assert.equal(policy.choose(observation(), decision('play', [
    { id: 'custom', label: '测试技能', data: { type: 'beginSkill', ability: 'test.skill' } },
    { id: 'end', label: '结束', data: { type: 'endPlay' } },
  ])), 'custom');
  assert.equal(policy.choose(observation(), decision('play', [
    { id: 'unknown', label: '未知技能', data: { type: 'beginSkill', ability: 'other.skill' } },
    { id: 'end', label: '结束', data: { type: 'endPlay' } },
  ])), 'end');
});

test('鬼才只在改判对己方有利时支付手牌', () => {
  const obs = observation([card(10, 'sha', 'heart')], 'identity');
  obs.table = [card(20, 'sha', 'spade')];
  const choices = [
    { id: 'replace', label: '红桃改判', data: { type: 'replace', cid: 10 } },
    { id: 'pass', label: '不改判', data: { type: 'pass' } },
  ];
  const policy = new StrategicPolicy();
  assert.equal(policy.choose(obs, decision('judgeReplace', choices,
    { ability: 'standard.guicai', subject: 1, reason: 'lebu', currentId: 20 })), 'replace');
  assert.equal(policy.choose(obs, decision('judgeReplace', choices,
    { ability: 'standard.guicai', subject: 2, reason: 'lebu', currentId: 20 })), 'pass');
});

test('优势局观星沉底闪电，受伤时保留桃并按低到高压入牌堆顶', () => {
  const obs = observation([], 'identity');
  obs.self.hp = 2;
  obs.table = [card(10, 'shandian'), card(11, 'sha'), card(12, 'tao')];
  const options = (ids: number[]): Choice[] => ids.flatMap(id => [
    { id: `${id}:top`, label: '置顶', data: { type: 'place', card: id, side: 'top' } },
    { id: `${id}:bottom`, label: '置底', data: { type: 'place', card: id, side: 'bottom' } },
  ]);
  const policy = new StrategicPolicy();
  assert.equal(policy.choose(obs, decision('deckReorder', options([10, 11, 12]),
    { ability: 'standard.guanxing', owner: 0 })), '10:bottom');
  assert.equal(policy.choose(obs, decision('deckReorder', options([11, 12]),
    { ability: 'standard.guanxing', owner: 0 })), '11:top');
});

test('真实规则流程中孙权会发动制衡、选择费用并确认结算', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.sunquan';
  const weak = f.hand(0, 'shandian');
  f.hand(0, 'tao');
  const rules = new StandardRuleset();
  const policy = new StrategicPolicy();
  let state = f.start(0);
  let current = rules.decision(state)!;
  let selectedId = policy.choose(rules.observe(state, current.actor), current);
  assert.equal(rules.legalActions(state).find(choice => choice.id === selectedId)?.data?.type, 'beginSkill');
  state = rules.apply(state, selectedId);
  current = rules.decision(state)!;
  assert.equal(current.kind, 'skillCost');
  selectedId = policy.choose(rules.observe(state, current.actor), current);
  const costAction = rules.legalActions(state).find(choice => choice.id === selectedId)?.data;
  assert.equal(costAction?.type, 'toggle');
  if (costAction?.type === 'toggle') assert.equal(costAction.cid, weak);
  state = rules.apply(state, selectedId);
  current = rules.decision(state)!;
  selectedId = policy.choose(rules.observe(state, current.actor), current);
  assert.equal(rules.legalActions(state).find(choice => choice.id === selectedId)?.data?.type, 'confirm');
  state = rules.apply(state, selectedId);
  assert.ok(state.discard.includes(weak));
  assert.equal(state.players[0].hand.length, 2);
});

for (const count of [5, 8]) {
  test(`${count} 人身份局使用同一技能策略接口，连续决策均合法`, () => {
    const game = GameEngine.standard({ mode: 'identity', seed: 9,
      players: Array.from({ length: count }, (_, i) => ({ label: `玩家${i}`, sex: 'male' as const,
        general: i % 2 ? 'standard.sunquan' : 'standard.guanyu' })) });
    const policy = new StrategicPolicy();
    for (let step = 0; step < 80 && !game.finished; step++) {
      const current = game.getDecision();
      assert.ok(current);
      const selected = policy.choose(game.getObservation(current.actor), current);
      assert.ok(game.getLegalActions().some(option => option.id === selected));
      game.choose({ decisionId: current.id!, optionId: selected });
    }
  });
}
