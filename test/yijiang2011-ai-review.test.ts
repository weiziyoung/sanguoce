import test from 'node:test';
import assert from 'node:assert/strict';
import { yijiangScene as scene, conserved } from './support/yijiang2011-scenario.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { openContentChoice } from '../src/rules/flows/content-choice-flow.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { ganluValue } from '../src/policies/content/yijiang2011-plan.ts';
import type { GameState } from '../src/domain/state.ts';

const policy = new StrategicPolicy();
const reveal = (s: GameState) => { for (const p of s.players) s.mode.knownTo[p.id] = s.players.map(p => p.id); };
const ranked = (s: GameState) => policy.rank(observe(s, decision(s)!.actor), decision(s)!);
const pick = (s: GameState) => legalActions(s).find(a => a.id === ranked(s)[0].id)!.data!;

test('毅重于禁保留空防具栏，断肠后恢复正常装备防具', () => {
  const x = scene(); x.general(0, 'yijiang2011.yujin'); const armor = x.f.hand(0, 'bagua');
  let s = x.start(); assert.equal(pick(s).type, 'endPlay');
  s.players[0].generalSkillsDisabled = true;
  const a = pick(s); assert.ok(a.type === 'play' && a.cid === armor);
});
test('举荐优先三张无言下的进攻锦囊并回血，保留唯一桃闪', () => {
  const x = scene(5, 'standard', true); x.general(1, 'yijiang2011.xushu'); reveal(x.f.state); x.f.state.players[1].hp = 2;
  const tao = x.f.hand(1, 'tao'), shan = x.f.hand(1, 'shan');
  const junk = ['guohe', 'nanman', 'juedou'].map(n => x.f.hand(1, n));
  let s = x.choose(x.start(1), a => a.type === 'beginSkill' && a.ability === 'yijiang2011.jujian');
  for (let i = 0; i < 6 && decision(s)?.kind === 'skillCost'; i++) s = x.rules.apply(s, ranked(s)[0].id);
  assert.equal(decision(s)?.kind, 'skillTarget'); s = x.rules.apply(s, ranked(s)[0].id);
  assert.ok(junk.every(id => s.discard.includes(id))); assert.ok(s.players[1].hand.includes(tao)); assert.ok(s.players[1].hand.includes(shan));
  assert.equal(s.players[1].hp, 3); assert.equal(s.players[0].hand.length, 3); conserved(s);
});
test('举荐不因凑三张就消耗一血时的唯一桃闪', () => {
  const x = scene(5, 'standard', true); x.general(1, 'yijiang2011.xushu'); reveal(x.f.state); x.f.state.players[1].hp = 1;
  x.f.hand(1, 'tao'); x.f.hand(1, 'shan');
  const s = x.start(1); assert.ok(ranked(s).find(r => r.id.includes('jujian'))!.score < 0);
});
test('眩惑没有第三名友方时保留红桃，不给敌人白送牌', () => {
  const x = scene(5, 'standard', true); x.general(1, 'yijiang2011.fazheng'); x.f.state.mode.roles[1] = 'renegade';
  x.f.state.players[0].alive = false; reveal(x.f.state); x.f.hand(1, 'sha', 'heart');
  const s = x.start(1); assert.ok(ranked(s).filter(r => r.id.includes('xuanhuo')).every(r => r.score < 0));
});
test('陷阵选择Q闪拼点并留下K杀，胜后真正打出该杀', () => {
  const x = scene(); x.general(0, 'yijiang2011.gaoshun');
  const sha = x.f.hand(0, 'sha'), bid = x.f.hand(0, 'shan'); x.f.state.cards[sha].rank = 13; x.f.state.cards[bid].rank = 12; x.f.hand(1, 'shan');
  let s = x.choose(x.start(), a => a.type === 'activeSkill' && a.ability === 'yijiang2011.xianzhen');
  const a = pick(s); assert.ok(a.type === 'pindian' && a.cid === bid);
  s = x.rules.apply(s, ranked(s)[0].id); s = x.choose(s, a => a.type === 'pindian');
  const attack = pick(s); assert.ok(attack.type === 'play' && attack.cid === sha);
});
test('陷阵不会为无效黑杀向空甲于禁拼点', () => {
  const x = scene(); x.general(0, 'yijiang2011.gaoshun'); x.general(1, 'yijiang2011.yujin');
  const bid = x.f.hand(0, 'shan'); x.f.state.cards[bid].rank = 13; x.f.hand(0, 'sha', 'club'); x.f.hand(1, 'shan');
  assert.equal(pick(x.start()).type, 'endPlay');
});
test('陷阵仅有一张高点杀时，不把唯一进攻牌拿去拼点', () => {
  const x = scene(); x.general(0, 'yijiang2011.gaoshun'); const sha = x.f.hand(0, 'sha'); x.f.state.cards[sha].rank = 13; x.f.hand(1, 'shan');
  const a = pick(x.start()); assert.ok(a.type === 'play' && a.cid === sha);
});
test('陷阵公开距离与引擎一致，过期或失去技能后失效', () => {
  const x = scene(5); x.general(0, 'yijiang2011.gaoshun'); x.f.state.players[0].skillState = {'yijiang2011.xianzhen': {turn: x.f.state.turn, won: true, target: 2}};
  assert.equal(new EvaluationContext(observe(x.f.state, 0)).distance(0, 2), 1);
  x.f.state.players[0].generalSkillsDisabled = true;
  assert.equal(new EvaluationContext(observe(x.f.state, 0)).distance(0, 2), 2);
  x.f.state.players[0].generalSkillsDisabled = false; x.f.state.turn++;
  assert.equal(new EvaluationContext(observe(x.f.state, 0)).distance(0, 2), 2);
});
test('陷阵目标的暗牌点数和名称不影响评分', () => {
  const x = scene(); x.general(0, 'yijiang2011.gaoshun'); const bid = x.f.hand(0, 'shan'); x.f.state.cards[bid].rank = 13; x.f.hand(0, 'sha');
  const hidden = x.f.hand(1, 'shan'); const s = x.start(); const before = ranked(s);
  s.cards[hidden].rank = 13; s.cards[hidden].name = 'tao'; assert.deepEqual(ranked(s), before);
});
test('酒诗有实体酒时先用实体酒，避免翻面跳过下回合', () => {
  const x = scene(2, 'junzheng'); x.general(0, 'yijiang2011.caozhi'); x.f.state.players[1].hp = 2;
  const wine = x.f.hand(0, 'jiu'); x.f.hand(0, 'sha'); const a = pick(x.start()); assert.ok(a.type === 'play' && a.cid === wine);
});
test('酒诗连弩多杀时保留连续进攻，不为普通增伤翻面', () => {
  const x = scene(); x.general(0, 'yijiang2011.caozhi'); x.f.equip(0, 'zhuge', 'weapon'); x.f.hand(0, 'sha'); x.f.hand(0, 'sha');
  const a = pick(x.start()); assert.ok(a.type === 'play');
});
test('破军不让三血正面敌人摸三张，三血友方可补牌', () => {
  for (const friend of [false, true]) {
    const x = scene(5, 'standard', true); x.general(1, 'yijiang2011.xusheng'); reveal(x.f.state); const target = friend ? 0 : 2;
    x.f.state.players[target].hp = 4;
    damage(x.f.state, target, 1, 1, null, {name:'sha', suit:null, virtual:true}); x.advance(x.f.state);
    assert.equal(pick(x.f.state).type, friend ? 'yes' : 'no');
  }
});
test('甘露装备等值时仍能交换友方白银狮子治疗', () => {
  const x = scene(5, 'junzheng', true); x.general(0, 'yijiang2011.wuguotai'); reveal(x.f.state);
  x.f.state.players[1].hp = 2; x.f.equip(1, 'baiyin', 'armor'); x.f.equip(0, 'bagua', 'armor');
  const s = x.start(); const a = pick(s); assert.ok(a.type === 'activeSkill' && a.ability === 'yijiang2011.ganlu' && a.targets.includes(1));
});
test('甘露不把敌方白银离场回血当成己方收益', () => {
  const x = scene(2, 'junzheng'); x.general(0, 'yijiang2011.wuguotai'); x.f.state.players[1].hp = 2;
  x.f.equip(1, 'baiyin', 'armor'); x.f.equip(0, 'bagua', 'armor');
  assert.ok(ganluValue(new EvaluationContext(observe(x.f.state, 0)), 0, 1) < 0);
});
test('甘露计算敌方凌统失装备后的反击代价', () => {
  const x = scene(); x.general(0, 'yijiang2011.wuguotai'); x.general(1, 'yijiang2011.lingtong');
  x.f.equip(1, 'qinggang', 'weapon'); x.f.equip(0, 'cixiong', 'weapon');
  const ctx = new EvaluationContext(observe(x.f.state, 0)); assert.ok(ganluValue(ctx, 0, 1) < 0);
});
test('凌统主动换等值装备发动旋风，随后选择直接伤害', () => {
  const x = scene(); x.general(0, 'yijiang2011.lingtong'); x.f.equip(0, 'cixiong', 'weapon'); const replacement = x.f.hand(0, 'hanbing'); x.f.hand(1, 'shan');
  let s = x.start(); const a = pick(s); assert.ok(a.type === 'play' && a.cid === replacement);
  s = x.rules.apply(s, ranked(s)[0].id); const follow = pick(s); assert.ok('choice' in follow && follow.choice === 'damage:1');
});
test('旋风直接伤害不被藤甲的普通杀免疫误导', () => {
  const x = scene(2, 'junzheng'); x.general(0, 'yijiang2011.lingtong'); x.f.equip(1, 'tengjia', 'armor');
  openContentChoice(x.f.state, 0, 'yijiang2011.xuanfeng', {timing:'effect'}); x.advance(x.f.state);
  const a = pick(x.f.state); assert.ok('choice' in a && a.choice === 'damage:1');
});
test('明策按收牌者武器选择杀的目标，避开无法伤害的藤甲', () => {
  for (const weapon of ['qilin', 'qinggang']) {
    const x = scene(5, 'junzheng', true); x.general(1, 'yijiang2011.chengong'); reveal(x.f.state); x.f.equip(0, weapon, 'weapon');
    x.f.equip(2, 'tengjia', 'armor'); x.f.state.players[2].hp = 1;
    openContentChoice(x.f.state, 1, 'yijiang2011.mingce', {timing:'target', target:0}); x.advance(x.f.state);
    const a = pick(x.f.state); assert.ok('choice' in a && a.choice === `target:${weapon === 'qinggang' ? 2 : 3}`);
  }
});
test('击杀马谡计入挥泪损失，直接获胜时不因挥泪放弃击杀', () => {
  const x = scene(5, 'standard', true); x.general(2, 'yijiang2011.masu'); reveal(x.f.state); x.f.state.players[2].hp = 1;
  const sha = x.f.hand(1, 'sha'); x.f.hand(1, 'tao'); x.f.hand(1, 'shan'); x.f.equip(1, 'qilin', 'weapon');
  const penalty = new EvaluationContext(observe(x.f.state, 1)).shaEffect(2, [sha]); x.general(2, 'standard.sunquan'); x.f.state.players[2].hp = 1;
  assert.ok(new EvaluationContext(observe(x.f.state, 1)).shaEffect(2, [sha]) > penalty);
  const y = scene(); y.general(1, 'yijiang2011.masu'); y.f.state.players[1].hp = 1; const hit = y.f.hand(0, 'sha'); y.f.hand(0, 'tao');
  const a = pick(y.start()); assert.ok(a.type === 'play' && a.cid === hit);
});
test('攻击法正计入恩怨，绝情绕过恩怨代价', () => {
  const x = scene(); x.general(1, 'yijiang2011.fazheng'); x.f.state.players[0].hp = 1; const sha = x.f.hand(0, 'sha', 'club');
  const ordinary = new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]);
  x.general(0, 'yijiang2011.zhangchunhua'); x.f.state.players[0].hp = 1;
  assert.ok(new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]) > ordinary);
});
test('攻击背面曹植考虑酒诗翻回收益，绝情不帮其翻回', () => {
  const x = scene(); x.general(1, 'yijiang2011.caozhi'); x.f.state.players[1].faceDown = true; const sha = x.f.hand(0, 'sha');
  const down = new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]); x.f.state.players[1].faceDown = false;
  assert.ok(new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]) > down);
});

