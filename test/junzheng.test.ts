import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_DECK, JUNZHENG_DECK, EXPANDED_DECK, cardText, type DamageNature } from '../catalog.ts';
import { GameEngine, preparePlayScenario } from '../engine.ts';
import { expandedContent } from '../src/app/game-content.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { discardOwned, takeOwned } from '../src/rules/operations/cards.ts';
import { startTurn } from '../src/content/standard/flows/turn-flow.ts';
import { observe } from '../src/core/observation-projector.ts';
import { legalActions, decision } from '../src/core/decision-manager.ts';
import type { GameState, ActionData } from '../src/domain/state.ts';
import { fixture, type ScenarioBuilder } from './support/scenario-builder.ts';

const runtime = new ContentRuntime(expandedContent);
const { scheduler, choices } = createStandardResolution(standardModes, runtime.triggers, runtime);
const scenario = (count = 2) => fixture(count, { cards: 'junzheng', ...(count > 2 ? { mode: 'identity' } : {}) });
const start = (f: ScenarioBuilder) => preparePlayScenario(f.state, 0, runtime);
function choose(s: GameState, match: (action: ActionData) => boolean): GameState {
  const choice = legalActions(s).find(option => option.data && match(option.data));
  assert.ok(choice, `缺少选择：${decision(s)?.kind}`);
  return choices.apply(s, choice.id);
}
const play = (s: GameState, cid: number, targets: number[] = []) => choose(s, action =>
  action.type === 'play' && action.cid === cid && action.targets.join(',') === targets.join(','));
const pass = (s: GameState) => choose(s, action => action.type === 'pass');
function elemental(f: ScenarioBuilder, owner: number, nature: DamageNature): number {
  const id = f.state.deck.find(id => f.state.cards[id].name === 'sha' && (f.state.cards[id].nature ?? 'normal') === nature)!;
  assert.ok(id);
  f.state.deck.splice(f.state.deck.indexOf(id), 1);
  f.state.players[owner].hand.push(id);
  return id;
}
function conserved(s: GameState): void {
  const ids = [...s.deck, ...s.discard, ...s.table, ...s.players.flatMap(p =>
    [...p.hand, ...p.judge, ...Object.values(p.equip).filter((id): id is number => id !== null)])];
  assert.equal(ids.length, 160);
  assert.equal(new Set(ids).size, 160);
}

test('军争原包52张与标准108张独立组合，没有新增武将或木牛流马', () => {
  assert.equal(STANDARD_DECK.length, 108);
  assert.equal(JUNZHENG_DECK.length, 52);
  assert.equal(EXPANDED_DECK.length, 160);
  assert.equal(JUNZHENG_DECK.filter(c => c.nature === 'fire').length, 5);
  assert.equal(JUNZHENG_DECK.filter(c => c.nature === 'thunder').length, 9);
  assert.ok(JUNZHENG_DECK.every(c => c.name !== 'muniu'));
  assert.equal(GameEngine.standard().rules.pack.cards.length, 108);
  assert.equal(GameEngine.junzheng().rules.pack.cards.length, 160);
  assert.throws(() => expandedContent.general('junzheng.caocao'), /未知武将/);
});

for (const count of [2, 5, 8]) test(`${count}人：属性杀沿用杀的次数、闪响应和伤害结算`, () => {
  const f = scenario(count);
  const sha = elemental(f, 0, 'fire');
  const thunder = elemental(f, 0, 'thunder');
  const shan = f.hand(1, 'shan');
  let s = play(start(f), sha, [1]);
  assert.match(cardText(s.cards[sha]), /火杀/);
  assert.equal(s.shaUsed, 1);
  assert.equal(decision(s)?.kind, 'respond');
  s = choose(s, a => a.type === 'respond' && a.ids[0] === shan);
  assert.equal(s.players[1].hp, 4);
  assert.ok(!legalActions(s).some(c => c.data?.type === 'play' && c.data.cid === thunder));
  conserved(s);
});

