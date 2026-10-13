import test from 'node:test';
import assert from 'node:assert/strict';
import { forestScene as scene } from './support/forest-scenario.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import type { GameState } from '../src/domain/state.ts';
const policy = new StrategicPolicy();
const pick = (s: GameState) => legalActions(s).find(o => o.id === policy.choose(observe(s, decision(s)!.actor), decision(s)!))!.data!;
const reveal = (s: GameState, seat: number) => { s.mode.knownTo[seat] = s.players.map(p => p.id); };

test('崩坏在高体力但上限有两点余量时保体力，满血与仅一点余量时保上限', () => {
  for (const hp of [8, 7, 6, 5]) { const x = scene(); x.general(0, 'forest.dongzhuo'); x.f.state.players[0].hp = hp;
    const a = pick(x.tasks({ kind: 'phaseEnd' })); assert.ok(a.type === 'choose'); assert.equal(a.choice, hp <= 6 ? 'maxHp' : 'hp'); }
});

test('放逐同阵营同资源时优先即将行动的敌人，已有乐的敌人收益降低', () => {
  const x = scene(5, 'standard', true); x.general(0, 'forest.caopi'); reveal(x.f.state, 2); reveal(x.f.state, 3);
  const judge = x.f.take('lebu'); x.f.state.players[2].judge.push(judge); damage(x.f.state, 0, 2); let s = x.advance(x.f.state);
  s = x.choose(s, d => d.type === 'yes'); const a = pick(s); assert.ok(a.type === 'choose' && 'targets' in a); assert.equal(a.targets[0], 3);
  s.players[2].judge = []; s.discard.push(judge); const b = pick(s); assert.ok(b.type === 'choose' && 'targets' in b); assert.equal(b.targets[0], 2);
});

test('放逐没有可识别的正收益目标时不随便给未知角色翻面', () => {
  const x = scene(5, 'standard', true); x.general(0, 'forest.caopi'); damage(x.f.state, 0, null); x.advance(x.f.state);
  assert.equal(pick(x.f.state).type, 'no');
});

test('英魂只有一点失血、对面是敌人时不帮敌人过牌，敌人空牌时不做无效操作', () => {
  for (const stocked of [true, false]) { const x = scene(); x.general(0, 'forest.sunjian'); x.f.state.players[0].hp = 3; if (stocked) x.f.hand(1, 'sha');
    assert.equal(pick(x.tasks({ kind: 'phaseStart' })).type, 'no'); }
});

test('英魂友方有牌可过牌则发动，友方空牌且X为一时不白发动', () => {
  for (const stocked of [true, false]) { const x = scene(5, 'standard', true); x.general(1, 'forest.sunjian'); x.f.state.active = 1; x.f.state.players[1].hp = 3;
    if (stocked) x.f.hand(0, 'sha'); assert.equal(pick(x.tasks({ kind: 'phaseStart' })).type, stocked ? 'yes' : 'no'); }
});

test('英魂目标弃牌考虑白银离场回血，而不只看装备基础值', () => {
  const x = scene(5, 'junzheng', true); x.general(0, 'forest.sunjian'); x.f.state.players[0].hp = 2;
  const silver = x.f.equip(1, 'baiyin', 'armor'); x.f.state.players[1].hp = 2; x.f.hand(1, 'sha');
  let s = x.tasks({ kind: 'phaseStart' }); s = x.choose(s, d => d.type === 'yes'); s = x.choose(s, d => d.type === 'choose' && d.choice === 'help:1');
  const a = pick(s); assert.ok(a.type === 'choose' && 'ids' in a); assert.equal(a.ids[0], silver);
});

test('烈刃中点廉价牌也可搏取装备，敌人手牌多时高点贵牌不会盲拼', () => {
  for (const many of [false, true]) { const x = scene(); x.general(0, 'forest.zhurong'); const sha = x.f.hand(0, 'sha'); const point = x.f.hand(0, many ? 'shan' : 'sha');
    x.f.state.cards[point].rank = many ? 10 : 7; x.f.hand(1, 'sha'); x.f.equip(1, 'qilin', 'weapon');
    if (many) for (let i = 0; i < 9; i++) x.f.hand(1, 'sha');
    const s = x.passResponses(x.choose(x.start(), d => d.type === 'play' && d.cid === sha)); assert.equal(pick(s).type, many ? 'no' : 'yes'); }
});

