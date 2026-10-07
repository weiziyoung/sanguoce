import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './support/scenario-builder.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { preparePlayScenario } from '../src/app/standard-game.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import type { Observation } from '../contracts.ts';

const content = contentForCards('standard', ['wind']);
const runtime = new ContentRuntime(content);
const resolution = createStandardResolution(standardModes, runtime.triggers, runtime);
const policy = new StrategicPolicy();
function attack(count: number, actor = 'standard.zhaoyun', target = 'wind.zhangjiao') {
  const f = fixture();
  for (const [seat, general] of [actor, target].entries()) {
    const g = content.general(general); Object.assign(f.state.players[seat], { general, group: g.group, hp: g.hp, maxHp: g.hp });
  }
  const sha = f.hand(0, 'sha');
  for (let i = 0; i < count; i++) f.hand(1, i % 2 ? 'sha' : 'shan');
  const state = preparePlayScenario(f.state, 0, runtime);
  const obs = observe(state, 0), d = decision(state)!;
  return { f, state, obs, d, sha, chosen: () => legalActions(state).find(o => o.id === policy.choose(obs, d))!.data! };
}

test('所有武将对多手牌张角避免贸然出杀，对空手与少手牌张角仍可进攻', () => {
  for (const actor of ['standard.zhaoyun', 'standard.guanyu', 'standard.zhangfei', 'wind.weiyan']) {
    const rich = attack(6, actor); assert.equal(rich.chosen().type, 'endPlay', actor);
    for (const n of [0, 1]) {
      const poor = attack(n, actor); assert.notEqual(poor.chosen().type, 'endPlay', `${actor}, ${n}张`);
      assert.ok(new EvaluationContext(poor.obs).shaEffect(1, [poor.sha]) > 0);
    }
  }
});

test('张角有八卦和黑色装备改判时风险更高，烈弓禁闪可消除闪后的雷击风险', () => {
  const x = attack(3); const bare = new EvaluationContext(x.obs).shaEffect(1, [x.sha]);
  x.f.equip(1, 'bagua', 'armor'); const equipped = observe(x.f.state, 0);
  equipped.active = 0; equipped.phase = 'play';
  assert.ok(new EvaluationContext(equipped).shaEffect(1, [x.sha]) < bare);
  const huang = attack(6, 'wind.huangzhong'); assert.equal(huang.chosen().type, 'play');
  assert.ok(new EvaluationContext(huang.obs).shaEffect(1, [huang.sha]) > 3);
});

test('张角风险评估不读取暗牌：对手手牌内容变化且张数不变，评分完全相同', () => {
  const x = attack(4); const before = policy.rank(x.obs, x.d);
  for (const id of x.state.players[1].hand) { x.state.cards[id].name = 'tao'; x.state.cards[id].suit = 'heart'; }
  assert.deepEqual(policy.rank(observe(x.state, 0), x.d), before);
});

test('魏延受伤时优先近距离伤害回血，隔位目标没有狂骨收益', () => {
  const f = fixture(5); Object.assign(f.state.players[0], { general: 'wind.weiyan', hp: 1 });
  const sha = f.hand(0, 'sha'); const obs = observe(f.state, 0); obs.phase = 'play'; obs.active = 0;
  const known = { ...obs, mode: { id: 'duel' } };
  const ctx = new EvaluationContext(known);
  assert.ok(ctx.shaEffect(1, [sha]) > ctx.shaEffect(2, [sha]));
});

test('小乔一血时天香转移给可击杀敌人，费用使用红颜黑桃', () => {
  const f = fixture(); Object.assign(f.state.players[0], { general: 'wind.xiaoqiao', hp: 1, maxHp: 3 });
  f.state.players[1].hp = 1; const cost = f.hand(0, 'sha', 'spade');
  damage(f.state, 0, 1); resolution.scheduler.advance(f.state);
  const d = decision(f.state)!; const choice = legalActions(f.state).find(o => o.id === policy.choose(observe(f.state, 0), d))!;
  assert.ok(choice.data?.type === 'choose' && 'ids' in choice.data && choice.data.ids[0] === cost &&
    'targets' in choice.data && choice.data.targets[0] === 1);
});