test('酒每回合限一次，下一张杀即使被闪抵消也消耗酒，后续杀不再增伤', () => {
  const f = scenario();
  f.equip(0, 'zhuge', 'weapon');
  const wine = f.hand(0, 'jiu');
  const extraWine = f.hand(0, 'jiu');
  const sha = elemental(f, 0, 'fire');
  const nextSha = elemental(f, 0, 'thunder');
  const shan = f.hand(1, 'shan');
  let s = play(start(f), wine);
  assert.equal(s.players[0].drunk, 1);
  assert.equal(s.jiuUsed, 1);
  assert.ok(!legalActions(s).some(c => c.data?.type === 'play' && c.data.cid === extraWine));
  s = play(s, sha, [1]);
  assert.equal(s.players[0].drunk, undefined);
  s = choose(s, a => a.type === 'respond' && a.ids[0] === shan);
  s = pass(play(s, nextSha, [1]));
  assert.equal(s.players[1].hp, 3);
  startTurn(s);
  assert.equal(s.jiuUsed, 0);
  assert.equal(s.players[0].drunk, undefined);
});

test('濒死只能自用酒，救援不受出牌饮酒次数限制，也不留下增伤', () => {
  const f = scenario();
  const selfWine = f.hand(1, 'jiu');
  f.hand(0, 'jiu');
  f.state.jiuUsed = 1;
  f.state.players[1].hp = 1;
  damage(f.state, 1, 0);
  scheduler.advance(f.state);
  assert.equal(decision(f.state)?.actor, 1);
  let s = choose(f.state, a => a.type === 'save' && a.ids[0] === selfWine);
  assert.equal(s.players[1].hp, 1);
  assert.equal(s.players[1].drunk, undefined);
  assert.equal(s.jiuUsed, 1);
  conserved(s);
  const g = scenario();
  g.hand(0, 'jiu');
  g.state.players[1].hp = 1;
  damage(g.state, 1, 0);
  scheduler.advance(g.state);
  assert.equal(g.state.outcome.status, 'finished', '其他角色的酒不能救治目标');
});

test('连环传播继承初次实际伤害，古锭与裸衣不重复叠加，受伤方防具各结算一次', () => {
  const f = scenario(5);
  f.state.players.forEach(p => { p.hp = p.maxHp = 10; });
  f.state.players[0].general = 'standard.xuzhu';
  f.state.turnMarks = [{ owner: 0, ability: 'standard.luoyi', turn: f.state.turn }];
  f.equip(0, 'guding', 'weapon');
  f.equip(2, 'tengjia', 'armor');
  f.equip(3, 'baiyin', 'armor');
  for (const id of [1, 2, 3]) f.state.players[id].chained = true;
  f.state.players[0].drunk = 1;
  const sha = elemental(f, 0, 'fire');
  const s = pass(play(start(f), sha, [1]));
  const hits = s.events.filter(e => e.kind === 'damaged');
  assert.deepEqual(hits.map(e => [e.data.target, e.data.amount, e.data.nature]), [[1, 4, 'fire'], [2, 5, 'fire'], [3, 1, 'fire']]);
  for (const id of [1, 2, 3]) assert.equal(s.players[id].chained, false);
  assert.equal(s.players[4].hp, 10);
  conserved(s);
});

test('普通伤害保留连环，零伤害不传导，无来源雷电伤害也经过白银狮子', () => {
  const f = scenario(5);
  f.state.players[1].chained = f.state.players[2].chained = true;
  damage(f.state, 1, 0, 1);
  scheduler.advance(f.state);
  assert.equal(f.state.players[2].hp, 4);
  assert.equal(f.state.players[1].chained, true);
  damage(f.state, 1, 0, 0, null, null, { nature: 'fire' });
  scheduler.advance(f.state);
  assert.equal(f.state.players[2].hp, 4);
  f.equip(1, 'baiyin', 'armor');
  damage(f.state, 1, null, 3, null, null, { nature: 'thunder' });
  scheduler.advance(f.state);
  assert.equal(f.state.players[1].hp, 2);
  assert.equal(f.state.players[2].hp, 3);
});