test('烈刃只有一张保命闪且低血时不为拼点消耗，只有敌人最后一牌也不盲拼', () => {
  for (const fragile of [false, true]) { const x = scene(); x.general(0, 'forest.zhurong'); const sha = x.f.hand(0, 'sha'), shan = x.f.hand(0, 'shan');
    x.f.state.cards[shan].rank = 13; x.f.hand(1, 'sha'); if (fragile) { x.f.state.players[0].hp = 1; x.f.hand(1, 'sha'); }
    const s = x.passResponses(x.choose(x.start(), d => d.type === 'play' && d.cid === sha)); assert.equal(pick(s).type, 'no'); }
});

test('烈刃被拼点方也会选择值得支付的高点牌防止被取牌', () => {
  const x = scene(); x.general(0, 'forest.zhurong'); const sha = x.f.hand(0, 'sha'); x.f.hand(0, 'sha');
  const low = x.f.hand(1, 'sha'), high = x.f.hand(1, 'sha'); x.f.state.cards[low].rank = 2; x.f.state.cards[high].rank = 13; x.f.equip(1, 'qilin', 'weapon');
  let s = x.passResponses(x.choose(x.start(), d => d.type === 'play' && d.cid === sha)); s = x.choose(s, d => d.type === 'yes'); s = x.choose(s, d => d.type === 'pindian');
  const a = pick(s); assert.ok(a.type === 'pindian'); assert.equal(a.cid, high);
});

test('酒池同样能完成酒杀时选择低价值费用，保留较贵黑桃牌', () => {
  const x = scene(); x.general(0, 'forest.dongzhuo'); const expensive = x.f.hand(0, 'wuxie', 'spade'); const cheap = x.f.hand(0, 'sha', 'spade'); x.f.hand(0, 'sha', 'heart');
  const a = pick(x.start()); assert.ok(a.type === 'virtualBasic'); assert.equal(a.ids[0], cheap); assert.notEqual(a.ids[0], expensive);
});

test('南蛮不会把出牌者算成受害者，并计入给敌方祝融送牌的成本', () => {
  const x = scene(); const nanman = x.f.hand(0, 'nanman'); const s = x.start(); const a = pick(s); assert.ok(a.type === 'play'); assert.equal(a.cid, nanman);
  const before = policy.rank(observe(s, 0), decision(s)!)[0].score; s.players[1].general = 'forest.zhurong';
  const ctx = new EvaluationContext(observe(s, 0)); assert.ok(ctx.targetEffect('nanman', 1) < 0);
  const rank = policy.rank(observe(s, 0), decision(s)!); assert.ok(rank.find(o => o.id === legalActions(s).find(o => o.data?.type === 'play' && o.data.cid === nanman)!.id)!.score < before); assert.equal(pick(s).type, 'endPlay');
});

test('乱武若能直接杀死低手牌主公，反贼愿意发动；内奸不会为此冒主公死亡风险', () => {
  for (const role of ['rebel', 'renegade']) { const x = scene(5, 'standard', true); x.general(2, 'forest.jiaxu'); x.f.state.mode.roles[2] = role; x.f.state.players[0].hp = 1;
    const a = pick(x.start(2)); assert.equal(a.type === 'activeSkill' && a.ability === 'forest.luanwu', role === 'rebel'); }
});

test('新增评分仍不因敌人暗牌面或隐藏身份变动而改变，结果确定可复现', () => {
  const x = scene(5, 'standard', true); x.general(1, 'forest.jiaxu'); const secret = x.f.hand(2, 'sha'); const s = x.start(1);
  const before = policy.rank(observe(s, 1), decision(s)!); s.cards[secret].name = 'tao'; s.cards[secret].rank = 13; s.mode.roles[4] = 'rebel';
  assert.deepEqual(policy.rank(observe(s, 1), decision(s)!), before);
});