test('不屈默认争取存活，回血移牌优先移去重复点数', () => {
  const x = attack(0, 'wind.zhoutai', 'standard.zhaoyun');
  const obs: Observation = { ...x.obs, self: { ...x.obs.self, hp: 0,
    piles: { 'wind.buqu': [{ ...x.obs.self.hand[0], id: 101, rank: 7 }, { ...x.obs.self.hand[0], id: 102, rank: 7 }, { ...x.obs.self.hand[0], id: 103, rank: 3 }] } } };
  const d = { actor: 0, kind: 'contentChoice', title: '不屈', context: { ability: 'wind.buqu', timing: 'remove' },
    options: [101, 102, 103].map(id => ({ id: String(id), label: '移牌', data: { type: 'choose', ids: [id], targets: [] } })) };
  assert.ok(['101', '102'].includes(policy.choose(obs, d)));
});

test('鬼道识别雷击的黑桃结果，并避免向有红颜的角色无效改判', () => {
  const x = attack(0, 'wind.zhangjiao', 'standard.zhaoyun');
  const spade = x.f.hand(0, 'sha', 'spade'); const heart = x.f.top('sha', 'heart');
  x.f.state.table.push(x.f.state.deck.pop()!);
  const d = { actor: 0, kind: 'judgeReplace', title: '雷击改判', context: { ability: 'wind.guidao', subject: 1, reason: 'wind.leiji', currentId: heart },
    options: [{ id: 'replace', label: '改判', data: { type: 'replace', cid: spade } }, { id: 'pass', label: '放弃', data: { type: 'pass' } }] };
  const obs = observe(x.f.state, 0); assert.equal(policy.choose(obs, d), 'replace');
  obs.others[0].general = 'wind.xiaoqiao'; assert.equal(policy.choose(obs, d), 'pass');
});

test('小乔弃牌保留最后一张天香费用，张角保留闪与最后黑桃改判牌', () => {
  for (const general of ['wind.xiaoqiao', 'wind.zhangjiao']) {
    const f = fixture(); f.state.players[0].general = general;
    const spade = f.hand(0, 'sha', 'spade'); const club = f.hand(0, 'sha', 'club'); const shan = f.hand(0, 'shan', 'diamond');
    const obs = observe(f.state, 0);
    const d = { actor: 0, kind: 'discard', title: '弃牌', options: [spade, club, shan].map(cid =>
      ({ id: String(cid), label: '弃置', data: { type: 'discard', cid } })) };
    assert.equal(policy.choose(obs, d), String(club), general);
  }
});

test('神速避免为普通一杀放弃摸牌，有乐不思蜀时可跳过判定争取正常出牌', () => {
  const x = attack(0, 'wind.xiahouyuan', 'standard.zhaoyun');
  const d = { actor: 0, kind: 'contentChoice', title: '神速', context: { ability: 'wind.shensu', timing: 'judge' }, options: [
    { id: 'attack', label: '神速杀', data: { type: 'choose', ids: [], targets: [1] } }, { id: 'pass', label: '正常摸牌', data: { type: 'pass' } },
  ] };
  assert.equal(policy.choose(x.obs, d), 'pass');
  x.obs.self.judge.push({ id: 999, name: 'lebu', suit: 'club', rank: 6 }); assert.equal(policy.choose(x.obs, d), 'attack');
});

test('据守空手时选择补牌，手牌充足时避免跳过下一回合', () => {
  const x = attack(0, 'wind.caoren');
  const d = { actor: 0, kind: 'phaseEndChoice', title: '据守', context: { ability: 'wind.jushou' }, options: [
    { id: 'yes', label: '摸三张并翻面', data: { type: 'yes' } }, { id: 'no', label: '放弃', data: { type: 'no' } },
  ] };
  x.obs.self.hand = []; x.obs.self.handCount = 0; assert.equal(policy.choose(x.obs, d), 'yes');
  x.obs.self.handCount = 6; assert.equal(policy.choose(x.obs, d), 'no');
});