test('连环的濒死救援暂停并恢复，JSON还原后继续传播，奸雄获取实体牌不阻断传播', () => {
  const f = scenario(5);
  f.state.players[1].general = 'standard.caocao';
  f.state.players[1].hp = 1;
  f.state.players[1].chained = f.state.players[2].chained = true;
  const peach = f.hand(1, 'tao');
  const sha = elemental(f, 0, 'fire');
  let s = pass(play(start(f), sha, [1]));
  assert.equal(decision(s)?.kind, 'dying');
  assert.equal(s.players[2].hp, 4);
  s = JSON.parse(JSON.stringify(s));
  s = choose(s, a => a.type === 'save' && a.ids[0] === peach);
  assert.equal(decision(s)?.kind, 'triggerConfirm');
  s = choose(s, a => a.type === 'yes');
  assert.equal(s.players[2].hp, 3);
  assert.ok(s.players[1].hand.includes(sha));
  conserved(s);
});

test('藤甲防普通杀和两种群体锦囊，火杀增伤，雷杀不增伤', () => {
  for (const nature of ['normal', 'fire', 'thunder'] as const) {
    const f = scenario();
    f.equip(1, 'tengjia', 'armor');
    const sha = elemental(f, 0, nature);
    let s = play(start(f), sha, [1]);
    if (nature !== 'normal') s = pass(s);
    assert.equal(s.players[1].hp, nature === 'normal' ? 4 : nature === 'fire' ? 2 : 3);
  }
  for (const name of ['nanman', 'wanjian']) {
    const f = scenario();
    f.equip(1, 'tengjia', 'armor');
    const cid = f.hand(0, name);
    const s = play(start(f), cid);
    assert.equal(decision(s)?.kind, 'play');
    assert.equal(s.players[1].hp, 4);
  }
});

test('青釭剑无视主目标防具，连环受伤的其他角色仍使用防具', () => {
  const f = scenario(5);
  f.equip(0, 'qinggang', 'weapon');
  f.equip(1, 'tengjia', 'armor');
  f.equip(2, 'tengjia', 'armor');
  f.state.players[1].chained = f.state.players[2].chained = true;
  const sha = elemental(f, 0, 'fire');
  const s = pass(play(start(f), sha, [1]));
  assert.equal(s.players[1].hp, 3);
  assert.equal(s.players[2].hp, 2);
});

test('白银狮子离场回复涵盖换装、弃置、被获得；死亡清理不回复或报错', () => {
  for (const reason of ['replace', 'discard', 'gain'] as const) {
    const f = scenario();
    const lion = f.equip(0, 'baiyin', 'armor');
    f.state.players[0].hp = 2;
    let s: GameState;
    if (reason === 'replace') { const armor = f.hand(0, 'bagua'); s = play(start(f), armor); }
    else {
      const before = f.state.events.length;
      if (reason === 'discard') discardOwned(f.state, 0, lion);
      else takeOwned(f.state, 0, 1, lion);
      scheduler.afterStep(f.state, before);
      scheduler.advance(f.state);
      s = f.state;
    }
    assert.equal(s.players[0].hp, 3, reason);
    assert.equal(s.events.filter(e => e.kind === 'recovered').length, 1);
  }
  const f = scenario();
  f.equip(1, 'baiyin', 'armor');
  f.state.players[1].hp = 1;
  damage(f.state, 1, 0);
  scheduler.advance(f.state);
  assert.equal(f.state.outcome.status, 'finished');
  assert.equal(f.state.players[1].alive, false);
  conserved(f.state);
});

test('朱雀只转换本次普通杀，一次准备作用于全部目标，不改变实体牌或雷杀', () => {
  const f = scenario();
  f.equip(0, 'zhuque', 'weapon');
  f.equip(1, 'tengjia', 'armor');
  const sha = elemental(f, 0, 'normal');
  let s = play(start(f), sha, [1]);
  assert.equal(decision(s)?.kind, 'attackPrepare');
  s = choose(JSON.parse(JSON.stringify(s)), a => a.type === 'yes');
  s = pass(s);
  assert.equal(s.players[1].hp, 2);
  assert.equal(s.cards[sha].nature, undefined);
  const g = scenario();
  g.equip(0, 'zhuque', 'weapon');
  const thunder = elemental(g, 0, 'thunder');
  assert.equal(decision(play(start(g), thunder, [1]))?.kind, 'respond');
});