test('酒诗普通增伤不足抵翻面代价时先出杀，确定酒杀收尾时仍发动', () => {
  for (const hp of [2, 4]) {
    const x = scene(); x.general(0, 'yijiang2011.caozhi'); x.f.state.players[1].hp = hp; x.f.hand(0, 'sha');
    const a = pick(x.start()); assert.equal(a.type, hp === 2 ? 'virtualBasic' : 'play');
  }
});
test('伤逝补牌降低当前手牌费用，失去技能后不计该收益', () => {
  const x = scene(); x.general(0, 'yijiang2011.zhangchunhua'); x.f.state.players[0].hp = 1;
  const sha = x.f.hand(0, 'sha'); const s = x.start();
  const withDraw = ranked(s).find(r => r.id === `play:${sha}:1`)?.score ?? ranked(s).find(r => r.label.includes('杀'))!.score;
  s.players[0].generalSkillsDisabled = true;
  const without = ranked(s).find(r => r.id === `play:${sha}:1`)?.score ?? ranked(s).find(r => r.label.includes('杀'))!.score;
  assert.ok(withDraw > without);
});
test('绝情造成体力流失仍会触发目标伤逝，攻击评分继续计入其补牌', () => {
  const x = scene(); x.general(0, 'yijiang2011.zhangchunhua'); x.general(1, 'yijiang2011.zhangchunhua'); x.f.state.players[1].hp = 2;
  const sha = x.f.hand(0, 'sha');
  const refill = new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]);
  x.f.state.players[1].generalSkillsDisabled = true;
  assert.ok(new EvaluationContext(observe(x.f.state, 0)).shaEffect(1, [sha]) > refill);
});
test('明策目标评分不依赖收牌者暗牌内容或其他角色隐藏身份', () => {
  const x = scene(5, 'standard', true); x.general(1, 'yijiang2011.chengong'); x.f.equip(0, 'qilin', 'weapon');
  const hidden = x.f.hand(0, 'sha');
  openContentChoice(x.f.state, 1, 'yijiang2011.mingce', {timing:'target', target:0}); x.advance(x.f.state);
  const before = ranked(x.f.state); x.f.state.cards[hidden].name = 'tao'; x.f.state.cards[hidden].rank = 13;
  [x.f.state.mode.roles[2], x.f.state.mode.roles[4]] = [x.f.state.mode.roles[4], x.f.state.mode.roles[2]];
  assert.deepEqual(ranked(x.f.state), before);
});
