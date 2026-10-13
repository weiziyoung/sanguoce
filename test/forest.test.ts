import test from 'node:test';
import assert from 'node:assert/strict';
import { forestScene as scene, conserved } from './support/forest-scenario.ts';
import { contentForCards, GENERAL_PACKS } from '../src/app/game-content.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { JudgementFlow } from '../src/rules/flows/judgement-flow.ts';
import { startTurn } from '../src/content/standard/flows/turn-flow.ts';
import { preparePlayScenario } from '../src/app/standard-game.ts';

const chosen = (name: string) => (d: import('../src/domain/state.ts').ActionData) => 'choice' in d && d.choice === name;

test('林包八将与风火全部组合独立注册，两种牌堆不增加实体牌且仍无于吉', () => {
  for (const cards of ['standard', 'junzheng'] as const) for (let mask = 0; mask < 8; mask++) {
    const packs = GENERAL_PACKS.filter((_, i) => mask & (1 << i));
    const c = contentForCards(cards, packs);
    assert.equal(c.generals().length, 25 + (packs.includes('wind') ? 7 : 0) + (packs.includes('fire') ? 8 : 0) + (packs.includes('forest') ? 8 : 0));
    assert.equal(c.deck.length, cards === 'standard' ? 108 : 160);
    assert.equal(contentForCards(cards, [...packs].reverse()), c);
    assert.ok(!c.generals().some(g => g.label === '于吉'));
    if (packs.includes('forest')) { assert.equal(c.card('jiu').kind, 'basic'); assert.equal(c.card('bingliang').kind, 'delay'); }
  }
});

test('再起取已损失体力数，红桃回血弃置、其他牌明置收入，不额外摸两张', () => {
  const x = scene(); x.general(0, 'forest.menghuo'); x.f.state.players[0].hp = 1;
  const heart = x.f.top('tao', 'heart'), club = x.f.top('sha', 'club'), spade = x.f.top('shan', 'diamond');
  let s = x.tasks({ kind: 'phaseDraw' }); s = x.choose(s, d => d.type === 'skill' && d.ability === 'forest.zaiqi');
  assert.equal(s.players[0].hp, 2); assert.deepEqual(s.players[0].hand, [spade, club]); assert.ok(s.discard.includes(heart));
  assert.equal(s.events.filter(e => e.kind === 'cardRevealed').length, 3); conserved(s);
});

test('南蛮伤害来源为孟获，孟获祝融免疫，全部结算完祝融取得原南蛮', () => {
  const x = scene(5); x.general(1, 'forest.menghuo'); x.general(3, 'forest.zhurong');
  const nanman = x.f.hand(0, 'nanman'); const s = x.passResponses(x.choose(x.start(), d => d.type === 'play' && d.cid === nanman));
  assert.deepEqual(s.players.map(p => p.hp), [4, 4, 3, 4, 3]);
  assert.ok(s.events.filter(e => e.kind === 'damaged').every(e => e.kind === 'damaged' && e.data.source === 1));
  assert.ok(s.players[3].hand.includes(nanman)); assert.ok(!s.discard.includes(nanman));
  const gain = s.events.findIndex(e => e.kind === 'gained' && e.data.card === nanman);
  assert.ok(gain > Math.max(...s.events.map((e,i) => e.kind === 'damaged' ? i : -1))); conserved(s);
});

test('祝融自身使用的南蛮仍弃置', () => {
  const x = scene(); x.general(0, 'forest.zhurong'); const nanman = x.f.hand(0, 'nanman');
  const s = x.passResponses(x.choose(x.start(), d => d.type === 'play' && d.cid === nanman));
  assert.ok(s.discard.includes(nanman)); assert.equal(s.players[0].hand.length, 0); conserved(s);
});

