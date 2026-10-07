import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './support/scenario-builder.ts';
import { contentForCards, type CardSet } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { preparePlayScenario, StandardRuleset } from '../src/app/standard-game.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { startTurn } from '../src/content/standard/flows/turn-flow.ts';
import type { ActionData, GameState } from '../src/domain/state.ts';

function scene(count = 2, cards: CardSet = 'standard', mode?: string, roles?: string[]) {
  const f = fixture(count, { cards, generalPacks: ['wind', 'fire'], ...(mode ? { mode, roles } : {}) });
  const content = contentForCards(cards, ['wind', 'fire']), runtime = new ContentRuntime(content);
  const resolution = createStandardResolution(standardModes, runtime.triggers, runtime);
  const rules = new StandardRuleset(undefined, undefined, content);
  const general = (seat: number, id: string) => { const d = content.general(id);
    Object.assign(f.state.players[seat], { general: id, group: d.group, sex: d.sex, hp: d.hp, maxHp: d.hp }); };
  const choose = (s: GameState, predicate: (data: ActionData) => boolean) => {
    const option = legalActions(s).find(o => o.data && predicate(o.data));
    assert.ok(option, `缺少选项：${decision(s)?.kind} ${JSON.stringify(legalActions(s).map(o => o.data))}`);
    return rules.apply(s, option.id);
  };
  const advance = (s: GameState) => { resolution.scheduler.advance(s); return s; };
  return { f, runtime, rules, general, choose, advance, start: (actor = 0) => preparePlayScenario(f.state, actor, runtime) };
}
function ranked(f: ReturnType<typeof fixture>, seat: number, name: string, suit: 'heart' | 'spade' | 'club', rank: number) {
  const id = f.hand(seat, name, suit); f.state.cards[id].rank = rank; return id;
}
function rankedTop(f: ReturnType<typeof fixture>, name: string, suit: 'heart' | 'spade' | 'club', rank: number) {
  const id = f.top(name, suit); f.state.cards[id].rank = rank; return id;
}
function conserved(s: GameState) {
  const ids = [...s.deck, ...s.discard, ...s.table, ...s.players.flatMap(p => [...p.hand, ...p.judge,
    ...Object.values(p.equip).filter((id): id is number => id !== null), ...Object.values(p.piles ?? {}).flat()])];
  assert.equal(ids.length, Object.keys(s.cards).length); assert.equal(new Set(ids).size, ids.length);
}
function pindian(x: ReturnType<typeof scene>, s: GameState, a: number, b: number) {
  s = x.choose(s, d => d.type === 'pindian' && d.cid === a);
  return x.choose(s, d => d.type === 'pindian' && d.cid === b);
}

test('火包八将可单独启用或叠加风包，标准虚拟火攻铁索不增加实体牌，组合顺序不影响注册表', () => {
  for (const cards of ['standard', 'junzheng'] as const) {
    assert.equal(contentForCards(cards, ['fire']).generals().length, 33);
    assert.equal(contentForCards(cards, ['wind', 'fire']).generals().length, 40);
    assert.equal(contentForCards(cards, ['fire', 'wind']), contentForCards(cards, ['wind', 'fire']));
    assert.equal(contentForCards(cards, ['fire']).deck.length, cards === 'standard' ? 108 : 160);
    assert.equal(contentForCards(cards, ['fire']).card('huogong').effect, 'custom');
    assert.ok(!contentForCards(cards, ['wind', 'fire']).generals().some(g => g.label === '于吉'));
  }
  assert.throws(() => contentForCards('standard', ['fire', 'fire']));
});

