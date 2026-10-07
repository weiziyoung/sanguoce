import test from 'node:test';
import assert from 'node:assert/strict';
import type { Choice, Decision, Observation } from '../contracts.ts';
import { StandardRuleset } from '../engine.ts';
import { emitEvent } from '../src/domain/event-journal.ts';
import { publicInteractions } from '../src/domain/public-interactions.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { RelationshipModel } from '../src/policies/relationship-model.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { fixture } from './support/scenario-builder.ts';

const rules = new StandardRuleset(), policy = new StrategicPolicy();
const prompt = (options: Choice[], kind = 'play', context: unknown = {}): Decision =>
  ({ actor: 0, kind, title: kind, options, context });
const end: Choice = { id: 'end', label: '结束', data: { type: 'endPlay' } };
const play = (cid: number, target: number): Choice =>
  ({ id: `play:${cid}:${target}`, label: `对${target}用牌`, data: { type: 'play', cid, targets: [target] } });
function scenario(count = 5, cards: 'standard' | 'junzheng' = 'standard') {
  return fixture(count, { mode: 'identity', cards, roles: count === 5 ?
    ['renegade', 'lord', 'loyalist', 'rebel', 'rebel'] :
    ['renegade', 'lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel'] });
}
function observed(): Observation {
  const f = scenario();
  f.hand(0, 'sha');
  const obs = rules.observe(f.start(), 0);
  obs.others.forEach(player => { player.hp = 4; player.handCount = 2; });
  obs.publicInteractions = publicInteractions([
    { id: 1, kind: 'recovered', data: { source: 2, player: 1, amount: 2 } },
    { id: 2, kind: 'damaged', data: { source: 3, target: 1, amount: 2, hp: 4, maxHp: 5, card: null } },
    { id: 3, kind: 'damaged', data: { source: 4, target: 1, amount: 2, hp: 4, maxHp: 5, card: null } },
  ]);
  return obs;
}
function power(obs: Observation, loyal: boolean) {
  for (const player of obs.others) if (player.id !== 1) {
    const strong = (player.id === 2) === loyal;
    player.hp = strong ? 4 : 1;
    player.handCount = strong ? 10 : 0;
  }
}

test('内奸开局只有杀时主动出合法杀，且同等未知座位不被硬编码身份', () => {
  for (const count of [5, 8]) {
    const f = scenario(count), sha = f.hand(0, 'sha'), state = f.start();
    const obs = rules.observe(state, 0), decision = rules.decision(state)!;
    const chosen = policy.choose(obs, decision);
    const action = rules.legalActions(state).find(choice => choice.id === chosen)!.data as { cid: number; targets: number[] };
    assert.equal(action.cid, sha);
    assert.notEqual(action.targets[0], 1);
    const relations = new RelationshipModel(obs);
    assert.equal(relations.relation(2), relations.relation(3));
    const next = rules.apply(state, chosen);
    assert.equal(next.players[0].hand.includes(sha), false);
  }
});

test('根据公开资源变化切换压制阵营', () => {
  const obs = observed(), cid = obs.self.hand[0].id;
  obs.events = [
    { id: 1, kind: 'cardUsed', data: { source: 2, card: 100, targets: [1], effectiveName: 'tao' } },
    { id: 2, kind: 'damaged', data: { source: 3, target: 1, amount: 1, hp: 4, maxHp: 5, card: null } },
  ];
  const decision = prompt([play(cid, 2), play(cid, 3), end]);
  power(obs, true);
  assert.equal(policy.choose(obs, decision), play(cid, 2).id);
  power(obs, false);
  assert.equal(policy.choose(obs, decision), play(cid, 3).id);
  assert.ok(new RelationshipModel(obs).relation(2) > 0, '弱势忠方成为临时帮助对象');
});

test('主公安全时压强忠；同样实力下主公一血时改压反方，并用桃救主', () => {
  const obs = observed(), cid = obs.self.hand[0].id;
  power(obs, true);
  const decision = prompt([play(cid, 2), play(cid, 3), end]);
  assert.equal(policy.choose(obs, decision), play(cid, 2).id);
  obs.others[0].hp = 1;
  assert.equal(policy.choose(obs, decision), play(cid, 3).id);
  obs.self.hand.push({ id: 900, name: 'tao', suit: 'heart', rank: 3 });
  obs.others[0].hp = 0;
  const dying = prompt([{ id: 'pass', label: '放弃', data: { type: 'pass' } },
    { id: 'save', label: '救主', data: { type: 'save', ids: [900] } }], 'dying', { target: 1 });
  assert.equal(policy.choose(obs, dying), 'save');
});