for (const rank of [2, 13]) test(`烈刃伤害后拼点，胜后可取装备不能取判定牌（点数${rank}）`, () => {
  const x = scene(); x.general(0, 'forest.zhurong'); const sha = x.f.hand(0, 'sha'); const a = x.f.hand(0, 'sha'); x.f.state.cards[a].rank = rank;
  const b = x.f.hand(1, 'sha'); x.f.state.cards[b].rank = 7; const armor = x.f.equip(1, 'bagua', 'armor');
  const judge = x.f.take('lebu'); x.f.state.players[1].judge.push(judge);
  let s = x.passResponses(x.choose(x.start(), d => d.type === 'play' && d.cid === sha)); s = x.choose(s, d => d.type === 'yes');
  s = x.choose(s, d => d.type === 'pindian' && d.cid === a);
  assert.ok(!observe(s, 1).table.some(c => c.id === a)); s = JSON.parse(JSON.stringify(s));
  s = x.choose(s, d => d.type === 'pindian' && d.cid === b);
  if (rank > 7) { assert.equal(decision(s)?.kind, 'zone'); assert.ok(!legalActions(s).some(o => o.data?.type === 'zone' && o.data.zone === 'judge'));
    s = x.choose(s, d => d.type === 'zone' && 'cid' in d && d.cid === armor); assert.ok(s.players[0].hand.includes(armor)); }
  else assert.ok(s.players[1].equip.armor === armor);
  assert.ok(s.players[1].judge.includes(judge)); conserved(s);
});

test('断粮黑色基本牌或装备含装备区可转兵粮，距离上限二，不能转黑色锦囊', () => {
  const x = scene(5); x.general(0, 'forest.xuhuang'); const sha = x.f.hand(0, 'sha', 'spade'), trick = x.f.hand(0, 'guohe', 'spade');
  const equip = x.f.equip(0, 'qinggang', 'weapon'); const s = x.start(); const actions = legalActions(s).flatMap(o => o.data ? [o.data] : []);
  assert.ok(actions.some(d => d.type === 'virtualDelay' && d.ids[0] === sha && d.targets[0] === 2));
  assert.ok(actions.some(d => d.type === 'virtualDelay' && d.ids[0] === equip));
  assert.ok(!actions.some(d => d.type === 'virtualDelay' && d.ids[0] === trick));
  const after = x.choose(s, d => d.type === 'virtualDelay' && d.ids[0] === equip && d.targets[0] === 2);
  assert.equal(after.players[0].equip.weapon, null); assert.ok(after.players[2].judge.includes(equip)); assert.ok(after.events.some(e => e.kind === 'delayPlaced' && e.data.effectiveName === 'bingliang')); conserved(after);
});

test('英魂由受益角色自行弃手牌或装备，牌不足时全部弃置，恢复后继续', () => {
  const x = scene(5); x.general(0, 'forest.sunjian'); x.f.state.players[0].hp = 1; const armor = x.f.equip(2, 'bagua', 'armor');
  let s = x.tasks({ kind: 'phaseStart' }); s = x.choose(s, d => d.type === 'yes'); s = x.choose(s, chosen('hurt:2'));
  assert.equal(decision(s)?.actor, 2); s = JSON.parse(JSON.stringify(s)); s = x.choose(s, d => d.type === 'choose' && 'ids' in d && d.ids[0] === armor);
  s = x.choose(s, d => d.type === 'choose'); assert.equal(s.players[2].hand.length, 0); assert.equal(s.players[2].equip.armor, null);
  assert.equal(decision(s), null); conserved(s);
});

test('英魂摸X弃1净增X减1，满血不开提示', () => {
  const x = scene(); x.general(0, 'forest.sunjian'); x.f.state.players[0].hp = 2;
  let s = x.tasks({ kind: 'phaseStart' }); s = x.choose(s, d => d.type === 'yes'); s = x.choose(s, chosen('help:1'));
  assert.equal(s.players[1].hand.length, 2); s = x.choose(s, d => d.type === 'choose'); assert.equal(s.players[1].hand.length, 1); conserved(s);
  const y = scene(); y.general(0, 'forest.sunjian'); assert.equal(decision(y.tasks({ kind: 'phaseStart' })), null);
});

test('好施超过五张必须交出向下取整一半，只能交给最少手牌者，旁观不泄漏牌面', () => {
  const x = scene(5); x.general(0, 'forest.lusu'); for (let i = 0; i < 3; i++) x.f.hand(0, 'sha'); x.f.hand(2, 'shan');
  let s = x.tasks({ kind: 'phaseDraw' }); s = x.choose(s, d => d.type === 'skill'); assert.equal(s.players[0].hand.length, 7);
  const gift = s.players[0].hand.slice(0, 3);
  for (const id of gift) { assert.ok(!legalActions(s).some(o => o.data?.type === 'pass')); s = x.choose(s, d => d.type === 'choose' && 'ids' in d && d.ids[0] === id); }
  assert.ok(!legalActions(s).some(o => o.data?.type === 'choose' && 'targets' in o.data && o.data.targets[0] === 2)); s = JSON.parse(JSON.stringify(s));
  s = x.choose(s, chosen('recipient:1')); assert.equal(s.players[0].hand.length, 4); assert.deepEqual(s.players[1].hand, gift);
  const hidden = observe(s, 2).events.filter(e => e.kind === 'gained'); assert.ok(hidden.every(e => e.kind === 'gained' && e.data.card === null));
  assert.ok(observe(s, 1).events.some(e => e.kind === 'gained' && e.data.card === gift[0])); conserved(s);
});