test('驱虎拼点双方选牌前不公开先选牌，JSON恢复后同样结算，胜者选择受害者且伤害来源是对手', () => {
  const x = scene(5); x.general(0, 'fire.xunyu'); const a = ranked(x.f, 0, 'sha', 'heart', 13), b = ranked(x.f, 1, 'sha', 'spade', 2);
  let s = x.choose(x.start(), d => d.type === 'activeSkill' && d.ability === 'fire.quhu' && d.targets[0] === 1);
  assert.equal(decision(s)?.kind, 'pindian'); s = x.choose(s, d => d.type === 'pindian' && d.cid === a);
  assert.equal(decision(s)?.actor, 1);
  const obs = observe(s, 1); assert.ok(!obs.eventCards?.[a]); assert.ok(!obs.table.some(c => c.id === a));
  assert.ok(!JSON.stringify(decision(s)).includes(`\"sourceCard\"`));
  s = JSON.parse(JSON.stringify(s)); s = x.choose(s, d => d.type === 'pindian' && d.cid === b);
  assert.equal(decision(s)?.kind, 'contentChoice');
  assert.ok(!legalActions(s).some(o => o.data?.type === 'choose' && 'targets' in o.data && o.data.targets[0] === 3));
  s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets[0] === 2);
  assert.equal(s.players[2].hp, 3); assert.ok(s.events.some(e => e.kind === 'damaged' && e.data.source === 1 && e.data.forcedBy === 0));
  assert.ok(s.discard.includes(a) && s.discard.includes(b)); conserved(s);
});
for (const [aRank, bRank] of [[2, 13], [7, 7]]) test(`驱虎未赢包括平局，由对手对荀彧造成伤害（${aRank}/${bRank}）`, () => {
  const x = scene(); x.general(0, 'fire.xunyu'); const a = ranked(x.f, 0, 'sha', 'heart', aRank), b = ranked(x.f, 1, 'sha', 'spade', bRank);
  let s = x.choose(x.start(), d => d.type === 'activeSkill' && d.ability === 'fire.quhu'); s = pindian(x, s, a, b);
  assert.equal(s.players[0].hp, 2); assert.ok(s.events.some(e => e.kind === 'damaged' && e.data.source === 1)); conserved(s);
});

test('驱虎必须比自身多血且双方有手牌，每阶段只可一次', () => {
  const x = scene(5); x.general(0, 'fire.xunyu'); x.f.hand(0, 'sha'); x.f.hand(1, 'shan'); x.f.hand(2, 'sha');
  x.f.state.players[2].hp = 3;
  let s = x.start(); const offers = legalActions(s).filter(o => o.data?.type === 'activeSkill' && o.data.ability === 'fire.quhu');
  assert.deepEqual(offers.map(o => o.data && 'targets' in o.data ? o.data.targets : []), [[1]]);
  s.skillUses = [{ owner: 0, ability: 'fire.quhu', turn: s.turn, count: 1 }]; s = preparePlayScenario(s, 0, x.runtime);
  assert.ok(!legalActions(s).some(o => o.data?.type === 'activeSkill' && o.data.ability === 'fire.quhu'));
});

test('节命按每点伤害独立补牌，体力上限超过五也只能补至五张', () => {
  const x = scene(5); x.general(1, 'fire.xunyu'); x.f.state.players[2].maxHp = 7; x.f.hand(2, 'shan');
  let s = x.f.state; damage(s, 1, 0, 2); x.advance(s);
  for (const target of [2, 1]) { s = x.choose(s, d => d.type === 'yes'); s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets[0] === target); }
  assert.equal(s.players[2].hand.length, 5); assert.equal(s.players[1].hand.length, 3); conserved(s);
});

test('强袭可失去体力或弃武器，装备武器支付不保留原射程，手牌武器不影响装备射程', () => {
  const x = scene(5); x.general(0, 'fire.dianwei'); const weapon = x.f.equip(0, 'qilin', 'weapon'), other = x.f.hand(0, 'qinggang');
  let s = x.start(); const options = legalActions(s).filter(o => o.data?.type === 'activeSkill' && o.data.ability === 'fire.qiangxi');
  assert.ok(options.some(o => o.data?.type === 'activeSkill' && o.data.ids[0] === other && o.data.targets[0] === 2));
  assert.ok(!options.some(o => o.data?.type === 'activeSkill' && o.data.ids[0] === weapon && o.data.targets[0] === 2));
  s = x.choose(s, d => d.type === 'activeSkill' && d.ability === 'fire.qiangxi' && !d.ids.length && d.targets[0] === 2);
  assert.equal(s.players[0].hp, 3); assert.equal(s.players[2].hp, 3); assert.equal(s.players[0].equip.weapon, weapon);
  assert.ok(!legalActions(s).some(o => o.data?.type === 'activeSkill' && o.data.ability === 'fire.qiangxi')); conserved(s);
});

test('强袭弃装备武器可命中近邻，消耗的武器进入弃牌堆', () => {
  const x = scene(); x.general(0, 'fire.dianwei'); const weapon = x.f.equip(0, 'qinggang', 'weapon');
  const s = x.choose(x.start(), d => d.type === 'activeSkill' && d.ability === 'fire.qiangxi' && d.ids[0] === weapon);
  assert.equal(s.players[0].hp, 4); assert.equal(s.players[1].hp, 3); assert.equal(s.players[0].equip.weapon, null); assert.ok(s.discard.includes(weapon)); conserved(s);
});

