import test from 'node:test';
import assert from 'node:assert/strict';
import { mountainScene as scene, conserved } from './support/mountain-scenario.ts';
import { contentForCards, GENERAL_PACKS } from '../src/app/game-content.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { huashenSkills } from '../src/content/mountain/generals/zuoci.ts';
import { preparePlayScenario } from '../src/app/standard-game.ts';
import { GameEngine } from '../engine.ts';
const chosen = (choice: string) => (a: import('../src/domain/state.ts').ActionData) => 'choice' in a && a.choice === choice;

test('山包与风火林的32种组合注册，56将且不扩实体牌堆', () => {
  for (const cards of ['standard', 'junzheng'] as const) for (let mask = 0; mask < 16; mask++) {
    const packs = GENERAL_PACKS.filter((_, i) => mask & (1 << i)), content = contentForCards(cards, packs);
    assert.equal(content.generals().length, 25 + packs.reduce((n, p) => n + (p === 'wind' ? 7 : 8), 0));
    assert.equal(content.deck.length, cards === 'standard' ? 108 : 160); assert.equal(contentForCards(cards, [...packs].reverse()), content);
    assert.ok(!content.generals().some(g => g.label === '于吉'));
  }
});
for (const suit of ['heart', 'club']) test(`屯田在回合外响应失牌后判定，${suit}判定牌正确归属`, () => {
  const x = scene(); x.general(1, 'mountain.dengai'); const sha = x.f.hand(0, 'sha'), shan = x.f.hand(1, 'shan'); const judge = x.f.top('sha', suit);
  let s = x.choose(x.start(), a => a.type === 'play' && a.cid === sha); s = x.choose(s, a => a.type === 'respond' && a.ids[0] === shan);
  assert.equal(decision(s)?.kind, 'triggerConfirm'); s = x.choose(JSON.parse(JSON.stringify(s)), a => a.type === 'yes');
  assert.equal(s.players[1].piles?.['mountain.tuntian']?.includes(judge) ?? false, suit !== 'heart');
  assert.equal(s.discard.includes(judge), suit === 'heart'); assert.equal(s.players[1].hp, 4); conserved(s);
});
test('屯田自己回合失牌不判定，距离只影响自己向外', () => {
  const x = scene(5); x.general(0, 'mountain.dengai'); const c = x.f.hand(0, 'wuzhong'); const field = x.f.take('sha'); x.f.state.players[0].piles = { 'mountain.tuntian': [field] };
  assert.equal(x.runtime.queries.distance(x.f.state, 0, 2), 1); assert.equal(x.runtime.queries.distance(x.f.state, 2, 0), 2);
  const s = x.choose(x.start(), a => a.type === 'play' && a.cid === c); assert.equal(decision(s)?.kind, 'play'); assert.ok(!s.events.some(e => e.kind === 'judged')); conserved(s);
});
test('凿险自动且仅一次，急袭消耗真实田并保留花色与守恒', () => {
  const x = scene(); x.general(0, 'mountain.dengai'); const ids = [x.f.take('sha'), x.f.take('shan'), x.f.take('tao')]; x.f.state.players[0].piles = { 'mountain.tuntian': ids };
  x.f.hand(1, 'sha');
  let s = x.tasks({ kind: 'phaseStart' }); assert.equal(s.players[0].maxHp, 3); assert.ok(x.runtime.abilities.has(s, 0, 'mountain.jixi'));
  resolutionStack.enqueue(s, {kind: 'phaseStart'}); x.advance(s); assert.equal(s.players[0].maxHp, 3);
  const field = ids[0]; s = preparePlayScenario(s, 0, x.runtime);
  const cost = x.runtime.transforms.candidates(s, 0, 'shunshou').find(c => c.ids[0] === field)!; assert.equal(cost.effective.suit, s.cards[field].suit);
  s = x.choose(s, a => a.type === 'virtualTrick' && a.ids[0] === field); s = x.passResponses(s);
  s = x.choose(s, a => a.type === 'zone'); assert.equal(s.players[0].piles!['mountain.tuntian'].length, 2); assert.ok(s.discard.includes(field)); conserved(s);
});