test('好施不超过五张无需分牌', () => {
  const x = scene(); x.general(0, 'forest.lusu'); x.f.hand(0, 'sha'); let s = x.tasks({ kind: 'phaseDraw' }); s = x.choose(s, d => d.type === 'skill');
  assert.equal(s.players[0].hand.length, 5); assert.equal(decision(s), null); conserved(s);
});

for (const fee of [0, 1]) test(`缔盟手牌数差${fee}可弃装备支付，整手交换且每阶段一次`, () => {
  const x = scene(5); x.general(0, 'forest.lusu'); const armor = x.f.equip(0, 'bagua', 'armor'); const a = x.f.hand(1, 'tao');
  const b = x.f.hand(2, 'shan'); if (fee) x.f.hand(2, 'sha'); const second = [...x.f.state.players[2].hand];
  let s = x.choose(x.start(), d => d.type === 'beginSkill' && d.ability === 'forest.dimeng');
  if (fee) s = x.choose(s, d => d.type === 'toggle' && d.cid === armor); s = x.choose(s, d => d.type === 'confirm');
  s = x.choose(s, d => d.type === 'select' && d.targets[0] === 1 && d.targets[1] === 2);
  assert.deepEqual(s.players[1].hand, second); assert.deepEqual(s.players[2].hand, [a]); assert.ok(s.players[1].hand.includes(b));
  if (fee) assert.equal(s.players[0].equip.armor, null);
  assert.ok(!legalActions(s).some(o => o.data?.type === 'beginSkill' && o.data.ability === 'forest.dimeng'));
  assert.ok(!observe(s, 3).eventCards?.[a]); conserved(s);
});

test('缔盟两人局不可发动，没有对应目标的费用不能确认', () => {
  const x = scene(); x.general(0, 'forest.lusu'); x.f.hand(0, 'sha'); assert.ok(!legalActions(x.start()).some(o => o.data?.type === 'beginSkill'));
  const y = scene(5); y.general(0, 'forest.lusu'); for (let i = 1; i < 5; i++) for (let n = 0; n < i; n++) y.f.hand(i, 'sha'); y.f.hand(0, 'shan');
  const s = y.choose(y.start(), d => d.type === 'beginSkill'); assert.ok(!legalActions(s).some(o => o.data?.type === 'confirm'));
});

test('放逐一次多点伤害只发动一次，按伤后失血数摸牌，翻面可将背面翻回正面', () => {
  const x = scene(5); x.general(1, 'forest.caopi'); x.f.state.players[2].faceDown = true; damage(x.f.state, 1, 0, 2);
  let s = x.advance(x.f.state); s = x.choose(s, d => d.type === 'yes'); s = x.choose(s, chosen('target:2'));
  assert.equal(s.players[2].hand.length, 2); assert.equal(s.players[2].faceDown, false); assert.equal(decision(s), null); conserved(s);
});

test('行殇在死亡清理前收走死者手牌装备，判定牌仍弃置，奖励继续执行', () => {
  const x = scene(5, 'standard', true); x.general(1, 'forest.caopi'); const hand = x.f.hand(2, 'tao'), armor = x.f.equip(2, 'bagua', 'armor'), judge = x.f.take('lebu');
  x.f.state.players[2].judge.push(judge); x.f.state.players[2].hp = 0; damage(x.f.state, 2, 0); let s = x.advance(x.f.state);
  s = x.choose(s, d => d.type === 'pass'); assert.equal(s.players[2].alive, false); assert.equal(decision(s)?.actor, 1);
  s = JSON.parse(JSON.stringify(s)); s = x.choose(s, chosen('inherit'));
  assert.ok(s.players[1].hand.includes(hand) && s.players[1].hand.includes(armor)); assert.ok(s.discard.includes(judge));
  assert.equal(s.players[0].hand.length, 3); conserved(s);
});