test('天义赢后杀无距离、额外次数和额外目标；结束阶段或新回合失效', () => {
  const x = scene(5); x.general(0, 'fire.taishici'); const a = ranked(x.f, 0, 'shan', 'heart', 13), b = ranked(x.f, 1, 'sha', 'spade', 2);
  x.f.hand(0, 'sha'); let s = x.choose(x.start(), d => d.type === 'activeSkill' && d.ability === 'fire.tianyi' && d.targets[0] === 1);
  s = pindian(x, s, a, b); assert.equal(x.runtime.queries.shaLimit(s, 0), 2);
  assert.ok(legalActions(s).some(o => o.data?.type === 'play' && o.data.targets.length === 2 && o.data.targets.includes(2)));
  s.shaUsed = 1; assert.ok(x.runtime.queries.canSha(s, 0, 2));
  s.phase = 'end'; assert.equal(x.runtime.queries.shaLimit(s, 0), 1); s.phase = 'play'; s.turn++;
  assert.equal(x.runtime.queries.shaTargets(s, 0), 1); assert.equal(x.runtime.queries.shaLimit(s, 0), 1); conserved(s);
});

test('天义平局本阶段禁杀，包括实体杀与丈八转化；新回合恢复', () => {
  const x = scene(); x.general(0, 'fire.taishici'); const a = ranked(x.f, 0, 'shan', 'heart', 7), b = ranked(x.f, 1, 'sha', 'spade', 7);
  x.f.hand(0, 'sha'); x.f.hand(0, 'shan'); x.f.equip(0, 'zhangba', 'weapon');
  let s = x.choose(x.start(), d => d.type === 'activeSkill' && d.ability === 'fire.tianyi'); s = pindian(x, s, a, b);
  assert.equal(x.runtime.queries.shaLimit(s, 0), 0); assert.ok(!legalActions(s).some(o => o.data?.type === 'virtualSha' || o.data?.type === 'play' && s.cards[o.data.cid].name === 'sha'));
  s.turn++; assert.equal(x.runtime.queries.shaLimit(s, 0), 1); conserved(s);
});

test('天义与方天画戟可叠加四目标，丈八转化杀也能选择两个目标并逐个结算', () => {
  const x = scene(5); x.general(0, 'fire.taishici'); x.f.equip(0, 'fangtian', 'weapon');
  const a = ranked(x.f, 0, 'shan', 'heart', 13), b = ranked(x.f, 1, 'sha', 'spade', 2), sha = x.f.hand(0, 'sha');
  let s = x.choose(x.start(), d => d.type === 'activeSkill' && d.ability === 'fire.tianyi' && d.targets[0] === 1);
  s = pindian(x, s, a, b); assert.equal(x.runtime.queries.shaTargets(s, 0), 4);
  s = x.choose(s, d => d.type === 'play' && d.cid === sha && d.targets.length === 4);
  for (const actor of [1, 2, 3, 4]) { assert.equal(decision(s)?.actor, actor); s = x.choose(s, d => d.type === 'pass'); }
  assert.ok(s.players.slice(1).every(p => p.hp === 3)); conserved(s);

  const y = scene(5); y.general(0, 'fire.taishici'); y.f.equip(0, 'zhangba', 'weapon');
  const high = ranked(y.f, 0, 'shan', 'heart', 13), low = ranked(y.f, 1, 'sha', 'spade', 2);
  y.f.hand(0, 'shan'); y.f.hand(0, 'tao');
  s = y.choose(y.start(), d => d.type === 'activeSkill' && d.ability === 'fire.tianyi' && d.targets[0] === 1);
  s = pindian(y, s, high, low);
  s = y.choose(s, d => d.type === 'virtualSha' && d.targets.join(',') === '1,3');
  for (const actor of [1, 3]) { assert.equal(decision(s)?.actor, actor); s = y.choose(s, d => d.type === 'pass'); }
  assert.equal(s.players[1].hp, 3); assert.equal(s.players[3].hp, 3); assert.equal(s.shaUsed, 1); conserved(s);
});
for (const cards of ['standard', 'junzheng'] as const) test(`连环可用梅花手牌链两个目标或重铸，不需要军争实体铁索（${cards}）`, () => {
  const x = scene(5, cards); x.general(0, 'fire.pangtong'); const id = x.f.hand(0, 'sha', 'club');
  let s = x.choose(x.start(), d => d.type === 'virtualTrick' && d.transformation === 'fire.lianhuan' && d.targets.join(',') === '1,2');
  assert.ok(s.players[1].chained && s.players[2].chained); assert.ok(s.discard.includes(id)); conserved(s);
  const y = scene(2, cards); y.general(0, 'fire.pangtong'); const club = y.f.hand(0, 'sha', 'club');
  s = y.choose(y.start(), d => d.type === 'virtualRecast' && d.ids[0] === club);
  assert.equal(s.players[0].hand.length, 1); assert.ok(!s.players[1].chained); assert.ok(s.discard.includes(club)); conserved(s);
});

