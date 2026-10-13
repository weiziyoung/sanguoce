import test from 'node:test';
import assert from 'node:assert/strict';
import { mountainScene as scene } from './support/mountain-scenario.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { openContentChoice } from '../src/rules/flows/content-choice-flow.ts';
import type { GameState } from '../src/domain/state.ts';

const policy = new StrategicPolicy();
const reveal = (s: GameState) => { for (const p of s.players) s.mode.knownTo[p.id] = s.players.map(p => p.id); };
const pick = (s: GameState) => legalActions(s).find(o => o.id === policy.choose(observe(s, decision(s)!.actor), decision(s)!))!.data!;
const ranks = (s: GameState) => policy.rank(observe(s, decision(s)!.actor), decision(s)!);

test('享乐实际费用选择多余杀而非一血唯一桃，只有桃时可放弃杀', () => {
  for (const extra of [true, false]) {
    const x = scene(); x.general(1, 'mountain.liushan'); x.f.state.players[0].hp = 1;
    const sha = x.f.hand(0, 'sha'), tao = x.f.hand(0, 'tao'), fee = extra ? x.f.hand(0, 'sha') : null;
    let s = x.choose(x.start(), a => a.type === 'play' && a.cid === sha);
    const a = pick(s); assert.equal(a.type, extra ? 'choose' : 'pass');
    if (extra) assert.ok(a.type === 'choose' && 'ids' in a && a.ids[0] === fee);
    s = x.choose(s, d => d.type === a.type && ('choice' in d ? d.choice === ('choice' in a ? a.choice : '') : true));
    assert.ok(s.players[0].hand.includes(tao));
  }
});
test('享乐识别黑杀被仁王盾抵挡而不追加费用，酒杀仍保留实际增伤', () => {
  const x = scene(); x.general(1, 'mountain.liushan'); x.f.equip(1, 'renwang', 'armor');
  const sha = x.f.hand(0, 'sha', 'spade'); x.f.hand(0, 'sha');
  const s = x.choose(x.start(), a => a.type === 'play' && a.cid === sha); assert.equal(pick(s).type, 'pass');
  const y = scene(2, 'junzheng'); y.general(1, 'mountain.liushan'); y.f.state.players[1].hp = 2;
  const wine = y.f.hand(0, 'jiu'), hit = y.f.hand(0, 'sha'); y.f.hand(0, 'sha');
  let t = y.choose(y.start(), a => a.type === 'play' && a.cid === wine); t = y.choose(t, a => a.type === 'play' && a.cid === hit);
  assert.equal(pick(t).type, 'choose');
});
test('断肠不阻止击杀最后一名已知反贼获胜，未知身份不会被当作已获胜', () => {
  const x = scene(5, 'standard', true); x.general(0, 'standard.zhangfei'); x.general(2, 'mountain.caiwenji'); reveal(x.f.state);
  x.f.state.players[3].alive = false; x.f.state.players[4].alive = false; x.f.state.players[2].hp = 1; x.f.equip(0, 'qilin', 'weapon'); const sha = x.f.hand(0, 'sha');
  let s = x.start(); const a = pick(s); assert.ok(a.type === 'play' && a.targets[0] === 2);
  const known = new EvaluationContext(observe(s, 0)).shaEffect(2, [sha]); s.mode.knownTo[1] = [1];
  assert.ok(new EvaluationContext(observe(s, 0)).shaEffect(2, [sha]) < known); reveal(s);
  s = x.passResponses(x.choose(s, d => d.type === 'play' && d.cid === sha && d.targets[0] === 2));
  while (decision(s)?.kind === 'dying') s = x.choose(s, a => a.type === 'pass');
  assert.ok(s.outcome.status === 'finished' && s.outcome.reason === 'opposition-eliminated');
});
test('放权不跳过一血桃回血，有便宜费用和有效友方时仍能发动', () => {
  const x = scene(5, 'standard', true); x.general(1, 'mountain.liushan'); reveal(x.f.state); x.f.state.active = 1;
  x.f.state.players[1].hp = 1; x.f.hand(1, 'tao'); for (let i = 0; i < 6; i++) x.f.hand(0, 'sha');
  assert.equal(pick(x.tasks({kind: 'phaseBefore', phase: 'play'})).type, 'pass');
});
test('放权到结束阶段重新核对唯一救命桃的费用，可以不赠回合', () => {
  const x = scene(5, 'standard', true); x.general(1, 'mountain.liushan'); reveal(x.f.state); x.f.state.active = 1; x.f.state.players[1].hp = 1;
  x.f.hand(1, 'tao'); for (let i = 0; i < 4; i++) x.f.hand(0, 'sha');
  x.f.state.turnMarks = [{ owner: 1, ability: 'mountain.fangquan', turn: x.f.state.turn }];
  assert.equal(pick(x.tasks({kind: 'phaseEnd'})).type, 'no');
});
test('固政向一血友方主公归还桃，对敌方仍归还较低价值杀', () => {
  for (const friend of [true, false]) {
    const x = scene(5, 'standard', true); x.general(1, 'mountain.zhangzhaozhanghong'); reveal(x.f.state); if (!friend) x.f.state.mode.roles[1] = 'rebel';
    x.f.state.players[0].hp = 1; const sha = x.f.hand(0, 'sha'), tao = x.f.hand(0, 'tao'); x.f.hand(0, 'shan');
    let s = x.tasks({kind: 'phaseBefore', phase: 'discard'}, {kind: 'phaseDiscard'}, {kind: 'phaseAfter', phase: 'discard'});
    s = x.choose(s, a => a.type === 'discard' && a.cid === sha); s = x.choose(s, a => a.type === 'discard' && a.cid === tao);
    const a = pick(s); assert.ok(a.type === 'choose' && 'ids' in a && a.ids[0] === (friend ? tao : sha));
  }
});
test('制霸不以唯一K牌送牌，富余低点牌可以送主公且不读取暗牌点数', () => {
  const x = scene(5, 'standard', true); x.general(0, 'mountain.sunce'); x.general(1, 'standard.sunquan'); reveal(x.f.state);
  const high = x.f.hand(1, 'sha'); x.f.state.cards[high].rank = 13; const hidden = x.f.hand(0, 'shan');
  let s = x.start(1); assert.ok(ranks(s).find(o => o.id.includes('mountain.zhiba.offer'))!.score < 0);
  const low = x.f.hand(1, 'shandian'); x.f.state.cards[low].rank = 1; for (let i = 0; i < 3; i++) x.f.hand(1, 'wuxie');
  s = x.start(1); const before = ranks(s); assert.ok(before.find(o => o.id.includes('mountain.zhiba.offer'))!.score > 0);
  s.cards[hidden].rank = 13; s.cards[hidden].name = 'tao'; assert.deepEqual(ranks(s), before);
  s = x.choose(s, a => a.type === 'activeSkill' && a.ability === 'mountain.zhiba.offer');
  const a = pick(s); assert.ok(a.type === 'pindian' && a.cid === low);
});
test('化身准备阶段识别武圣的实际收尾机会，结束阶段选择转化闪防守', () => {
  const x = scene(); x.general(0, 'mountain.zuoci'); x.f.state.players[1].hp = 1;
  x.f.state.players[0].huashen = {generals: ['standard.guanyu','standard.diaochan'], selected: 'standard.diaochan', ability: 'standard.biyue'};
  x.f.state.players[0].gainedAbilities = ['standard.biyue']; x.f.hand(0, 'shan', 'heart');
  openContentChoice(x.f.state, 0, 'mountain.huashen', {timing: 'start'}); const s = x.advance(x.f.state), a = pick(s);
  assert.ok(a.type === 'choose' && a.choice === 'avatar:standard.guanyu:standard.wusheng');
  const y = scene(); y.general(0, 'mountain.zuoci'); y.f.state.phase = 'end'; y.f.state.players[0].huashen = {generals: ['standard.guanyu','standard.zhenji']};
  y.f.hand(0, 'sha', 'spade'); y.f.hand(0, 'sha', 'club'); openContentChoice(y.f.state, 0, 'mountain.huashen', {timing: 'end'});
  const end = pick(y.advance(y.f.state)); assert.ok(end.type === 'choose' && end.choice === 'avatar:standard.zhenji:standard.qingguo');
});
test('回合外拆邓艾计屯田收益，已有两田时更加谨慎且断肠后消失', () => {
  const x = scene(); x.general(1, 'mountain.dengai'); x.f.hand(1, 'shan');
  const plain = new EvaluationContext(observe(x.f.state, 0)).targetEffect('guohe', 1);
  x.f.state.players[1].piles = {'mountain.tuntian': [x.f.take('sha'), x.f.take('sha')]};
  const ready = new EvaluationContext(observe(x.f.state, 0)).targetEffect('guohe', 1); assert.ok(ready < plain);
  x.f.state.players[1].generalSkillsDisabled = true; assert.ok(new EvaluationContext(observe(x.f.state, 0)).targetEffect('guohe', 1) > plain);
});
test('巧变考虑装备离场收益，能给友方移走白银回血', () => {
  const x = scene(5, 'junzheng', true); x.general(1, 'mountain.zhanghe'); reveal(x.f.state); x.f.state.players[0].hp = 2;
  const armor = x.f.equip(0, 'baiyin', 'armor');
  openContentChoice(x.f.state, 1, 'mountain.qiaobian', {timing: 'move'});
  const s = x.advance(x.f.state); assert.ok(ranks(s).find(r => r.id.endsWith(`move:${armor}:0:1`))!.score > 0);
});
test('急袭使用末田失去后续距离时更保守，两田消耗一田仍可保留距离', () => {
  const x = scene(5, 'standard', true); x.general(0, 'mountain.dengai'); reveal(x.f.state);
  x.f.state.players[0].gainedAbilities = ['mountain.jixi']; x.f.hand(2, 'shan'); x.f.hand(3, 'sha');
  const field = x.f.take('sha'); x.f.state.players[0].piles = {'mountain.tuntian': [field]};
  let s = x.start();
  const option = legalActions(s).find(o => o.data?.type === 'virtualTrick' && o.data.transformation === 'mountain.jixi' && o.data.ids[0] === field && o.data.targets[0] === 2)!;
  const one = ranks(s).find(o => o.id === option.id)!.score;
  x.f.state.players[0].piles!['mountain.tuntian'].push(x.f.take('sha')); s = x.start();
  assert.ok(ranks(s).find(o => o.id === option.id)!.score > one);
});
test('制霸选低点时仍保护唯一救命桃，保留便宜低点杀送牌', () => {
  const x = scene(5, 'standard', true); x.general(0, 'mountain.sunce'); x.general(1, 'standard.sunquan'); reveal(x.f.state);
  x.f.state.players[1].hp = 1; const tao = x.f.hand(1, 'tao'); x.f.state.cards[tao].rank = 1;
  const low = x.f.hand(1, 'sha'); x.f.state.cards[low].rank = 3; x.f.hand(1, 'wuxie'); x.f.hand(0, 'sha');
  let s = x.start(1); s = x.choose(s, a => a.type === 'activeSkill' && a.ability === 'mountain.zhiba.offer');
  const a = pick(s); assert.ok(a.type === 'pindian' && a.cid === low);
});