test('颂威仅曹丕主公给其他魏角色最终黑色判定后选择摸一张', () => {
  const x = scene(5, 'standard', true); x.general(0, 'forest.caopi'); x.general(1, 'forest.xuhuang'); x.f.top('sha', 'spade');
  new JudgementFlow(x.runtime).begin(x.f.state, 1, 'bagua', { kind: 'contentCallback', ability: 'forest.songwei.offer', owner: 1, context: { timing: 'judge' } }); let s = x.advance(x.f.state); assert.equal(decision(s)?.actor, 1);
  s = x.choose(s, d => d.type === 'yes'); assert.equal(s.players[0].hand.length, 1); conserved(s);
  const y = scene(5, 'standard', true); y.general(1, 'forest.caopi'); y.general(2, 'forest.xuhuang'); y.f.top('sha', 'spade');
  new JudgementFlow(y.runtime).begin(y.f.state, 2, 'bagua', { kind: 'contentCallback', ability: 'forest.songwei.offer', owner: 2, context: { timing: 'judge' } }); assert.equal(decision(y.advance(y.f.state)), null);
});

test('酒池在标准牌堆转化黑桃酒，正常酒杀加伤且一阶段只喝一次', () => {
  const x = scene(); x.general(0, 'forest.dongzhuo'); const wine = x.f.hand(0, 'guohe', 'spade'), sha = x.f.hand(0, 'sha', 'heart'); x.f.hand(0, 'sha', 'spade');
  let s = x.choose(x.start(), d => d.type === 'virtualBasic' && d.ids[0] === wine); assert.equal(s.players[0].drunk, 1);
  assert.ok(!legalActions(s).some(o => o.data?.type === 'virtualBasic')); s = x.passResponses(x.choose(s, d => d.type === 'play' && d.cid === sha));
  assert.equal(s.players[1].hp, 2); assert.equal(s.players[0].drunk, undefined); conserved(s);
});

test('酒池可以自救且不受出牌阶段酒次数限制，不可救他人', () => {
  const x = scene(); x.general(1, 'forest.dongzhuo'); const id = x.f.hand(1, 'sha', 'spade'); x.f.state.jiuUsed = 1; x.f.state.players[1].hp = 1;
  damage(x.f.state, 1, 0); let s = x.advance(x.f.state); s = x.choose(s, d => d.type === 'save' && d.ids[0] === id);
  assert.equal(s.players[1].hp, 1); assert.equal(s.jiuUsed, 1); assert.equal(s.players[1].drunk, undefined); conserved(s);
});

for (const incoming of [false, true]) test(`肉林两张闪只限男女方向的杀（女性出杀=${incoming}）`, () => {
  const x = scene(); x.general(incoming ? 1 : 0, 'forest.dongzhuo'); x.f.state.players[incoming ? 0 : 1].sex = 'female';
  const sha = x.f.hand(0, 'sha'), a = x.f.hand(1, 'shan'), b = x.f.hand(1, 'shan');
  assert.equal(x.runtime.queries.responseCount(x.f.state, 0, 1, 'sha'), 2); assert.equal(x.runtime.queries.responseCount(x.f.state, 0, 1, 'juedou'), 1);
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === sha); s = x.choose(s, d => d.type === 'respond' && d.ids[0] === a);
  assert.equal(decision(s)?.kind, 'respond'); s = x.choose(s, d => d.type === 'respond' && d.ids[0] === b); assert.equal(s.players[1].hp, incoming ? 8 : 4); conserved(s);
});

test('崩坏不是最低体力时强制选择，减上限同步压低体力；并列最低不触发', () => {
  const x = scene(); x.general(0, 'forest.dongzhuo'); let s = x.tasks({ kind: 'phaseEnd' }); assert.equal(decision(s)?.kind, 'contentChoice');
  assert.ok(!legalActions(s).some(o => o.data?.type === 'pass')); s = x.choose(s, chosen('maxHp'));
  assert.equal(s.players[0].maxHp, 7); assert.equal(s.players[0].hp, 7); assert.ok(s.events.some(e => e.kind === 'maxHpChanged')); conserved(s);
  const y = scene(); y.general(0, 'forest.dongzhuo'); y.f.state.players[0].hp = 4; const after = y.tasks({ kind: 'phaseEnd' });
  assert.ok(!after.events.some(e => e.kind === 'skillActivated' && e.data.ability === 'forest.benghuai'));
});