test('方天多目标共享同一次酒增伤；后续青龙追击不会重复获得酒加成', () => {
  const f = scenario(5);
  f.equip(0, 'fangtian', 'weapon');
  const wine = f.hand(0, 'jiu');
  const sha = elemental(f, 0, 'normal');
  let s = play(start(f), wine);
  s = play(s, sha, [1, 2]);
  s = pass(pass(s));
  assert.equal(s.players[1].hp, 2);
  assert.equal(s.players[2].hp, 2);
  const g = scenario();
  g.equip(0, 'qinglong', 'weapon');
  const wine2 = g.hand(0, 'jiu');
  const first = elemental(g, 0, 'fire');
  const second = elemental(g, 0, 'thunder');
  const shan = g.hand(1, 'shan');
  let t = play(start(g), wine2);
  t = choose(play(t, first, [1]), a => a.type === 'respond' && a.ids[0] === shan);
  t = choose(t, a => a.type === 'qinglong' && a.ids[0] === second);
  t = pass(t);
  assert.equal(t.players[1].hp, 3);
});

test('流离转移保留酒加成和伤害属性，铁骑红判定不丢弃属性', () => {
  const f = scenario(5);
  f.equip(0, 'qilin', 'weapon');
  f.state.players[1].general = 'standard.daqiao';
  const red = f.hand(1, 'shan', 'heart');
  f.equip(2, 'tengjia', 'armor');
  f.state.players[0].drunk = 1;
  const sha = elemental(f, 0, 'fire');
  let s = play(start(f), sha, [1]);
  s = choose(s, a => a.type === 'redirect' && a.card === red && a.target === 2);
  s = pass(s);
  assert.equal(s.players[1].hp, 4);
  assert.equal(s.players[2].hp, 1);
  const g = scenario();
  g.state.players[0].general = 'standard.machao';
  g.equip(1, 'tengjia', 'armor');
  const fire = elemental(g, 0, 'fire');
  g.top('shan', 'heart');
  let t = play(start(g), fire, [1]);
  t = choose(t, a => a.type === 'yes');
  assert.equal(t.players[1].hp, 2);
});

test('火攻展示由目标选择，信息只公开所展示牌；匹配花色费用可放弃，并经过无懈', () => {
  const f = scenario();
  const fire = f.hand(0, 'huogong');
  const cost = f.hand(0, 'sha', 'heart');
  const show = f.hand(1, 'shan', 'heart');
  const hidden = f.hand(1, 'sha', 'spade');
  let s = play(start(f), fire, [1]);
  assert.equal(decision(s)?.kind, 'fireAttackReveal');
  assert.ok(!observe(s, 0).eventCards?.[hidden]);
  s = choose(s, a => a.type === 'reveal' && a.cid === show);
  assert.equal(decision(s)?.kind, 'fireAttackPay');
  assert.equal(observe(s, 0).eventCards?.[show]?.name, 'shan');
  assert.ok(!observe(s, 0).eventCards?.[hidden]);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(pass(restored).players[1].hp, 4);
  s = choose(s, a => a.type === 'discard' && a.cid === cost);
  assert.equal(s.players[1].hp, 3);
  assert.ok(s.discard.includes(cost));
  assert.ok(s.players[1].hand.includes(show));
  conserved(s);
  const g = scenario();
  const fire2 = g.hand(0, 'huogong');
  const counter = g.hand(1, 'wuxie');
  let t = play(start(g), fire2, [1]);
  t = choose(t, a => a.type === 'nullify' && a.cid === counter);
  assert.equal(decision(t)?.kind, 'play');
  assert.ok(!t.events.some(e => e.kind === 'cardRevealed'));
});

