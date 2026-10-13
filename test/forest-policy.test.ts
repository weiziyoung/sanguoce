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

test('再起AI失血两点且缺手牌时正常摸牌，有储备或失血更多时再起', () => {
  for (const [hp, count, type] of [[3, 2, 'normal'], [2, 0, 'normal'], [2, 1, 'normal'], [2, 2, 'skill'], [1, 0, 'skill']] as const) {
    const x = scene(); x.general(0, 'forest.menghuo'); x.f.state.players[0].hp = hp;
    for (let i = 0; i < count; i++) x.f.hand(0, 'sha');
    assert.equal(pick(x.tasks({ kind: 'phaseDraw' })).type, type);
  }
});

test('好施AI优先给最少牌友方，最少牌者都是敌方时不强行分牌', () => {
  for (const friend of [true, false]) { const x = scene(5, 'standard', true); x.general(1, 'forest.lusu'); x.f.state.active = 1;
    for (let i = 0; i < 3; i++) x.f.hand(1, 'sha'); for (const id of friend ? [2,3,4] : [0,3,4]) x.f.hand(id, 'shan');
    const a = pick(x.tasks({ kind: 'phaseDraw' })); assert.equal(a.type, friend ? 'skill' : 'normal'); }
});

test('缔盟AI愿意支付低价值牌给缺牌友方换来敌方大手牌，费用数量与目标一致', () => {
  const x = scene(5, 'standard', true); x.general(1, 'forest.lusu'); x.f.state.mode.knownTo[2] = [0, 1, 2, 3, 4]; for (let i = 0; i < 4; i++) x.f.hand(2, 'shan');
  for (let i = 0; i < 4; i++) x.f.hand(1, 'sha'); x.f.hand(1, 'tao');
  let s = x.start(1); let a = pick(s); assert.equal(a.type, 'beginSkill');
  s = x.rules.apply(s, policy.choose(observe(s, 1), decision(s)!));
  for (let i = 0; i < 4; i++) { a = pick(s); assert.equal(a.type, 'toggle'); s = x.rules.apply(s, policy.choose(observe(s, 1), decision(s)!)); }
  assert.equal(pick(s).type, 'confirm'); s = x.rules.apply(s, policy.choose(observe(s, 1), decision(s)!));
  a = pick(s); assert.equal(a.type, 'select'); if (a.type === 'select') assert.deepEqual(a.targets, [0, 2]);
});

test('放逐AI优先帮助背面友方翻回正面，英魂优先让友方摸多弃少', () => {
  const x = scene(5, 'standard', true); x.general(1, 'forest.caopi'); x.f.state.players[0].faceDown = true; damage(x.f.state, 1, 2); let s = x.advance(x.f.state);
  assert.equal(pick(s).type, 'yes'); s = x.choose(s, d => d.type === 'yes'); const a = pick(s); assert.ok(a.type === 'choose' && 'targets' in a && a.targets[0] === 0);
  const y = scene(5, 'standard', true); y.general(1, 'forest.sunjian'); y.f.state.active = 1; y.f.state.players[1].hp = 1;
  s = y.tasks({ kind: 'phaseStart' }); s = y.choose(s, d => d.type === 'yes'); const b = pick(s); assert.ok(b.type === 'choose' && b.choice === 'help:0');
});

test('烈刃AI高点手牌才向敌人发起拼点，发动后选择高点牌', () => {
  const x = scene(); x.general(0, 'forest.zhurong'); const attack = x.f.hand(0, 'sha'), point = x.f.hand(0, 'shan'); x.f.state.cards[point].rank = 13; x.f.hand(1, 'sha'); x.f.hand(1, 'sha');
  let s = x.passResponses(x.choose(x.start(), d => d.type === 'play' && d.cid === attack)); assert.equal(pick(s).type, 'yes');
  s = x.choose(s, d => d.type === 'yes'); const a = pick(s); assert.ok(a.type === 'pindian' && a.cid === point);
});

test('酒池AI保留后续有效杀时才喝酒，低血崩坏优先减上限', () => {
  for (const armed of [false, true]) { const x = scene(); x.general(0, 'forest.dongzhuo'); x.f.hand(0, 'guohe', 'spade'); if (armed) x.f.hand(0, 'sha', 'heart');
    const a = pick(x.start()); assert.equal(a.type === 'virtualBasic', armed); }
  const x = scene(); x.general(0, 'forest.dongzhuo'); x.f.state.players[0].hp = 2; x.f.state.players[1].hp = 1;
  const a = pick(x.tasks({ kind: 'phaseEnd' })); assert.ok(a.type === 'choose' && a.choice === 'maxHp');
});

test('乱武AI在敌人无杀时会发动，响应选择攻击敌人避免无谓失血', () => {
  const x = scene(); x.general(0, 'forest.jiaxu'); assert.equal(pick(x.start()).type, 'activeSkill');
  const y = scene(5, 'standard', true); y.general(0, 'forest.jiaxu'); y.f.hand(2, 'sha');
  const s = y.choose(y.start(), d => d.type === 'activeSkill' && d.ability === 'forest.luanwu');
  const a = pick(s); assert.ok(a.type === 'choose' && a.choice === 'loseHp');
});

test('肉林提高对女性命中估计，南蛮计入林将免疫，AI不读取对手手牌面或隐藏身份', () => {
  const x = scene(); const sha = x.f.hand(0, 'sha'); x.f.hand(1, 'shan'); const ordinary = new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]);
  x.general(0, 'forest.dongzhuo'); const doubled = new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]); assert.ok(doubled > ordinary);
  x.general(1, 'forest.menghuo'); assert.equal(new EvaluationContext(observe(x.f.state, 0)).targetEffect('nanman', 1), 0);
  const y = scene(5, 'standard', true); y.general(1, 'forest.lusu'); for (let i = 0; i < 3; i++) y.f.hand(1, 'sha'); const secret = y.f.hand(2, 'shan');
  const s = y.start(1); const before = policy.rank(observe(s, 1), decision(s)!); s.cards[secret].name = 'tao'; s.mode.roles[4] = 'rebel';
  assert.deepEqual(policy.rank(observe(s, 1), decision(s)!), before);
});