test('暴虐仅其他群造成伤害可给董卓主公黑桃判定回复一点', () => {
  const x = scene(5, 'standard', true); x.general(0, 'forest.dongzhuo'); x.general(2, 'forest.jiaxu'); x.f.state.players[0].hp = 5; x.f.top('sha', 'spade');
  damage(x.f.state, 3, 2, 2); let s = x.advance(x.f.state); assert.equal(decision(s)?.actor, 2); s = x.choose(s, d => d.type === 'yes');
  assert.equal(s.players[0].hp, 6); conserved(s);
});

test('帷幕拒绝黑色实体或转化锦囊包括群体锦囊、延迟锦囊与自己的闪电，红色可选', () => {
  const x = scene(5); x.general(1, 'forest.jiaxu'); x.general(0, 'standard.ganning');
  const black = x.f.hand(0, 'guohe', 'spade'), red = x.f.hand(0, 'guohe', 'heart'), cost = x.f.hand(0, 'sha', 'spade'); x.f.hand(1, 'shan');
  const actions = legalActions(x.start()).flatMap(o => o.data ? [o.data] : []);
  assert.ok(!actions.some(d => d.type === 'play' && d.cid === black && d.targets[0] === 1));
  assert.ok(actions.some(d => d.type === 'play' && d.cid === red && d.targets[0] === 1));
  assert.ok(!actions.some(d => d.type === 'virtualTrick' && d.ids[0] === cost && d.targets[0] === 1));
  const y = scene(); y.general(0, 'forest.jiaxu'); const lightning = y.f.hand(0, 'shandian'); assert.ok(!legalActions(y.start()).some(o => o.data?.type === 'play' && o.data.cid === lightning));
  const z = scene(5); z.general(1, 'forest.jiaxu'); const nanman = z.f.hand(0, 'nanman'); const after = z.choose(z.start(), d => d.type === 'play' && d.cid === nanman);
  assert.equal(after.players[1].hp, 3); conserved(after);
});

test('完杀只在贾诩回合限制他人桃，濒死者与贾诩可救，其他回合可正常救援', () => {
  const x = scene(5); x.general(0, 'forest.jiaxu'); const own = x.f.hand(1, 'tao'); x.f.hand(2, 'tao'); x.f.state.players[1].hp = 0;
  damage(x.f.state, 1, 0); let s = x.advance(x.f.state); assert.equal(decision(s)?.actor, 1); s = x.choose(s, d => d.type === 'save' && d.ids[0] === own);
  assert.equal(s.players[1].hp, 0); assert.equal(s.players[1].alive, false); assert.ok(s.players[2].hand.length === 1);
  const y = scene(5); y.general(0, 'forest.jiaxu'); y.f.hand(2, 'tao'); y.f.state.active = 3; y.f.state.players[1].hp = 1; damage(y.f.state, 1, 3);
  assert.equal(decision(y.advance(y.f.state))?.actor, 2); conserved(y.f.state);
});

test('乱武依座次选择距离最近目标或失血，杀不占正常次数，限定技公开且JSON恢复', () => {
  const x = scene(5); x.general(0, 'forest.jiaxu'); const sha = x.f.hand(1, 'sha');
  let s = x.choose(x.start(), d => d.type === 'activeSkill' && d.ability === 'forest.luanwu'); assert.equal(decision(s)?.actor, 1);
  assert.ok(!legalActions(s).some(o => o.data?.type === 'choose' && 'targets' in o.data && o.data.targets[0] === 3));
  s = JSON.parse(JSON.stringify(s)); s = x.passResponses(x.choose(s, d => d.type === 'choose' && 'ids' in d && 'targets' in d && d.ids[0] === sha && d.targets[0] === 2));
  assert.equal(s.players[2].hp, 3); assert.equal(s.shaUsed, 0);
  for (const seat of [2, 3, 4]) { assert.equal(decision(s)?.actor, seat); s = x.choose(s, chosen('loseHp')); }
  assert.deepEqual(s.players.map(p => p.hp), [3, 4, 2, 3, 3]); assert.ok(observe(s, 0).self.spentLimitedSkills?.includes('forest.luanwu'));
  assert.ok(!legalActions(preparePlayScenario(s, 0, x.runtime)).some(o => o.data?.type === 'activeSkill' && o.data.ability === 'forest.luanwu')); conserved(s);
});