test('无人表态时优先削弱资源更多的未知角色，不凭空指定其为反贼', () => {
  const obs = observed();
  obs.publicInteractions = [];
  obs.others[1].handCount = 10;
  obs.others[2].handCount = 1;
  obs.others[3].handCount = 1;
  const ctx = new EvaluationContext(obs);
  assert.ok(ctx.relation(2) < ctx.relation(3));
  const card = { id: 901, name: 'lebu' as const, suit: 'heart' as const, rank: 6 };
  obs.self.hand.push(card);
  assert.equal(policy.choose(obs, prompt([play(card.id, 3), play(card.id, 2), end])), play(card.id, 2).id);
  assert.equal(obs.others[1].role, undefined);
});

test('整局公开证据在近期窗口之外仍有效，公开摘要存在时不重复计算近期事件', () => {
  const f = scenario();
  emitEvent(f.state, 'recovered', { source: 2, player: 1, amount: 2 });
  emitEvent(f.state, 'damaged', { source: 3, target: 1, amount: 2, hp: 4, maxHp: 5, card: null });
  for (let i = 0; i < 45; i++) emitEvent(f.state, 'drawn', { player: 4, count: 1 });
  const obs = rules.observe(f.start(), 0);
  assert.equal(obs.events.some(event => event.kind === 'damaged'), false);
  obs.others[0].hp = 1;
  const ctx = new EvaluationContext(obs);
  assert.ok(ctx.relation(3) < ctx.relation(2));
  const recent = structuredClone(obs);
  recent.events = [{ id: 200, kind: 'damaged', data: { source: 3, target: 1, amount: 2, hp: 4, maxHp: 5, card: null } }];
  assert.equal(new EvaluationContext(recent).relation(3), ctx.relation(3));
  const restored = JSON.parse(JSON.stringify(obs)) as Observation;
  assert.equal(new EvaluationContext(restored).relation(3), ctx.relation(3));
});

test('顺手牵羊包含自身得牌收益：可以从临时弱方发育，并优先拿有用装备；不偷主公防守', () => {
  const obs = observed();
  power(obs, false);
  obs.self.hand.push({ id: 902, name: 'shunshou', suit: 'spade', rank: 3 });
  obs.others[1].handCount = 1;
  obs.others[1].equip.weapon = { id: 903, name: 'zhuge', suit: 'diamond', rank: 1 };
  const ctx = new EvaluationContext(obs);
  assert.ok(ctx.relation(2) > 0 && ctx.targetEffect('shunshou', 2) > 0);
  assert.equal(policy.choose(obs, prompt([end, play(902, 2)])), play(902, 2).id);
  assert.equal(policy.choose(obs, prompt([end, play(902, 1)])), end.id);
  assert.equal(policy.choose(obs, prompt([
    { id: 'hand', label: '手牌', data: { type: 'zone', zone: 'hand' } },
    { id: 'equip', label: '连弩', data: { type: 'zone', zone: 'equip', cid: 903 } },
  ], 'zone', { target: 2, cname: 'shunshou' })), 'equip');
  obs.others[0].judge.push({ id: 904, name: 'lebu', suit: 'heart', rank: 6 });
  assert.equal(policy.choose(obs, prompt([end, play(902, 1)])), play(902, 1).id);
});

test('五谷、回血和补装备提供自身成长；防守弃牌仍留闪', () => {
  const f = scenario();
  const wugu = f.hand(0, 'wugu'), shan = f.hand(0, 'shan');
  emitEvent(f.state, 'damaged', { source: 3, target: 0, amount: 1, hp: 4, maxHp: 4, card: null });
  const state = f.start();
  const obs = rules.observe(state, 0);
  assert.equal(policy.choose(obs, prompt([end, { id: 'wugu', label: '五谷', data: { type: 'play', cid: wugu } }])), 'wugu');
  assert.equal(policy.choose(obs, prompt([
    { id: 'shan', label: '弃闪', data: { type: 'discard', cid: shan } },
    { id: 'wugu', label: '弃五谷', data: { type: 'discard', cid: wugu } },
  ], 'discard')), 'wugu');
  const tao = { id: 910, name: 'tao' as const, suit: 'heart' as const, rank: 3 };
  obs.self.hand.push(tao); obs.self.hp = 2;
  assert.equal(policy.choose(obs, prompt([end, play(tao.id, 0)])), play(tao.id, 0).id);
  obs.self.hand.push({ id: 911, name: 'bagua', suit: 'club', rank: 2 });
  assert.equal(policy.choose(obs, prompt([end, { id: 'equip', label: '装备', data: { type: 'play', cid: 911 } }])), 'equip');
});