test('涅槃救负血、弃所有区域、重置翻面连环和摸三张；JSON恢复后整局只能一次', () => {
  const x = scene(); x.general(1, 'fire.pangtong'); const hand = x.f.hand(1, 'sha'), equip = x.f.equip(1, 'bagua', 'armor'), delayed = x.f.take('lebu');
  x.f.state.players[1].judge.push(delayed); x.f.state.players[1].faceDown = true; x.f.state.players[1].chained = true;
  let s = x.f.state; damage(s, 1, 0, 5); x.advance(s); assert.equal(decision(s)?.kind, 'contentChoice');
  s = x.choose(JSON.parse(JSON.stringify(s)), d => d.type === 'choose' && 'choice' in d && d.choice === 'recover');
  assert.equal(s.players[1].hp, 3); assert.equal(s.players[1].hand.length, 3); assert.equal(s.players[1].faceDown, false); assert.equal(s.players[1].chained, false);
  assert.ok([hand, equip, delayed].every(id => s.discard.includes(id))); assert.deepEqual(observe(s, 1).self.spentLimitedSkills, ['fire.niepan']);
  damage(s, 1, 0, 5); x.advance(s); assert.notEqual(decision(s)?.kind, 'contentChoice'); conserved(s);
});

test('涅槃弃白银离场回血先结算，四血上限的主公最终仍回复至三血', () => {
  const x = scene(5, 'junzheng', 'identity', ['lord', 'loyalist', 'rebel', 'rebel', 'renegade']); x.general(0, 'fire.pangtong');
  x.f.state.players[0].maxHp = 4; x.f.state.players[0].hp = 1; x.f.equip(0, 'baiyin', 'armor');
  let s = x.f.state; damage(s, 0, 2); x.advance(s);
  s = x.choose(s, d => d.type === 'choose' && d.choice === 'recover');
  assert.equal(s.players[0].hp, 3); assert.equal(s.players[0].hand.length, 3);
  const recoveries = s.events.filter(e => e.kind === 'recovered' && e.data.player === 0);
  assert.equal(recoveries.length, 2); assert.equal(recoveries[0].kind === 'recovered' ? recoveries[0].data.amount : 0, 1); conserved(s);
});

test('八阵仅无防具时提供判定闪，青釭禁用八阵，红色判定闪成功', () => {
  const x = scene(); x.general(1, 'fire.wolong'); const sha = x.f.hand(0, 'sha'); x.f.top('shan', 'heart', 2);
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === sha); assert.ok(legalActions(s).some(o => o.data?.type === 'bagua'));
  s = x.choose(s, d => d.type === 'bagua'); assert.equal(s.players[1].hp, 3); conserved(s);
  const y = scene(); y.general(1, 'fire.wolong'); y.f.equip(0, 'qinggang', 'weapon'); const a = y.f.hand(0, 'sha');
  s = y.choose(y.start(), d => d.type === 'play' && d.cid === a); assert.ok(!legalActions(s).some(o => o.data?.type === 'bagua'));
  const z = scene(2, 'junzheng'); z.general(1, 'fire.wolong'); z.f.equip(1, 'baiyin', 'armor'); assert.equal(z.runtime.queries.autoShan(z.f.state, 1), false);
});

test('火计红手牌当火攻，标准牌也能展示、支付并造成火焰伤害', () => {
  const x = scene(); x.general(0, 'fire.wolong'); const red = x.f.hand(0, 'sha', 'heart'), fee = x.f.hand(0, 'sha', 'club'), reveal = x.f.hand(1, 'sha', 'club');
  let s = x.choose(x.start(), d => d.type === 'virtualTrick' && d.transformation === 'fire.huoji' && d.ids[0] === red && d.targets[0] === 1);
  while (decision(s)?.kind === 'nullify') s = x.choose(s, d => d.type === 'pass');
  s = x.choose(s, d => d.type === 'reveal' && d.cid === reveal); s = x.choose(s, d => d.type === 'discard' && d.cid === fee);
  assert.equal(s.players[1].hp, 3); assert.ok(s.events.some(e => e.kind === 'damaged' && e.data.nature === 'fire' && typeof e.data.card === 'object' && e.data.card?.name === 'huogong')); conserved(s);
});