test('巧变跳过判定保留延时锦囊，费用只能用手牌', () => {
  const x = scene(); x.general(0, 'mountain.zhanghe'); const cost = x.f.hand(0, 'sha'); x.f.equip(0, 'bagua', 'armor'); const lebu = x.f.take('lebu'); x.f.state.players[0].judge.push(lebu);
  let s = x.tasks({kind: 'phaseBefore', phase: 'judge'}, {kind: 'phaseJudge'});
  assert.equal(legalActions(s).filter(o => o.data?.type === 'choose').length, 1);
  s = x.choose(s, chosen(`cost:${cost}`)); assert.equal(decision(s), null); assert.ok(s.players[0].judge.includes(lebu)); assert.ok(!s.events.some(e => e.kind === 'judged')); conserved(s);
});
test('巧变跳摸牌可拿两名不同角色的暗牌，中途JSON恢复且不泄漏手牌', () => {
  const x = scene(5); x.general(0, 'mountain.zhanghe'); const cost = x.f.hand(0, 'sha'); const a = x.f.hand(1, 'shan'), b = x.f.hand(2, 'tao');
  let s = x.tasks({kind: 'phaseBefore', phase: 'draw'}, {kind: 'phaseDraw'}); s = x.choose(s, chosen(`cost:${cost}`));
  assert.ok(!JSON.stringify(decision(s)).includes(`"ids":[${a}]`)); s = x.choose(s, chosen('hand:1'));
  assert.ok(!legalActions(s).some(o => o.data?.type === 'choose' && o.data.choice === 'hand:1'));
  s = x.choose(JSON.parse(JSON.stringify(s)), chosen('hand:2')); assert.deepEqual(s.players[0].hand, [a, b]); assert.equal(decision(s), null); conserved(s);
});
for (const zone of ['equip', 'judge'] as const) test(`巧变移动${zone}到另一角色合法空位，原版移动不属于使用牌`, () => {
  const x = scene(5); x.general(0, 'mountain.zhanghe'); const cost = x.f.hand(0, 'sha');
  const card = zone === 'equip' ? x.f.equip(1, 'bagua', 'armor') : x.f.take('lebu'); if (zone === 'judge') x.f.state.players[1].judge.push(card);
  x.general(2, 'forest.jiaxu');
  let s = x.tasks({kind: 'phaseBefore', phase: 'play'}, {kind: 'phasePlay'}); s = x.choose(s, chosen(`cost:${cost}`)); s = x.choose(s, chosen(`move:${card}:1:2`));
  assert.equal(decision(s), null); assert.ok(zone === 'equip' ? s.players[2].equip.armor === card : s.players[2].judge.includes(card)); conserved(s);
});
test('巧变跳弃牌只支付一张手牌，仍能保留超过体力的手牌', () => {
  const x = scene(); x.general(0, 'mountain.zhanghe'); x.f.state.players[0].hp = 1; for (let i = 0; i < 4; i++) x.f.hand(0, 'sha');
  let s = x.tasks({kind: 'phaseBefore', phase: 'discard'}, {kind: 'phaseDiscard'}); s = x.choose(s, a => a.type === 'choose');
  assert.equal(s.players[0].hand.length, 3); assert.equal(decision(s), null); conserved(s);
});
test('挑衅目标必须覆盖姜维；不出杀只弃手牌装备、不能弃判定牌', () => {
  const x = scene(5); x.general(0, 'mountain.jiangwei'); const armor = x.f.equip(1, 'bagua', 'armor'), delay = x.f.take('lebu'); x.f.state.players[1].judge.push(delay);
  let s = x.start(); assert.ok(!legalActions(s).some(o => o.data?.type === 'activeSkill' && o.data.ability === 'mountain.tiaoxin' && o.data.targets[0] === 2));
  s = x.choose(s, a => a.type === 'activeSkill' && a.ability === 'mountain.tiaoxin' && a.targets[0] === 1); assert.equal(decision(s)?.actor, 1);
  s = x.choose(s, a => a.type === 'pass'); assert.equal(decision(s)?.actor, 0); assert.ok(!legalActions(s).some(o => o.data?.type === 'zone' && o.data.zone === 'judge'));
  s = x.choose(s, a => a.type === 'zone' && 'cid' in a && a.cid === armor); assert.ok(s.discard.includes(armor)); assert.ok(s.players[1].judge.includes(delay)); conserved(s);
});
test('挑衅的回合外杀保留来源且不增加姜维出杀次数', () => {
  const x = scene(); x.general(0, 'mountain.jiangwei'); const sha = x.f.hand(1, 'sha');
  let s = x.choose(x.start(), a => a.type === 'activeSkill'); s = x.choose(s, a => a.type === 'choose' && 'ids' in a && a.ids[0] === sha); s = x.passResponses(s);
  assert.equal(s.players[0].hp, 3); assert.equal(s.shaUsed, 0); assert.ok(s.events.some(e => e.kind === 'damaged' && e.data.source === 1)); conserved(s);
});
for (const reward of ['draw', 'recover']) test(`志继自动觉醒，${reward}奖励后获得当回合可用观星`, () => {
  const x = scene(); x.general(0, 'mountain.jiangwei'); x.f.state.players[0].hp = 1;
  let s = x.tasks({kind: 'phaseStart'}); assert.equal(decision(s)?.kind, 'contentChoice'); s = x.choose(s, chosen(reward));
  assert.equal(s.players[0].maxHp, 3); assert.equal(s.players[0].hp, reward === 'draw' ? 1 : 2); assert.equal(s.players[0].hand.length, reward === 'draw' ? 2 : 0);
  assert.equal(decision(s)?.kind, 'phaseStartChoice'); assert.ok(x.runtime.abilities.has(s, 0, 'standard.guanxing')); s = x.choose(s, a => a.type === 'no'); conserved(s);
});
for (const pay of [false, true]) test(`享乐${pay ? '额外弃基本牌后正常杀' : '没有额外基本牌则杀无效'}`, () => {
  const x = scene(); x.general(1, 'mountain.liushan'); const sha = x.f.hand(0, 'sha'); const cost = pay ? x.f.hand(0, 'shan') : x.f.hand(0, 'guohe');
  let s = x.choose(x.start(), a => a.type === 'play' && a.cid === sha); assert.equal(decision(s)?.actor, 0);
  assert.ok(!legalActions(s).some(o => o.data?.type === 'choose' && 'ids' in o.data && o.data.ids[0] === sha));
  if (pay) s = x.choose(s, a => a.type === 'choose' && 'ids' in a && a.ids[0] === cost); else { assert.equal(legalActions(s).length, 1); s = x.choose(s, a => a.type === 'pass'); }
  s = x.passResponses(s); assert.equal(s.players[1].hp, pay ? 2 : 3); assert.equal(s.discard.includes(cost), pay); conserved(s);
});
test('放权结束时付费，额外回合结束回到原来下一座而非受益者下一座', () => {
  const x = scene(5); x.general(0, 'mountain.liushan'); const fee = x.f.hand(0, 'shan');
  let s = x.tasks({kind: 'phaseBefore', phase: 'play'}, {kind: 'phasePlay'}, {kind: 'phaseEnd'});
  s = x.choose(s, chosen('skip')); s = x.choose(s, a => a.type === 'yes'); s = x.choose(s, chosen(`discard:${fee}`)); s = x.choose(s, chosen('target:3'));
  assert.equal(s.active, 3); assert.equal(s.turnReturn, 0); assert.ok(s.discard.includes(fee));
  s = JSON.parse(JSON.stringify(s)); s.resolution = resolutionStack.initial(); resolutionStack.enqueue(s, {kind: 'phaseEndAdvance'}); x.advance(s);
  assert.equal(s.active, 1); assert.equal(s.turnReturn, undefined); conserved(s);
});
test('放权未跳出牌不能赠回合，手牌上限仍为体力（原版）', () => {
  const x = scene(); x.general(0, 'mountain.liushan'); x.f.state.players[0].hp = 1; x.f.hand(0, 'sha'); assert.equal(x.runtime.queries.handLimit(x.f.state, 0), 1);
  const s = x.tasks({kind: 'phaseBefore', phase: 'play'}); const next = x.choose(s, a => a.type === 'pass'); assert.equal(x.runtime.content.requireSkill('mountain.fangquan').endPhase!.available(next, 0), false);
});
test('若愚只对主公且允许并列最少，自动增加上限回血并获激将', () => {
  const x = scene(5, 'standard', true); x.general(0, 'mountain.liushan');
  const s = x.tasks({kind: 'phaseStart'}); assert.equal(s.players[0].hp, 4); assert.equal(s.players[0].maxHp, 4); assert.ok(x.runtime.abilities.has(s, 0, 'standard.jijiang'));
  const y = scene(); y.general(0, 'mountain.liushan'); assert.equal(decision(y.tasks({kind: 'phaseStart'})), null); assert.equal(y.f.state.players[0].maxHp, 3);
});
for (const kind of ['redSha', 'blackSha', 'duel']) test(`激昂${kind}使用及被指定目标正确，使用一次只触发一次`, () => {
  const x = scene(); x.general(0, 'mountain.sunce'); x.general(1, 'mountain.sunce'); const card = x.f.hand(0, kind === 'duel' ? 'juedou' : 'sha', kind === 'redSha' ? 'heart' : 'spade');
  let s = x.choose(x.start(), a => a.type === 'play' && a.cid === card);
  if (kind !== 'blackSha') { s = x.choose(s, a => a.type === 'yes'); s = x.choose(s, a => a.type === 'yes'); }
  assert.equal(s.events.filter(e => e.kind === 'skillActivated' && e.data.label === '激昂').length, kind === 'blackSha' ? 0 : 2); conserved(s);
});
test('魂姿只在准备阶段一血自动觉醒，当即英魂、摸牌阶段英姿', () => {
  const x = scene(); x.general(0, 'mountain.sunce'); x.f.state.players[0].hp = 1;
  let s = x.tasks({kind: 'phaseStart'}, {kind: 'phaseDraw'}); assert.equal(s.players[0].maxHp, 3); assert.equal(s.players[0].hp, 1); assert.equal(decision(s)?.kind, 'phaseStartChoice');
  s = x.choose(s, a => a.type === 'no'); assert.equal(s.players[0].hand.length, 3); assert.ok(x.runtime.abilities.has(s, 0, 'mountain.yinghun')); conserved(s);
});
test('制霸平局视为发起者未赢，主公可取得两张牌且每位吴将限一次', () => {
  const x = scene(5, 'standard', true); x.general(0, 'mountain.sunce'); x.general(1, 'standard.sunquan'); const a = x.f.hand(1, 'sha'), b = x.f.hand(0, 'shan'); x.f.state.cards[a].rank = 7; x.f.state.cards[b].rank = 7;
  let s = x.choose(x.start(1), a => a.type === 'activeSkill' && a.ability === 'mountain.zhiba.offer'); s = x.choose(s, d => d.type === 'pindian' && d.cid === a); s = x.choose(s, d => d.type === 'pindian' && d.cid === b);
  assert.equal(decision(s)?.actor, 0); s = x.choose(s, chosen('gain')); assert.ok(s.players[0].hand.includes(a) && s.players[0].hand.includes(b)); assert.ok(!legalActions(s).some(o => o.data?.type === 'activeSkill' && o.data.ability === 'mountain.zhiba.offer')); conserved(s);
});
test('魂姿觉醒后主公可拒绝制霸，拒绝不消耗双方拼点牌', () => {
  const x = scene(5, 'standard', true); x.general(0, 'mountain.sunce'); x.general(1, 'standard.sunquan'); x.f.state.players[0].skillFlags = { 'mountain.hunzi.awakened': true }; const a = x.f.hand(1, 'sha'), b = x.f.hand(0, 'shan');
  let s = x.choose(x.start(1), d => d.type === 'activeSkill' && d.ability === 'mountain.zhiba.offer'); s = x.choose(s, d => d.type === 'pass'); assert.ok(s.players[1].hand.includes(a) && s.players[0].hand.includes(b)); conserved(s);
});
test('直谏只能手牌装备放到他人空槽，置入后摸1且不替换', () => {
  const x = scene(5); x.general(0, 'mountain.zhangzhaozhanghong'); const armor = x.f.hand(0, 'bagua'); x.f.equip(1, 'renwang', 'armor');
  let s = x.start(); assert.ok(!legalActions(s).some(o => o.data?.type === 'activeSkill' && o.data.targets[0] === 1));
  s = x.choose(s, a => a.type === 'activeSkill' && a.targets[0] === 2); assert.equal(s.players[2].equip.armor, armor); assert.equal(s.players[0].hand.length, 1); conserved(s);
});
test('固政归还弃牌阶段的手牌并获得余牌，跳过弃牌及非弃牌阶段不触发', () => {
  const x = scene(5); x.general(1, 'mountain.zhangzhaozhanghong'); x.f.state.players[0].hp = 1; const cards = [x.f.hand(0, 'sha'), x.f.hand(0, 'shan'), x.f.hand(0, 'tao')];
  let s = x.tasks({kind: 'phaseBefore', phase: 'discard'}, {kind: 'phaseDiscard'}, {kind: 'phaseAfter', phase: 'discard'});
  s = x.choose(s, a => a.type === 'discard' && a.cid === cards[0]); s = x.choose(s, a => a.type === 'discard' && a.cid === cards[1]); assert.equal(decision(s)?.actor, 1);
  s = x.choose(JSON.parse(JSON.stringify(s)), chosen(`return:${cards[0]}`)); assert.ok(s.players[0].hand.includes(cards[0])); assert.ok(s.players[1].hand.includes(cards[1])); conserved(s);
  const y = scene(); y.general(1, 'mountain.zhangzhaozhanghong'); const c = y.f.take('sha'); y.f.state.discard.push(c); assert.equal(decision(y.tasks({kind: 'phaseAfter', phase: 'discard'})), null);
});
for (const suit of ['heart', 'diamond', 'club', 'spade']) test(`悲歌${suit}判定对应效果，由伤害来源自己选择弃牌`, () => {
  const x = scene(5); x.general(2, 'mountain.caiwenji'); const cost = x.f.hand(2, 'sha'); x.f.hand(0, 'shan'); x.f.hand(0, 'tao'); x.f.top('sha', suit);
  const sha = x.f.hand(0, 'sha'); let s = x.passResponses(x.choose(x.start(), a => a.type === 'play' && a.cid === sha && a.targets[0] === 1));
  s = x.choose(s, chosen(`pay:${cost}`));
  if (suit === 'club') { assert.equal(decision(s)?.actor, 0); s = x.choose(s, a => a.type === 'choose'); s = x.choose(s, a => a.type === 'choose'); assert.equal(s.players[0].hand.length, 0); }
  assert.equal(s.players[1].hp, suit === 'heart' ? 4 : 3); assert.equal(s.players[1].hand.length, suit === 'diamond' ? 2 : 0); assert.equal(!!s.players[0].faceDown, suit === 'spade'); conserved(s);
});
test('断肠在死亡时立即封掉原技能和获得技能，装备技能仍有效', () => {
  const x = scene(5); x.general(0, 'standard.zhangfei'); x.general(1, 'mountain.caiwenji'); x.f.state.players[1].hp = 1; x.f.state.players[0].gainedAbilities = ['standard.wusheng']; x.f.equip(0, 'zhuge', 'weapon'); const sha = x.f.hand(0, 'sha');
  let s = x.passResponses(x.choose(x.start(), a => a.type === 'play' && a.cid === sha && a.targets[0] === 1));
  while (decision(s)?.kind === 'dying') s = x.choose(s, a => a.type === 'pass');
  assert.equal(s.players[1].alive, false); assert.ok(s.players[0].generalSkillsDisabled); assert.ok(!x.runtime.abilities.has(s, 0, 'standard.paoxiao')); assert.ok(!x.runtime.abilities.has(s, 0, 'standard.wusheng')); assert.ok(x.runtime.abilities.has(s, 0, 'standard.zhuge')); conserved(s);
});
test('化身开局两张排除上场武将及非法技能，所选性别势力公开、其余化身保密', () => {
  const game = GameEngine.standard({seed: 7, generalPacks: ['mountain'], players: [{label: '左慈', sex: 'male', general: 'mountain.zuoci'}, {label: '孙权', sex: 'male', general: 'standard.sunquan'}]});
  const avatars = game.getObservation(0).self.huashen!.generals!; assert.equal(avatars.length, 2); assert.ok(!avatars.includes('mountain.zuoci') && !avatars.includes('standard.sunquan'));
  const x = scene(); for (const g of x.content.generals()) for (const skill of huashenSkills(x.runtime, g.id)) assert.ok(!x.content.requireSkill(skill).lordSkill);
  assert.equal(game.getObservation(1).others[0].huashen?.generals, undefined); assert.deepEqual(game.getObservation(0).self.huashen?.generals, avatars);
  const d = game.getDecision()!; game.choose(d.options[0].id); const after = game.getObservation(0).self; const selected = after.huashen!; const general = contentForCards('standard', ['mountain']).general(selected.selected!);
  assert.equal(after.sex, general.sex); assert.equal(after.group, general.group); assert.ok(after.gainedAbilities?.includes(selected.ability!));
});
test('化身更换会移除旧借用技能，JSON恢复及新生逐点伤害增加化身', () => {
  const x = scene(5); x.general(0, 'mountain.zuoci'); x.f.state.players[0].huashen = { generals: ['standard.guanyu', 'standard.zhenji'], selected: 'standard.guanyu', ability: 'standard.wusheng' }; x.f.state.players[0].gainedAbilities = ['standard.wusheng'];
  let s = x.tasks({kind: 'phaseStart'}); s = x.choose(s, a => a.type === 'yes'); s = x.choose(s, chosen('avatar:standard.zhenji:standard.qingguo'));
  assert.ok(!x.runtime.abilities.has(s, 0, 'standard.wusheng')); assert.ok(x.runtime.abilities.has(s, 0, 'standard.qingguo')); assert.equal(s.players[0].sex, 'female');
  damage(s, 0, 1, 2, null); x.advance(s); s = x.choose(JSON.parse(JSON.stringify(s)), a => a.type === 'yes'); s = x.choose(s, a => a.type === 'yes');
  assert.equal(s.players[0].huashen!.generals.length, 4); assert.equal(observe(s, 1).others.find(p => p.id === 0)!.huashen?.generals, undefined); conserved(s);
});
test('化身准备阶段新选观星及结束阶段新选闭月在当阶段可发动', () => {
  const x = scene(); x.general(0, 'mountain.zuoci'); x.f.state.players[0].huashen = { generals: ['standard.zhugeliang'] };
  let s = x.tasks({kind: 'phaseStart'}); s = x.choose(s, a => a.type === 'yes'); s = x.choose(s, chosen('avatar:standard.zhugeliang:standard.guanxing'));
  assert.equal(decision(s)?.kind, 'phaseStartChoice'); s = x.choose(s, a => a.type === 'no'); conserved(s);
  const y = scene(); y.general(0, 'mountain.zuoci'); y.f.state.players[0].huashen = { generals: ['standard.diaochan'] };
  let end = y.tasks({kind: 'phaseEnd'}); end = y.choose(end, a => a.type === 'yes'); end = y.choose(end, chosen('avatar:standard.diaochan:standard.biyue'));
  assert.equal(end.events.filter(e => e.kind === 'skillActivated' && e.data.ability === 'standard.biyue').length, 1);
  assert.equal(end.players[0].hand.length, 1); conserved(end);
});
test('化身不能选马术等锁定技，断肠使黄天颂威暴虐制霸献牌入口失效', () => {
  const x = scene(5, 'standard', true);
  assert.ok(!huashenSkills(x.runtime, 'fire.pangde').includes('fire.mashu'));
  for (const [general, donor, offer] of [['wind.zhangjiao', 'mountain.caiwenji', 'wind.huangtian.gift'], ['forest.caopi', 'standard.simayi', 'forest.songwei.offer'], ['forest.dongzhuo', 'mountain.caiwenji', 'forest.baonue.offer'], ['mountain.sunce', 'standard.sunquan', 'mountain.zhiba.offer']]) {
    x.general(0, general); x.general(1, donor); x.f.state.players[0].generalSkillsDisabled = false;
    assert.ok(x.runtime.abilities.has(x.f.state, 1, offer)); x.f.state.players[0].generalSkillsDisabled = true;
    assert.ok(!x.runtime.abilities.has(x.f.state, 1, offer));
  }
});