test('群攻和属性连环不能用多个敌人的收益抵消主公的致命风险，无懈会保护主公', () => {
  const obs = observed();
  power(obs, false); obs.others[0].hp = 1; obs.others[0].handCount = 0;
  obs.self.hand = [{ id: 920, name: 'nanman', suit: 'spade', rank: 7 },
    { id: 921, name: 'sha', nature: 'fire', suit: 'heart', rank: 4 }];
  obs.self.handCount = 2;
  obs.others[0].chained = true; obs.others[2].chained = true;
  const ctx = new EvaluationContext(obs);
  assert.ok(ctx.shaEffect(3, [921], 'fire') < 0);
  assert.equal(policy.choose(obs, prompt([end,
    { id: 'aoe', label: '南蛮', data: { type: 'play', cid: 920 } }, play(921, 3)])), 'end');
  obs.nullify = { source: 3, target: 1, cname: 'nanman', parity: 0 };
  assert.equal(policy.choose(obs, prompt([
    { id: 'pass', label: '放弃', data: { type: 'pass' } },
    { id: 'nullify', label: '无懈', data: { type: 'nullify', ids: [] } },
  ], 'nullify')), 'nullify');
});

test('武将专属评分和流离不能绕过保主限制；单挑阶段恢复攻击主公', () => {
  const obs = observed(); obs.others[0].hp = 1;
  obs.self.general = 'standard.diaochan';
  const lijian: Choice = { id: 'lijian', label: '离间', data: { type: 'activeSkill',
    ability: 'standard.lijian', targets: [1, 3], ids: [obs.self.hand[0].id] } };
  assert.equal(policy.choose(obs, prompt([end, lijian])), 'end');
  const redirect: Choice = { id: 'redirect', label: '流离', data: { type: 'redirect', target: 1, card: obs.self.hand[0].id } };
  const pass: Choice = { id: 'pass', label: '放弃', data: { type: 'pass' } };
  assert.equal(policy.choose(obs, prompt([redirect, pass], 'attackRedirect')), 'pass');
  obs.self.hand.push({ id: 930, name: 'jiedao', suit: 'club', rank: 12 });
  assert.equal(policy.choose(obs, prompt([end, { id: 'borrow', label: '借刀杀主',
    data: { type: 'play', cid: 930, targets: [3, 1] } }])), 'end');
  assert.equal(policy.choose(obs, prompt([{ id: 'attack', label: '被借刀出杀',
    data: { type: 'jiedaoSha', ids: [obs.self.hand[0].id] } }, pass], 'jiedao', { source: 3, target: 1 })), 'pass');
  obs.others.slice(1).forEach(player => { player.alive = false; });
  const cid = obs.self.hand[0].id;
  assert.equal(policy.choose(obs, prompt([end, play(cid, 1)])), play(cid, 1).id);
});

test('三人残局先清第三人，不救第三人延长残局；公开死亡配额支持未表态剩余目标', () => {
  const obs = observed(), cid = obs.self.hand[0].id;
  obs.others[1].alive = false; obs.others[1].role = 'loyalist';
  obs.publicInteractions = [];
  const ctx = new EvaluationContext(obs);
  assert.ok(ctx.relation(3) < 0 && ctx.relation(4) < 0);
  obs.others[3].alive = false; obs.others[3].role = 'rebel';
  assert.equal(policy.choose(obs, prompt([end, play(cid, 1), play(cid, 3)])), play(cid, 3).id);
  assert.equal(policy.choose(obs, prompt([
    { id: 'save', label: '救援', data: { type: 'save', ids: [] } },
    { id: 'pass', label: '放弃', data: { type: 'pass' } },
  ], 'dying', { target: 3 })), 'pass');
});

test('变更后台暗手牌和隐藏身份不会改变内奸的观察与评分，5/8人及标准/军争均成立', () => {
  for (const count of [5, 8]) for (const cards of ['standard', 'junzheng'] as const) {
    const f = scenario(count, cards);
    f.hand(0, 'sha'); const hidden = f.hand(2, 'sha');
    const state = f.start(), obs = rules.observe(state, 0), decision = rules.decision(state)!;
    const ranked = policy.rank(obs, decision);
    [state.mode.roles[2], state.mode.roles[4]] = [state.mode.roles[4], state.mode.roles[2]];
    state.cards[hidden].name = 'tao';
    assert.deepEqual(rules.observe(state, 0), obs);
    assert.deepEqual(policy.rank(rules.observe(state, 0), decision), ranked);
  }
});

test('其他身份和1v1继续遵循各自的攻击目标', () => {
  const obs = observed(), cid = obs.self.hand[0].id;
  const decision = prompt([play(cid, 1), play(cid, 2), play(cid, 3), end]);
  for (const role of ['lord', 'loyalist', 'rebel']) {
    obs.self.role = role;
    assert.equal(policy.choose(obs, decision), role === 'rebel' ? play(cid, 1).id : end.id);
  }
  obs.mode.id = 'duel';
  assert.equal(policy.choose(obs, decision), play(cid, 1).id);
});