test('乱武贾诩死亡后若对局继续仍询问其他角色', () => {
  const x = scene(5, 'standard', true); x.general(1, 'forest.jiaxu'); x.f.state.players[1].hp = 1; const sha = x.f.hand(2, 'sha');
  let s = x.choose(x.start(1), d => d.type === 'activeSkill' && d.ability === 'forest.luanwu');
  s = x.passResponses(x.choose(s, d => d.type === 'choose' && 'ids' in d && 'targets' in d && d.ids[0] === sha && d.targets[0] === 1)); assert.equal(s.players[1].alive, false);
  for (const seat of [3, 4, 0]) { assert.equal(decision(s)?.actor, seat); s = x.choose(s, chosen('loseHp')); }
  assert.equal(s.outcome.status, 'ongoing'); conserved(s);
});

test('帷幕阻止闪电传入贾诩判定区', () => {
  const x = scene(5); x.general(1, 'forest.jiaxu'); const cid = x.f.take('shandian'); x.f.state.players[0].judge.push(cid); x.f.top('tao', 'heart');
  x.tasks({ kind: 'judgeCard', owner: 0, cid }); assert.ok(!x.f.state.players[1].judge.includes(cid)); assert.ok(x.f.state.players[2].judge.includes(cid)); conserved(x.f.state);
});

test('林将自然回合可经过摸牌选择到出牌阶段', () => {
  const x = scene(); x.general(0, 'forest.menghuo'); startTurn(x.f.state); const s = x.advance(x.f.state); assert.equal(decision(s)?.kind, 'play'); conserved(s);
});

test('南蛮期间天香导致孟获阵亡，后续伤害仍归孟获，祝融最后收牌', () => {
  const x = scene(5); x.general(1, 'wind.xiaoqiao'); x.general(2, 'forest.menghuo'); x.general(3, 'forest.zhurong');
  x.f.state.players[2].hp = 1; const heart = x.f.hand(1, 'tao', 'heart'), nanman = x.f.hand(0, 'nanman');
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === nanman); s = x.choose(s, d => d.type === 'pass');
  assert.equal(decision(s)?.kind, 'contentChoice'); s = x.choose(s, d => d.type === 'choose' && 'ids' in d && 'targets' in d && d.ids[0] === heart && d.targets[0] === 2);
  assert.equal(s.players[2].alive, false); s = x.passResponses(s);
  assert.equal(s.players[4].hp, 3); assert.ok(s.events.some(e => e.kind === 'damaged' && e.data.target === 4 && e.data.source === 2));
  assert.ok(s.players[3].hand.includes(nanman)); conserved(s);
});

test('南蛮原出牌者中途被天香击杀，其余目标仍继续结算', () => {
  const x = scene(5); x.general(1, 'wind.xiaoqiao'); x.general(3, 'forest.zhurong'); x.f.state.players[0].hp = 1;
  const heart = x.f.hand(1, 'tao', 'heart'), nanman = x.f.hand(0, 'nanman');
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === nanman); s = x.choose(s, d => d.type === 'pass');
  s = x.choose(s, d => d.type === 'choose' && 'ids' in d && 'targets' in d && d.ids[0] === heart && d.targets[0] === 0); s = x.passResponses(s);
  assert.equal(s.players[0].alive, false); assert.equal(s.players[2].hp, 3); assert.equal(s.players[4].hp, 3); assert.ok(s.players[3].hand.includes(nanman)); conserved(s);
});

test('颂威采用改判后的黑色牌，暴虐采用改判后的花色', () => {
  const x = scene(5, 'standard', true); x.general(0, 'forest.caopi'); x.general(1, 'standard.simayi'); const black = x.f.hand(1, 'sha', 'spade'); x.f.top('tao', 'heart');
  new JudgementFlow(x.runtime).begin(x.f.state, 1, 'bagua', { kind: 'contentCallback', ability: 'forest.songwei.offer', owner: 1, context: {timing: 'judge'} });
  let s = x.advance(x.f.state); s = x.choose(s, d => d.type === 'replace' && d.cid === black); assert.equal(decision(s)?.kind, 'triggerConfirm');
  s = x.choose(s, d => d.type === 'yes'); assert.equal(s.players[0].hand.length, 1); conserved(s);
  const y = scene(5, 'standard', true); y.general(0, 'forest.dongzhuo'); y.general(1, 'standard.simayi'); y.general(2, 'forest.jiaxu'); y.f.state.players[0].hp = 5;
  const red = y.f.hand(1, 'tao', 'heart'); y.f.top('sha', 'spade'); damage(y.f.state, 3, 2); s = y.advance(y.f.state); s = y.choose(s, d => d.type === 'yes');
  s = y.choose(s, d => d.type === 'replace' && d.cid === red); assert.equal(s.players[0].hp, 5); conserved(s);
});