test('火计奸雄获得使用的子牌而非额外弃牌，双雄决斗不误触发古锭刀的杀增伤', () => {
  const x = scene(); x.general(0, 'fire.wolong'); x.general(1, 'standard.caocao');
  const red = x.f.hand(0, 'sha', 'heart'), fee = x.f.hand(0, 'sha', 'club'), reveal = x.f.hand(1, 'sha', 'club');
  let s = x.choose(x.start(), d => d.type === 'virtualTrick' && d.transformation === 'fire.huoji' && d.ids[0] === red && d.targets[0] === 1);
  while (decision(s)?.kind === 'nullify') s = x.choose(s, d => d.type === 'pass');
  s = x.choose(s, d => d.type === 'reveal' && d.cid === reveal); s = x.choose(s, d => d.type === 'discard' && d.cid === fee);
  s = x.choose(s, d => d.type === 'yes');
  assert.ok(s.players[1].hand.includes(red)); assert.ok(s.discard.includes(fee)); assert.ok(!s.discard.includes(red)); conserved(s);

  const y = scene(2, 'junzheng'); y.general(0, 'fire.yanliangwenchou'); y.f.equip(0, 'guding', 'weapon');
  const black = y.f.hand(0, 'sha', 'club'); s = y.start();
  s.skillUses = [{ owner: 0, ability: 'fire.shuangxiong.color', turn: s.turn, count: 1 }]; s = preparePlayScenario(s, 0, y.runtime);
  s = y.choose(s, d => d.type === 'virtualTrick' && d.transformation === 'fire.shuangxiong' && d.ids[0] === black);
  s = y.choose(s, d => d.type === 'pass');
  assert.equal(s.players[1].hp, 3); assert.ok(s.events.some(e => e.kind === 'damaged' && typeof e.data.card === 'object' && e.data.card?.name === 'juedou')); conserved(s);
});

test('看破黑色手牌可无懈，实体无懈能反制看破，无限嵌套按奇偶生效', () => {
  const x = scene(5); x.general(1, 'fire.wolong'); const trick = x.f.hand(0, 'guohe'), black = x.f.hand(1, 'sha', 'club'), counter = x.f.hand(0, 'wuxie'); x.f.hand(2, 'shan');
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === trick && d.targets[0] === 2);
  if (decision(s)?.actor === 0) s = x.choose(s, d => d.type === 'pass');
  assert.equal(decision(s)?.actor, 1); s = x.choose(s, d => d.type === 'nullify' && d.cid === black && d.transformation === 'fire.kanpo');
  assert.equal(decision(s)?.actor, 0); s = x.choose(s, d => d.type === 'nullify' && d.cid === counter);
  assert.equal(decision(s)?.kind, 'zone'); assert.ok(s.discard.includes(black) && s.discard.includes(counter)); conserved(s);
});

test('乱击仅同花色两手牌，所有其他角色逐一响应；奸雄可获得两张实体子牌', () => {
  const x = scene(5); x.general(0, 'fire.yuanshao'); x.general(1, 'standard.caocao');
  const a = x.f.hand(0, 'sha', 'heart'), b = x.f.hand(0, 'shan', 'heart'); x.f.hand(0, 'sha', 'club');
  let s = x.start(); assert.ok(!legalActions(s).some(o => o.data?.type === 'virtualTrick' && o.data.ids.includes(a) && o.data.ids.some(id => s.cards[id].suit !== 'heart')));
  s = x.choose(s, d => d.type === 'virtualTrick' && d.transformation === 'fire.luanji' && d.ids.join(',') === `${a},${b}`);
  s = x.choose(s, d => d.type === 'pass'); assert.equal(decision(s)?.kind, 'triggerConfirm'); s = x.choose(s, d => d.type === 'yes');
  for (const actor of [2, 3, 4]) { assert.equal(decision(s)?.actor, actor); s = x.choose(s, d => d.type === 'pass'); }
  assert.ok(s.players[1].hand.includes(a) && s.players[1].hand.includes(b)); assert.ok(s.players.slice(1).every(p => p.hp === 3)); conserved(s);
});