test('火攻可对自己使用，无手牌角色不可指定，没有同花色费用时自然结束', () => {
  const f = scenario();
  const fire = f.hand(0, 'huogong');
  const show = f.hand(0, 'sha');
  let s = start(f);
  assert.ok(!legalActions(s).some(c => c.data?.type === 'play' && c.data.cid === fire && c.data.targets[0] === 1));
  s = play(s, fire, [0]);
  s = choose(s, a => a.type === 'reveal' && a.cid === show);
  s = choose(s, a => a.type === 'discard' && a.cid === show);
  assert.equal(s.players[0].hp, 3);
  const g = scenario();
  const fire2 = g.hand(0, 'huogong');
  const targetCard = g.hand(1, 'sha');
  const t = choose(play(start(g), fire2, [1]), a => a.type === 'reveal' && a.cid === targetCard);
  assert.equal(decision(t)?.kind, 'play');
});

test('铁索至多两人含自己，可解除已有连环；每个目标单独无懈，重铸不发动集智', () => {
  const f = scenario(5);
  const chain = f.hand(0, 'tiesuo');
  f.state.players[1].chained = true;
  let s = play(start(f), chain, [0, 1]);
  assert.equal(s.players[0].chained, true);
  assert.equal(s.players[1].chained, false);
  const g = scenario(5);
  const chain2 = g.hand(0, 'tiesuo');
  const counter = g.hand(1, 'wuxie');
  let t = play(start(g), chain2, [1, 2]);
  t = choose(t, a => a.type === 'nullify' && a.cid === counter);
  assert.equal(t.players[1].chained, undefined);
  assert.equal(t.players[2].chained, true);
  const h = scenario();
  h.state.players[0].general = 'standard.huangyueying';
  const recast = h.hand(0, 'tiesuo');
  const before = h.state.players[0].hand.length;
  s = choose(start(h), a => a.type === 'recast' && a.cid === recast);
  assert.equal(s.players[0].hand.length, before);
  assert.ok(s.discard.includes(recast));
  assert.ok(!s.events.some(e => e.kind === 'cardUsed' || e.kind === 'skillActivated'));
});

test('兵粮限制距离与重复判定区，梅花成功，其余花色跳过摸牌且不发动英姿', () => {
  for (const suit of ['club', 'heart'] as const) {
    const f = scenario(5);
    const supply = f.hand(0, 'bingliang');
    let s = start(f);
    assert.ok(!legalActions(s).some(c => c.data?.type === 'play' && c.data.cid === supply && c.data.targets[0] === 2));
    s = play(s, supply, [1]);
    const second = s.deck.find(id => s.cards[id].name === 'bingliang')!;
    s.deck.splice(s.deck.indexOf(second), 1); s.players[0].hand.push(second);
    s = preparePlayScenario(s, 0, runtime);
    assert.ok(!legalActions(s).some(c => c.data?.type === 'play' && c.data.cid === second && c.data.targets[0] === 1));
    const result = s.deck.find(id => s.cards[id].suit === suit)!;
    s.deck.splice(s.deck.indexOf(result), 1); s.deck.push(result);
    s.players[1].general = 'standard.zhouyu';
    s.active = 1; s.resolution = resolutionStack.initial();
    resolutionStack.enqueue(s, { kind: 'phaseStart' }, { kind: 'phaseJudge' }, { kind: 'phaseDraw' }, { kind: 'phasePlay' });
    scheduler.advance(s);
    assert.equal(s.players[1].hand.length, suit === 'club' ? 3 : 0);
    assert.ok(s.discard.includes(supply));
    assert.equal(Boolean(s.skipDraw), suit !== 'club');
  }
});

test('属性杀可响应决斗与南蛮，武圣转化火杀成为普通杀', () => {
  const f = scenario();
  const duel = f.hand(0, 'juedou');
  const fire = elemental(f, 1, 'fire');
  let s = play(start(f), duel, [1]);
  s = choose(s, a => a.type === 'respond' && a.ids[0] === fire);
  assert.equal(decision(s)?.actor, 0);
  const g = scenario();
  g.state.players[0].general = 'standard.guanyu';
  g.equip(1, 'tengjia', 'armor');
  const redFire = elemental(g, 0, 'fire');
  let t = choose(start(g), a => a.type === 'virtualSha' && a.ids[0] === redFire);
  assert.equal(decision(t)?.kind, 'play');
  assert.equal(t.players[1].hp, 4);
});
