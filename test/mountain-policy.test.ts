import test from 'node:test';
import assert from 'node:assert/strict';
import { mountainScene as scene } from './support/mountain-scenario.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import type { GameState } from '../src/domain/state.ts';
import { openContentChoice } from '../src/rules/flows/content-choice-flow.ts';
const policy = new StrategicPolicy();
const pick = (s: GameState) => legalActions(s).find(o => o.id === policy.choose(observe(s, decision(s)!.actor), decision(s)!))!.data!;
const reveal = (s: GameState) => { for (const p of s.players) s.mode.knownTo[p.id] = s.players.map(p => p.id); };
test('AI没有额外基本牌时不浪费杀打刘禅，有低成本基本牌时可以进攻', () => {
  for (const extra of [false, true]) { const x = scene(); x.general(1, 'mountain.liushan'); x.f.hand(0, 'sha'); if (extra) x.f.hand(0, 'sha'); const a = pick(x.start()); assert.equal(a.type === 'play', extra); }
});
test('挑衅AI选缺牌敌人，低血无闪面对多手牌敌人避免被反杀', () => {
  const x = scene(); x.general(0, 'mountain.jiangwei'); x.f.equip(1, 'bagua', 'armor'); assert.equal(pick(x.start()).type, 'activeSkill');
  const y = scene(); y.general(0, 'mountain.jiangwei'); y.f.state.players[0].hp = 1; for (let i = 0; i < 6; i++) y.f.hand(1, 'sha'); assert.equal(pick(y.start()).type, 'endPlay');
});
test('巧变AI空判定不跳，乐不思蜀用低成本牌跳判定', () => {
  for (const danger of [false, true]) { const x = scene(); x.general(0, 'mountain.zhanghe'); x.f.hand(0, 'sha'); if (danger) x.f.state.players[0].judge.push(x.f.take('lebu'));
    const a = pick(x.tasks({kind: 'phaseBefore', phase: 'judge'})); assert.equal(a.type, danger ? 'choose' : 'pass'); }
});
test('巧变AI不以唯一桃换摸牌，弃牌溢出多时愿意跳过', () => {
  const x = scene(); x.general(0, 'mountain.zhanghe'); x.f.state.players[0].hp = 1; x.f.hand(0, 'tao'); x.f.hand(1, 'sha'); assert.equal(pick(x.tasks({kind: 'phaseBefore', phase: 'draw'})).type, 'pass');
  const y = scene(); y.general(0, 'mountain.zhanghe'); y.f.state.players[0].hp = 1; for (let i = 0; i < 5; i++) y.f.hand(0, 'sha'); assert.equal(pick(y.tasks({kind: 'phaseBefore', phase: 'discard'})).type, 'choose');
});
test('放权AI给装备手牌充足的友方，双人敌对局正常出牌', () => {
  const x = scene(5, 'standard', true); x.general(1, 'mountain.liushan'); x.f.state.active = 1; reveal(x.f.state); x.f.hand(1, 'shan'); for (let i = 0; i < 4; i++) x.f.hand(0, 'sha');
  let s = x.tasks({kind: 'phaseBefore', phase: 'play'}, {kind: 'phaseEnd'}); assert.ok(pick(s).type === 'choose'); s = x.choose(s, a => a.type === 'choose'); assert.equal(pick(s).type, 'yes');
  s = x.choose(s, a => a.type === 'yes'); s = x.choose(s, a => a.type === 'choose'); const a = pick(s); assert.ok(a.type === 'choose' && 'targets' in a && a.targets[0] === 0);
  const y = scene(); y.general(0, 'mountain.liushan'); y.f.hand(0, 'shan'); assert.equal(pick(y.tasks({kind: 'phaseBefore', phase: 'play'})).type, 'pass');
});
test('志继AI一血先回血，有足够体力优先补牌', () => {
  for (const hp of [1, 3]) { const x = scene(); x.general(0, 'mountain.jiangwei'); x.f.state.players[0].hp = hp; const a = pick(x.tasks({kind: 'phaseStart'})); assert.ok(a.type === 'choose' && a.choice === (hp === 1 ? 'recover' : 'draw')); }
});
test('直谏AI给友方补装备，不给敌人武器', () => {
  const x = scene(5, 'standard', true); x.general(1, 'mountain.zhangzhaozhanghong'); reveal(x.f.state); x.f.equip(1, 'bagua', 'armor'); x.f.hand(1, 'bagua'); const a = pick(x.start(1)); assert.ok(a.type === 'activeSkill' && a.targets[0] === 0);
  const y = scene(); y.general(0, 'mountain.zhangzhaozhanghong'); y.f.hand(0, 'zhuge'); assert.ok(pick(y.start()).type !== 'activeSkill');
});
test('固政AI收余牌，向敌人归还较低价值牌', () => {
  const x = scene(); x.general(1, 'mountain.zhangzhaozhanghong'); x.f.state.players[0].hp = 1; const a = x.f.hand(0, 'sha'), b = x.f.hand(0, 'tao'); x.f.hand(0, 'shan');
  let s = x.tasks({kind: 'phaseBefore', phase: 'discard'}, {kind: 'phaseDiscard'}, {kind: 'phaseAfter', phase: 'discard'}); s = x.choose(s, d => d.type === 'discard' && d.cid === a); s = x.choose(s, d => d.type === 'discard' && d.cid === b);
  const act = pick(s); assert.ok(act.type === 'choose' && 'ids' in act && act.ids[0] === a);
});
test('悲歌AI低成本救友抑敌，不为敌人付出唯一桃', () => {
  const x = scene(5, 'standard', true); x.general(1, 'mountain.caiwenji'); reveal(x.f.state); x.f.state.players[0].hp = 2; x.f.hand(1, 'shandian'); x.f.hand(2, 'sha');
  openContentChoice(x.f.state, 1, 'mountain.beige', {timing: 'cost', target: 0, source: 2}); assert.equal(pick(x.advance(x.f.state)).type, 'choose');
  const y = scene(); y.general(0, 'mountain.caiwenji'); y.f.hand(0, 'tao'); openContentChoice(y.f.state, 0, 'mountain.beige', {timing: 'cost', target: 1, source: 0}); assert.equal(pick(y.advance(y.f.state)).type, 'pass');
});
test('AI击杀蔡文姬会计入断肠损失，已无武将技能时不重复罚分', () => {
  const x = scene(5, 'standard', true); reveal(x.f.state); x.general(0, 'standard.zhangfei'); x.general(2, 'mountain.caiwenji'); x.f.state.players[2].hp = 1; const sha = x.f.hand(0, 'sha');
  const before = new EvaluationContext(observe(x.f.state, 0)).shaEffect(2, [sha]); x.f.state.players[0].generalSkillsDisabled = true;
  assert.ok(new EvaluationContext(observe(x.f.state, 0)).shaEffect(2, [sha]) > before);
});
test('化身AI一血选择不屈，换化身时不会无收益反复切换', () => {
  const x = scene(); x.general(0, 'mountain.zuoci'); x.f.state.players[0].hp = 1; x.f.state.players[0].huashen = {generals: ['standard.guanyu', 'wind.zhoutai']};
  openContentChoice(x.f.state, 0, 'mountain.huashen', {timing: 'initial'}); let s = x.advance(x.f.state); const a = pick(s); assert.ok(a.type === 'choose' && a.choice === 'avatar:wind.zhoutai:wind.buqu');
  s = x.choose(s, d => d.type === 'choose' && d.choice === 'avatar:wind.zhoutai:wind.buqu'); openContentChoice(s, 0, 'mountain.huashen', {timing: 'change'}); assert.equal(pick(x.advance(s)).type, 'pass');
});
test('田的距离和急袭牌值由公开牌区计算，隐藏化身池及暗牌变化不改AI决策', () => {
  const x = scene(5, 'standard', true); x.general(1, 'mountain.dengai'); const field = x.f.take('sha'); x.f.state.players[1].piles = {'mountain.tuntian': [field]}; x.f.state.players[1].gainedAbilities = ['mountain.jixi']; const hidden = x.f.hand(2, 'shan'); x.general(3, 'mountain.zuoci'); x.f.state.players[3].huashen = {generals: ['standard.guanyu']};
  const s = x.start(1), ctx = new EvaluationContext(observe(s, 1)); assert.equal(ctx.distance(1, 3), 1); assert.ok(ctx.value(field) > 0);
  const before = policy.rank(observe(s, 1), decision(s)!); s.cards[hidden].name = 'tao'; s.players[3].huashen!.generals = ['standard.zhenji']; s.mode.roles[4] = 'loyalist'; assert.deepEqual(policy.rank(observe(s, 1), decision(s)!), before);
});
test('AI对化身借用雷击保留反击判断，断肠后不再计雷击风险', () => {
  const x = scene(); x.general(1, 'mountain.zuoci'); for (let i = 0; i < 4; i++) x.f.hand(1, 'shan'); const sha = x.f.hand(0, 'sha');
  const plain = new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]); x.f.state.players[1].gainedAbilities = ['wind.leiji'];
  const leiji = new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]); assert.ok(leiji < plain);
  x.f.state.players[1].generalSkillsDisabled = true; assert.equal(new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]), plain);
});
test('断肠后的吕蒙AI不再为已失去的克己放弃出殺', () => {
  const x = scene(); x.general(0, 'standard.lvmeng'); x.f.hand(0, 'sha');
  assert.equal(pick(x.start()).type, 'endPlay'); x.f.state.players[0].generalSkillsDisabled = true;
  assert.equal(pick(x.start()).type, 'play');
});