test('血裔只在袁绍为主公时生效，群将阵亡后手牌上限立即降低', () => {
  const x = scene(5, 'standard', 'identity', ['lord', 'loyalist', 'rebel', 'rebel', 'renegade']); x.general(0, 'fire.yuanshao'); x.general(1, 'fire.pangde'); x.general(2, 'fire.yanliangwenchou');
  assert.equal(x.runtime.queries.handLimit(x.f.state, 0), 8); x.f.state.players[1].alive = false; assert.equal(x.runtime.queries.handLimit(x.f.state, 0), 6);
  const y = scene(); y.general(0, 'fire.yuanshao'); y.general(1, 'fire.pangde'); assert.equal(y.runtime.queries.handLimit(y.f.state, 0), 4);
});

test('双雄替代摸牌，获得最终判定牌，异色手牌决斗仅本回合出牌阶段有效', () => {
  const x = scene(); x.general(0, 'fire.yanliangwenchou'); const black = x.f.hand(0, 'sha', 'club'), red = x.f.hand(0, 'shan', 'heart');
  const final = rankedTop(x.f, 'sha', 'heart', 7); let s = x.f.state; s.active = 0; resolutionStack.enqueue(s, { kind: 'phaseDraw' }, { kind: 'phasePlay' }); x.advance(s);
  s = x.choose(s, d => d.type === 'skill' && d.ability === 'fire.shuangxiong');
  assert.ok(s.players[0].hand.includes(final)); assert.equal(s.players[0].hand.length, 3);
  assert.ok(legalActions(s).some(o => o.data?.type === 'virtualTrick' && o.data.ids[0] === black));
  assert.ok(!legalActions(s).some(o => o.data?.type === 'virtualTrick' && o.data.ids[0] === red));
  s.turn++; assert.equal(x.runtime.transforms.candidates(s, 0, 'juedou').filter(c => c.virtual).length, 0); conserved(s);
});

test('双雄可被鬼道改判，获取替换后的牌并按新颜色转化', () => {
  const x = scene(); x.general(0, 'fire.yanliangwenchou'); x.general(1, 'wind.zhangjiao'); const replacement = x.f.hand(1, 'sha', 'spade'); const red = x.f.hand(0, 'shan', 'heart'); x.f.top('sha', 'heart');
  let s = x.f.state; s.active = 0; resolutionStack.enqueue(s, { kind: 'phaseDraw' }, { kind: 'phasePlay' }); x.advance(s);
  s = x.choose(s, d => d.type === 'skill' && d.ability === 'fire.shuangxiong'); s = x.choose(s, d => d.type === 'replace' && d.cid === replacement);
  assert.ok(s.players[0].hand.includes(replacement)); assert.ok(legalActions(s).some(o => o.data?.type === 'virtualTrick' && o.data.ids[0] === red)); conserved(s);
});

test('猛进在杀被闪抵消后弃手牌或装备，不能弃判定牌；马术减少计算距离', () => {
  const x = scene(5); x.general(0, 'fire.pangde'); const sha = x.f.hand(0, 'sha'), shan = x.f.hand(1, 'shan'), armor = x.f.equip(1, 'bagua', 'armor'), judge = x.f.take('lebu'); x.f.state.players[1].judge.push(judge);
  assert.equal(x.runtime.queries.distance(x.f.state, 0, 2), 1);
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === sha && d.targets[0] === 1);
  s = x.choose(s, d => d.type === 'respond' && d.ids[0] === shan); s = x.choose(s, d => d.type === 'yes');
  assert.equal(decision(s)?.kind, 'zone'); assert.ok(!legalActions(s).some(o => o.data?.type === 'zone' && o.data.zone === 'judge'));
  s = x.choose(s, d => d.type === 'zone' && d.zone === 'equip' && d.cid === armor);
  assert.equal(s.players[1].hp, 4); assert.equal(s.players[1].equip.armor, null); assert.ok(s.players[1].judge.includes(judge)); conserved(s);
});

test('自然回合流程中双雄可选择正常摸两张，不产生转化标记', () => {
  const x = scene(); x.general(0, 'fire.yanliangwenchou'); let s = x.f.state; startTurn(s); x.advance(s);
  assert.equal(decision(s)?.kind, 'phaseDrawChoice'); s = x.choose(s, d => d.type === 'normal');
  assert.equal(s.players[0].hand.length, 2); assert.equal(x.runtime.transforms.candidates(s, 0, 'juedou').filter(c => c.virtual).length, 0); conserved(s);
});
