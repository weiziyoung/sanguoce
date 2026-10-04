import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardRuleset } from '../engine.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import type { ActionMap, GameState } from '../src/domain/state.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { fixture } from './support/scenario-builder.ts';
import { damage } from '../src/content/standard/flows/damage-flow.ts';
import { name } from '../src/domain/state-access.ts';
import { standardGeneralDefinitions } from '../src/content/standard/generals.ts';

const rules = new StandardRuleset();
const runtime = new ContentRuntime(standardContent);
test('2008 标准包 25 名武将各有独立定义且技能全部由内容注册表解析', () => {
  const expected = ['caocao', 'simayi', 'xiahoudun', 'zhangliao', 'xuzhu', 'guojia', 'zhenji',
    'liubei', 'guanyu', 'zhangfei', 'zhugeliang', 'zhaoyun', 'machao', 'huangyueying',
    'sunquan', 'ganning', 'lvmeng', 'huanggai', 'zhouyu', 'daqiao', 'luxun', 'sunshangxiang',
    'huatuo', 'lvbu', 'diaochan'].map(name => `standard.${name}`).sort();
  assert.deepEqual(standardGeneralDefinitions.map(general => general.id).sort(), expected);
  for (const general of standardGeneralDefinitions) {
    assert.ok(general.label && general.sex && general.group && general.hp);
    assert.deepEqual(standardContent.general(general.id), general);
    for (const ability of general.abilities) assert.ok(standardContent.requireSkill(ability));
  }
});
function play(state: GameState): void {
  state.active = 0;
  state.resolution = resolutionStack.initial();
  resolutionStack.enqueue(state, { kind: 'phasePlay' }, { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(state);
}
function drawPhase(state: GameState): void {
  state.active = 0;
  state.resolution = resolutionStack.initial();
  resolutionStack.enqueue(state, { kind: 'phaseDraw' }, { kind: 'phasePlay' },
    { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(state);
}
function choose(state: GameState, predicate: (action: ActionMap[keyof ActionMap]) => boolean): GameState {
  const option = legalActions(state).find(option => option.data && predicate(option.data));
  assert.ok(option, `缺少行动：${decision(state)?.title}`);
  return rules.apply(state, option.id);
}

test('正式标准武将使用自身性别、势力和体力；无武将建局保持固定体力', () => {
  const state = rules.create({ seed: 7, players: [
    { label: '黄月英', sex: 'male', general: 'standard.huangyueying' },
    { label: '无武将', sex: 'male' },
  ] });
  assert.equal(state.players[0].sex, 'female');
  assert.equal(state.players[0].group, 'shu');
  assert.equal(state.players[0].maxHp, 3);
  assert.equal(state.players[1].maxHp, 4);
  assert.equal(rules.observe(state, 1).others[0].group, 'shu');
});

for (const count of [2, 5, 8]) {
  test(`${count} 人：正式张飞咆哮可连续出杀，关羽武圣可用装备区红牌当杀`, () => {
    const f = fixture(count, count === 2 ? {} : { mode: 'identity' });
    f.state.players[0].general = 'standard.zhangfei';
    const first = f.hand(0, 'sha');
    const second = f.hand(0, 'sha');
    play(f.state);
    let state = choose(f.state, action => action.type === 'play' && action.cid === first && action.targets.includes(1));
    state = choose(state, action => action.type === 'pass');
    assert.equal(decision(state)?.kind, 'play');
    assert.ok(legalActions(state).some(option => option.data?.type === 'play' && option.data.cid === second));

    const g = fixture(count, count === 2 ? {} : { mode: 'identity' });
    g.state.players[0].general = 'standard.guanyu';
    const weapon = g.take('zhuge', 'diamond');
    g.state.players[0].equip.weapon = weapon;
    play(g.state);
    const virtual = legalActions(g.state).find(option => option.data?.type === 'virtualSha' &&
      option.data.transformation === 'standard.wusheng' && option.data.ids.includes(weapon));
    assert.ok(virtual);
    state = rules.apply(g.state, virtual.id);
    assert.equal(state.players[0].equip.weapon, null);
    assert.ok(state.discard.includes(weapon));
  });
}

test('正式赵云龙胆在主动与响应中共用转化服务', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.zhaoyun';
  f.state.players[1].general = 'standard.zhaoyun';
  const offense = f.hand(0, 'shan');
  const defense = f.hand(1, 'sha');
  play(f.state);
  let state = choose(f.state, action => action.type === 'virtualSha' &&
    action.transformation === 'standard.longdan.sha' && action.ids.includes(offense));
  state = choose(state, action => action.type === 'respond' &&
    action.transformation === 'standard.longdan.shan' && action.ids.includes(defense));
  assert.equal(state.players[1].hp, 4);
  assert.ok(state.discard.includes(offense));
  assert.ok(state.discard.includes(defense));
});

test('正式黄月英奇才扩大顺手牵羊距离，普通锦囊只触发一次集智', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.huangyueying';
  const trick = f.hand(0, 'shunshou');
  f.hand(2, 'shan');
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.cid === trick && action.targets[0] === 2);
  assert.notEqual(decision(state)?.kind, 'triggerConfirm');
  while (decision(state)?.kind === 'nullify') state = choose(state, action => action.type === 'pass');
  assert.equal(state.events.filter(event => event.kind === 'triggerInvoked' &&
    event.data.definition === 'standard.jizhi').length, 1);
  assert.ok(rules.observe(state, 0).events.some(event => event.kind === 'skillActivated' &&
    event.data.ability === 'standard.jizhi' && event.data.owner === 0));
});

test('正式华佗回合外急救可把红色装备当桃救治，并保留青囊主动技能', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[2].general = 'standard.huatuo';
  const horse = f.take('chitu', 'heart');
  f.state.players[2].equip.minusHorse = horse;
  f.state.players[1].hp = 1;
  f.state.active = 0;
  damage(f.state, 1, 0);
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  assert.equal(decision(f.state)?.actor, 2);
  const state = choose(f.state, action => action.type === 'save' &&
    action.transformation === 'standard.jijiu' && action.ids.includes(horse));
  assert.equal(state.players[1].hp, 1);
  assert.ok(state.discard.includes(horse));
  assert.equal(state.players[2].equip.minusHorse, null);
  assert.ok(runtime.abilities.has(state, 2, 'standard.qingnang'));
});

test('身份局孙权作为主公受到吴势力角色用桃救治时回复两点', () => {
  const f = fixture(5, { mode: 'identity', roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] });
  f.state.players[0].general = 'standard.sunquan';
  f.state.players[2].general = 'standard.sunquan';
  f.state.players[2].group = 'wu';
  const peach = f.hand(2, 'tao');
  f.state.players[0].hp = 0;
  f.state.active = 1;
  damage(f.state, 0, 1);
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  assert.equal(decision(f.state)?.actor, 2);
  const state = choose(f.state, action => action.type === 'save' && action.ids.includes(peach));
  assert.equal(state.players[0].hp, 1);
  assert.ok(state.discard.includes(peach));
});

test('正式司马懿受伤后反馈可选择获得来源装备，拒绝时不改变牌区', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[1].general = 'standard.simayi';
  const weapon = f.equip(0, 'qinglong', 'weapon');
  damage(f.state, 1, 0);
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  assert.equal(decision(f.state)?.kind, 'triggerConfirm');
  const rejected = choose(f.state, action => action.type === 'no');
  assert.equal(rejected.players[0].equip.weapon, weapon);
  let state = choose(f.state, action => action.type === 'yes');
  assert.equal(decision(state)?.kind, 'zone');
  const resumed = JSON.parse(JSON.stringify(state)) as GameState;
  state = choose(state, action => action.type === 'zone' && action.zone === 'equip' && action.cid === weapon);
  assert.deepEqual(state, choose(resumed, action => action.type === 'zone' && action.zone === 'equip' && action.cid === weapon));
  assert.ok(state.players[1].hand.includes(weapon));
  assert.equal(state.players[0].equip.weapon, null);
});

test('正式吕蒙未在出牌阶段使用杀可选择跳过弃牌，拒绝后仍正常弃牌', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.lvmeng';
  for (let i = 0; i < 5; i++) f.hand(0, 'sha');
  play(f.state);
  const offer = choose(f.state, action => action.type === 'endPlay');
  assert.equal(decision(offer)?.kind, 'phaseDiscardChoice');
  const skipped = choose(offer, action => action.type === 'skip');
  assert.equal(skipped.players[0].hand.length, 5);
  const declined = choose(offer, action => action.type === 'continue');
  assert.equal(decision(declined)?.kind, 'discard');
  assert.equal(declined.players[0].hand.length, 5);

  const g = fixture();
  g.state.players[0].general = 'standard.lvmeng';
  const attack = g.hand(0, 'sha');
  for (let i = 0; i < 5; i++) g.hand(0, 'sha');
  play(g.state);
  let state = choose(g.state, action => action.type === 'play' && action.cid === attack);
  state = choose(state, action => action.type === 'pass');
  state = choose(state, action => action.type === 'endPlay');
  assert.notEqual(decision(state)?.kind, 'phaseDiscardChoice');
});

test('正式张辽突袭替代正常摸牌，可选择至多两名有手牌角色', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.zhangliao';
  f.hand(1, 'shan');
  f.hand(2, 'sha');
  drawPhase(f.state);
  assert.equal(decision(f.state)?.kind, 'phaseDrawChoice');
  const normal = choose(f.state, action => action.type === 'normal');
  assert.equal(normal.players[0].hand.length, 2);
  const stolen = choose(f.state, action => action.type === 'skill' && action.ability === 'standard.tuxi' &&
    action.choice === '1:2');
  assert.equal(stolen.players[0].hand.length, 2);
  assert.equal(stolen.players[1].hand.length, 0);
  assert.equal(stolen.players[2].hand.length, 0);
});

test('正式许褚裸衣少摸一张，本回合杀造成两点伤害', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.xuzhu';
  const attack = f.hand(0, 'sha');
  drawPhase(f.state);
  let state = choose(f.state, action => action.type === 'skill' && action.ability === 'standard.luoyi');
  assert.equal(state.players[0].hand.length, 2);
  state = choose(state, action => action.type === 'play' && action.cid === attack);
  state = choose(state, action => action.type === 'pass');
  assert.equal(state.players[1].hp, 2);
  assert.ok(state.events.some(event => event.kind === 'damaged' && event.data.amount === 2));
});

test('正式周瑜英姿自动摸三张并进入出牌阶段，反间由目标猜花色并据此结算伤害', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.zhouyu';
  drawPhase(f.state);
  assert.equal(f.state.players[0].hand.length, 3);
  assert.equal(decision(f.state)?.kind, 'play');
  assert.equal(f.state.events.filter(event => event.kind === 'skillActivated' &&
    event.data.ability === 'standard.yingzi').length, 1);
  assert.ok(f.state.events.some(event => event.kind === 'drawn' && event.data.player === 0 && event.data.count === 3));

  const g = fixture(5, { mode: 'identity' });
  g.state.players[0].general = 'standard.zhouyu';
  const card = g.hand(0, 'sha', 'spade');
  play(g.state);
  let state = choose(g.state, action => action.type === 'activeSkill' &&
    action.ability === 'standard.fanjian' && action.targets[0] === 1);
  assert.equal(decision(state)?.actor, 1);
  state = choose(state, action => 'choice' in action && action.choice === 'heart');
  assert.ok(state.players[1].hand.includes(card));
  assert.equal(state.players[1].hp, 3);
  assert.equal(state.skillUses?.find(item => item.ability === 'standard.fanjian')?.count, 1);
});

for (const count of [2, 5, 8]) {
  test(`${count} 人：英姿自动摸牌，不产生摸牌技能选择`, () => {
    const f = fixture(count, count === 2 ? {} : { mode: 'identity' });
    f.state.players[0].general = 'standard.zhouyu';
    f.hand(0, 'shan');
    drawPhase(f.state);
    assert.equal(f.state.players[0].hand.length, 4);
    assert.equal(decision(f.state)?.kind, 'play');
    assert.equal(f.state.events.filter(event => event.kind === 'skillActivated' &&
      event.data.ability === 'standard.yingzi').length, 1);
  });
}

test('正式黄盖苦肉先失去体力再摸两张；致死且未获救时不继续摸牌', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.huanggai';
  play(f.state);
  let state = choose(f.state, action => action.type === 'activeSkill' && action.ability === 'standard.kurou');
  assert.equal(state.players[0].hp, 3);
  assert.equal(state.players[0].hand.length, 2);
  assert.ok(state.events.some(event => event.kind === 'hpLost' && event.data.player === 0));

  const g = fixture();
  g.state.players[0].general = 'standard.huanggai';
  g.state.players[0].hp = 1;
  play(g.state);
  state = choose(g.state, action => action.type === 'activeSkill' && action.ability === 'standard.kurou');
  assert.equal(state.players[0].alive, false);
  assert.equal(state.players[0].hand.length, 0);
});

test('正式马超马术缩短距离，铁骑红色判定使杀跳过闪响应', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.machao';
  const attack = f.hand(0, 'sha');
  f.hand(2, 'shan');
  f.top('tao', 'heart');
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.cid === attack && action.targets[0] === 2);
  assert.equal(decision(state)?.kind, 'triggerConfirm');
  state = choose(state, action => action.type === 'yes');
  assert.equal(state.players[2].hp, 3);
  assert.equal(decision(state)?.kind, 'play');
  assert.ok(state.events.some(event => event.kind === 'judged' && event.data.reason === 'standard.tieji'));
});

test('司马懿鬼才可改马超铁骑判定，黑色结果仍允许打出闪', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.machao';
  f.state.players[1].general = 'standard.simayi';
  const attack = f.hand(0, 'sha');
  const replacement = f.hand(1, 'sha', 'spade');
  const defense = f.hand(2, 'shan');
  f.top('tao', 'heart');
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.cid === attack && action.targets[0] === 2);
  state = choose(state, action => action.type === 'yes');
  assert.equal(decision(state)?.kind, 'judgeReplace');
  state = choose(state, action => action.type === 'replace' && action.cid === replacement);
  assert.equal(decision(state)?.kind, 'respond');
  state = choose(state, action => action.type === 'respond' && action.ids.includes(defense));
  assert.equal(state.players[2].hp, 4);
});

test('正式夏侯惇刚烈使用共用判定，非红桃时来源可选择受伤', () => {
  const f = fixture(5, { mode: 'identity', roles: ['loyalist', 'rebel', 'rebel', 'renegade', 'lord'] });
  f.state.players[1].general = 'standard.xiahoudun';
  f.hand(0, 'sha'); f.hand(0, 'shan'); f.hand(0, 'tao');
  const black = f.state.deck.find(id => ['spade', 'club'].includes(f.state.cards[id].suit));
  assert.ok(black);
  f.state.deck.splice(f.state.deck.indexOf(black), 1);
  f.state.deck.push(black);
  damage(f.state, 1, 0);
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  let state = choose(f.state, action => action.type === 'yes');
  assert.equal(decision(state)?.kind, 'skillJudgementChoice');
  const discardOptions = decision(state)!.options.filter(option =>
    (option.data as { choice?: string } | undefined)?.choice?.startsWith('discard:'));
  assert.ok(discardOptions.length > 1);
  assert.ok(discardOptions.every(option => {
    const ids = (option.data as { ids?: number[] }).ids;
    return ids?.length === 2 && ids.every(id => state.players[0].hand.includes(id));
  }));
  const chosenIds = (discardOptions[0].data as { ids: number[] }).ids;
  const discarded = rules.apply(state, discardOptions[0].id);
  assert.ok(chosenIds.every(id => discarded.discard.includes(id)));
  assert.equal(discarded.players[0].hp, 4);
  state = choose(state, action => action.type === 'choose' && action.choice === 'damage');
  assert.equal(state.players[0].hp, 3);
  assert.equal(state.players[1].hp, 3);
  assert.ok(state.events.some(event => event.kind === 'judged' && event.data.reason === 'standard.ganglie'));
});

test('正式甄姬洛神黑色判定可获得并重复，红色结束；倾国可把黑牌当闪', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhenji';
  const red = f.top('tao', 'heart');
  const black = f.top('sha', 'spade', 7);
  f.state.active = 0;
  f.state.resolution = resolutionStack.initial();
  resolutionStack.enqueue(f.state, { kind: 'phaseStart' }, { kind: 'phaseDraw' },
    { kind: 'phasePlay' }, { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  let state = choose(f.state, action => action.type === 'yes');
  assert.ok(state.players[0].hand.includes(black));
  assert.equal(decision(state)?.kind, 'phaseStartChoice');
  state = choose(state, action => action.type === 'yes');
  assert.ok(state.discard.includes(red));
  assert.equal(state.events.filter(event => event.kind === 'judged' &&
    event.data.reason === 'standard.luoshen').length, 2);

  const g = fixture();
  g.state.players[1].general = 'standard.zhenji';
  g.hand(0, 'sha');
  const defense = g.hand(1, 'sha', 'spade');
  play(g.state);
  state = choose(g.state, action => action.type === 'play');
  state = choose(state, action => action.type === 'respond' &&
    action.transformation === 'standard.qingguo' && action.ids.includes(defense));
  assert.equal(state.players[1].hp, 4);
});

test('郭嘉天妒在八卦判定结算后获得最终判定牌', () => {
  const f = fixture();
  f.state.players[1].general = 'standard.guojia';
  f.equip(1, 'bagua', 'armor');
  const judgement = f.top('tao', 'heart');
  f.hand(0, 'sha');
  play(f.state);
  let state = choose(f.state, action => action.type === 'play');
  state = choose(state, action => action.type === 'bagua');
  assert.notEqual(decision(state)?.kind, 'triggerConfirm');
  assert.ok(state.players[1].hand.includes(judgement));
  assert.ok(!state.discard.includes(judgement));
  assert.equal(state.players[1].hp, 4);
});

test('郭嘉遗计对两点伤害逐点触发并分配四张牌，保存恢复后结果一致', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[1].general = 'standard.guojia';
  damage(f.state, 1, 0, 2);
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  let state = choose(f.state, action => action.type === 'yes');
  assert.equal(decision(state)?.kind, 'distribution');
  const first = (legalActions(state).find(option => option.data?.type === 'assign' && option.data.target === 2)?.data);
  assert.ok(first?.type === 'assign');
  state = choose(state, action => action.type === 'assign' && action.card === first.card && action.target === 2);
  const resumed = JSON.parse(JSON.stringify(state)) as GameState;
  state = choose(state, action => action.type === 'assign' && action.target === 1);
  assert.deepEqual(state, choose(resumed, action => action.type === 'assign' && action.target === 1));
  assert.equal(decision(state)?.kind, 'triggerConfirm');
  state = choose(state, action => action.type === 'yes');
  state = choose(state, action => action.type === 'assign' && action.target === 2);
  state = choose(state, action => action.type === 'assign' && action.target === 1);
  assert.equal(state.players[1].hp, 2);
  assert.equal(state.players[1].hand.length, 2);
  assert.equal(state.players[2].hand.length, 2);
  assert.equal(state.events.filter(event => event.kind === 'triggerInvoked' &&
    event.data.definition === 'standard.yiji').length, 2);
});

test('貂蝉离间由第一名男性向第二名发起决斗，第二名不出杀则受伤；闭月在结束阶段摸牌', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.diaochan';
  f.state.players[0].sex = 'female';
  const initiatorHp = f.state.players[2].hp;
  const targetHp = f.state.players[4].hp;
  const cost = f.hand(0, 'sha');
  play(f.state);
  let state = choose(f.state, action => action.type === 'activeSkill' &&
    action.ability === 'standard.lijian' && action.ids.includes(cost) &&
    action.targets[0] === 2 && action.targets[1] === 4);
  assert.equal(decision(state)?.kind, 'respond');
  assert.equal(decision(state)?.actor, 4);
  state = choose(state, action => action.type === 'pass');
  assert.equal(state.players[2].hp, initiatorHp);
  assert.equal(state.players[4].hp, targetHp - 1);
  assert.ok(state.discard.includes(cost));
  state = choose(state, action => action.type === 'endPlay');
  assert.notEqual(decision(state)?.kind, 'phaseEndChoice');
  assert.equal(state.players[0].hand.length, 1);
  assert.equal(state.active, 1);
});

test('离间目标出杀后轮到发起者出杀，发起者不出则由目标造成伤害', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.diaochan';
  f.state.players[0].sex = 'female';
  const cost = f.hand(0, 'shan');
  const reply = f.hand(4, 'sha');
  const initiatorHp = f.state.players[2].hp;
  const targetHp = f.state.players[4].hp;
  play(f.state);
  let state = choose(f.state, action => action.type === 'activeSkill' &&
    action.ability === 'standard.lijian' && action.ids.includes(cost) &&
    action.targets[0] === 2 && action.targets[1] === 4);
  assert.equal(decision(state)?.actor, 4);
  state = choose(state, action => action.type === 'respond' && action.ids.includes(reply));
  assert.equal(decision(state)?.actor, 2);
  state = choose(state, action => action.type === 'pass');
  assert.equal(state.players[2].hp, initiatorHp - 1);
  assert.equal(state.players[4].hp, targetHp);
});

test('诸葛亮观星把所选牌按次序放到牌堆顶与底，选择过程可序列化恢复', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhugeliang';
  const first = f.top('shan');
  const second = f.top('sha');
  f.state.active = 0;
  f.state.resolution = resolutionStack.initial();
  resolutionStack.enqueue(f.state, { kind: 'phaseStart' }, { kind: 'phasePlay' });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  let state = choose(f.state, action => action.type === 'yes');
  assert.equal(decision(state)?.kind, 'deckReorder');
  state = choose(state, action => action.type === 'place' && action.card === second && action.side === 'bottom');
  const resumed = JSON.parse(JSON.stringify(state)) as GameState;
  state = choose(state, action => action.type === 'place' && action.card === first && action.side === 'top');
  assert.deepEqual(state, choose(resumed, action => action.type === 'place' && action.card === first && action.side === 'top'));
  assert.equal(state.deck[0], second);
  assert.equal(state.deck.at(-1), first);
  assert.equal(decision(state)?.kind, 'play');
});

test('诸葛亮空城时不能成为杀或决斗的目标，获得手牌后恢复可选目标', () => {
  const f = fixture();
  f.state.players[1].general = 'standard.zhugeliang';
  const attack = f.hand(0, 'sha');
  const duel = f.hand(0, 'juedou');
  play(f.state);
  assert.ok(!legalActions(f.state).some(option => option.data?.type === 'play' &&
    (option.data.cid === attack || option.data.cid === duel)));
  const g = fixture();
  g.state.players[1].general = 'standard.zhugeliang';
  const attack2 = g.hand(0, 'sha');
  const duel2 = g.hand(0, 'juedou');
  g.hand(1, 'shan');
  play(g.state);
  assert.ok(legalActions(g.state).some(option => option.data?.type === 'play' && option.data.cid === attack2));
  assert.ok(legalActions(g.state).some(option => option.data?.type === 'play' && option.data.cid === duel2));
});

test('甘宁奇袭把黑牌作为过河拆桥，进入共用无懈与拆牌流程', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.ganning';
  const cost = f.hand(0, 'sha', 'spade');
  const targetCard = f.hand(1, 'shan');
  play(f.state);
  let state = choose(f.state, action => action.type === 'virtualTrick' &&
    action.cname === 'guohe' && action.ids.includes(cost) && action.targets[0] === 1);
  assert.equal(decision(state)?.kind, 'zone');
  state = choose(state, action => action.type === 'zone' && action.zone === 'hand');
  assert.ok(state.discard.includes(cost));
  assert.ok(state.discard.includes(targetCard));
  assert.equal(state.players[1].hand.length, 0);
  assert.ok(state.events.some(event => event.kind === 'cardUsed' &&
    event.data.effectiveName === 'guohe'));

  const g = fixture(5, { mode: 'identity' });
  g.state.players[0].general = 'standard.ganning';
  const cost2 = g.hand(0, 'sha', 'spade');
  const retained = g.hand(1, 'shan');
  const nullifier = g.hand(2, 'wuxie');
  play(g.state);
  state = choose(g.state, action => action.type === 'virtualTrick' && action.ids.includes(cost2));
  while (decision(state)?.kind === 'nullify' && decision(state)?.actor !== 2) {
    state = choose(state, action => action.type === 'pass');
  }
  state = choose(state, action => action.type === 'nullify' && action.cid === nullifier);
  while (decision(state)?.kind === 'nullify') state = choose(state, action => action.type === 'pass');
  assert.ok(state.players[1].hand.includes(retained));
});

test('吕布无双要求目标连续打出两张闪，只有一张仍受到杀的伤害', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.lvbu';
  const attack = f.hand(0, 'sha');
  const first = f.hand(1, 'shan');
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.cid === attack);
  state = choose(state, action => action.type === 'respond' && action.ids.includes(first));
  assert.equal(decision(state)?.kind, 'respond');
  assert.equal(decision(state)?.actor, 1);
  state = choose(state, action => action.type === 'pass');
  assert.equal(state.players[1].hp, 3);

  const g = fixture();
  g.state.players[0].general = 'standard.lvbu';
  g.hand(0, 'sha');
  const dodge1 = g.hand(1, 'shan');
  const dodge2 = g.hand(1, 'shan');
  play(g.state);
  state = choose(g.state, action => action.type === 'play');
  state = choose(state, action => action.type === 'respond' && action.ids.includes(dodge1));
  state = choose(state, action => action.type === 'respond' && action.ids.includes(dodge2));
  assert.equal(state.players[1].hp, 4);
});

test('吕布参与决斗时，对手每轮必须打出两张杀', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.lvbu';
  const duel = f.hand(0, 'juedou');
  const response = f.hand(1, 'sha');
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.cid === duel);
  state = choose(state, action => action.type === 'respond' && action.ids.includes(response));
  assert.equal(decision(state)?.actor, 1);
  state = choose(state, action => action.type === 'pass');
  assert.equal(state.players[1].hp, 3);
});

test('曹操奸雄在受伤后获得仍在处理区的杀，原用牌清理不会再弃置它', () => {
  const f = fixture();
  f.state.players[1].general = 'standard.caocao';
  const attack = f.hand(0, 'sha');
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.cid === attack);
  state = choose(state, action => action.type === 'pass');
  assert.equal(decision(state)?.kind, 'triggerConfirm');
  state = choose(state, action => action.type === 'yes');
  assert.ok(state.players[1].hand.includes(attack));
  assert.ok(!state.discard.includes(attack));
  assert.equal(decision(state)?.kind, 'play');
});

test('身份局曹操护驾依座次请求魏势力角色代打闪，拒绝后回到主公自身响应', () => {
  const f = fixture(5, { mode: 'identity', roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] });
  f.state.players[0].general = 'standard.caocao';
  f.state.players[0].group = 'wei';
  f.state.players[1].group = 'wei';
  const defense = f.hand(1, 'shan');
  const attack = f.hand(4, 'sha');
  let state = choose(f.start(4), action => action.type === 'play' && action.cid === attack &&
    action.targets[0] === 0);
  assert.ok(legalActions(state).some(option => option.data?.type === 'proxy' &&
    option.data.ability === 'standard.hujia'));
  const offered = choose(state, action => action.type === 'proxy');
  assert.equal(decision(offered)?.kind, 'proxyResponse');
  const declined = choose(offered, action => action.type === 'pass');
  assert.equal(decision(declined)?.kind, 'respond');
  assert.ok(!legalActions(declined).some(option => option.data?.type === 'proxy'));
  state = choose(offered, action => action.type === 'respond' && action.ids.includes(defense));
  assert.equal(state.players[0].hp, 5);
  assert.ok(state.discard.includes(defense));
});

test('刘备仁德按本回合累计赠牌两张时回复一次，赠牌不会先进入弃牌堆', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.liubei';
  f.state.players[0].hp = 2;
  const gifts = [f.hand(0, 'sha'), f.hand(0, 'shan'), f.hand(0, 'tao')];
  play(f.state);
  let state = f.state;
  for (const gift of gifts) {
    state = choose(state, action => action.type === 'beginSkill' && action.ability === 'standard.rende');
    state = choose(state, action => action.type === 'toggle' && action.cid === gift);
    state = choose(state, action => action.type === 'confirm');
    assert.ok(state.players[1].hand.includes(gift));
    assert.ok(!state.discard.includes(gift));
  }
  assert.equal(state.players[0].hp, 3);
  assert.equal(state.skillProgress?.find(item => item.ability === 'standard.rende')?.count, 3);
  assert.equal(state.events.filter(event => event.kind === 'gained' && event.data.cause === 'standard.rende').length, 3);
  state = choose(state, action => action.type === 'endPlay');
  assert.deepEqual(state.skillProgress, []);
});

test('身份局刘备激将让蜀势力角色供杀，伤害来源仍为刘备', () => {
  const f = fixture(5, { mode: 'identity', roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] });
  f.state.players[0].general = 'standard.liubei';
  f.state.players[0].group = 'shu';
  f.state.players[1].group = 'shu';
  const attack = f.hand(1, 'sha');
  let state = choose(f.start(0), action => action.type === 'proxySha' &&
    action.ability === 'standard.jijiang' && action.targets[0] === 4);
  assert.equal(decision(state)?.kind, 'proxyResponse');
  assert.equal(decision(state)?.actor, 1);
  state = choose(state, action => action.type === 'respond' && action.ids.includes(attack));
  assert.equal(decision(state)?.kind, 'respond');
  state = choose(state, action => action.type === 'pass');
  assert.equal(state.players[4].hp, 3);
  assert.equal(state.shaUsed, 1);
  assert.ok(state.events.some(event => event.kind === 'damaged' && event.data.source === 0));
});

test('大乔国色将方片牌作为乐不思蜀放入判定区，并按有效牌名判定', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.daqiao';
  const cost = f.hand(0, 'sha', 'diamond');
  play(f.state);
  let state = choose(f.state, action => action.type === 'virtualDelay' &&
    action.cname === 'lebu' && action.ids.includes(cost) && action.targets[0] === 1);
  assert.ok(state.players[1].judge.includes(cost));
  assert.equal(name(state, cost), 'lebu');
  assert.ok(state.events.some(event => event.kind === 'delayPlaced' &&
    event.data.effectiveName === 'lebu'));
  state.resolution = resolutionStack.initial();
  state.active = 1;
  const black = state.deck.find(id => state.cards[id].suit === 'spade');
  assert.ok(black);
  state.deck.splice(state.deck.indexOf(black), 1);
  state.deck.push(black);
  resolutionStack.enqueue(state, { kind: 'phaseJudge' }, { kind: 'phasePlay' });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(state);
  assert.ok(state.discard.includes(cost));
  assert.equal(name(state, cost), 'sha');
  assert.equal(state.skipPlay, true);
});

test('大乔流离弃牌后重开杀的目标窗口，原目标不再响应', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[1].general = 'standard.daqiao';
  const attack = f.hand(0, 'sha');
  f.equip(0, 'qinglong', 'weapon');
  const cost = f.hand(1, 'shan');
  const firstHp = f.state.players[1].hp;
  const secondHp = f.state.players[2].hp;
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.cid === attack && action.targets[0] === 1);
  assert.equal(decision(state)?.kind, 'attackRedirect');
  state = choose(state, action => action.type === 'redirect' && action.card === cost && action.target === 2);
  assert.equal(decision(state)?.actor, 2);
  state = choose(state, action => action.type === 'pass');
  assert.equal(state.players[1].hp, firstHp);
  assert.equal(state.players[2].hp, secondHp - 1);
  assert.ok(state.discard.includes(cost));
  assert.deepEqual(state.events.filter(event => event.kind === 'attackTargeted').map(event => event.data.target), [1, 2]);
});

test('陆逊谦逊禁止顺手牵羊与乐不思蜀指定；连营在失去最后一张手牌后摸牌', () => {
  const f = fixture();
  f.state.players[1].general = 'standard.luxun';
  const steal = f.hand(0, 'shunshou');
  const delay = f.hand(0, 'lebu');
  f.hand(1, 'shan');
  play(f.state);
  assert.ok(!legalActions(f.state).some(option => option.data?.type === 'play' &&
    (option.data.cid === steal || option.data.cid === delay)));

  const g = fixture();
  g.state.players[1].general = 'standard.luxun';
  g.hand(0, 'sha');
  const defense = g.hand(1, 'shan');
  play(g.state);
  let state = choose(g.state, action => action.type === 'play');
  state = choose(state, action => action.type === 'respond' && action.ids.includes(defense));
  assert.equal(decision(state)?.kind, 'play');
  assert.equal(state.players[1].hand.length, 1);
  assert.equal(state.players[1].hp, 4);
  assert.equal(state.events.filter(event => event.kind === 'skillActivated' &&
    event.data.ability === 'standard.lianying').length, 1);
});

test('连营在使用或被弃置最后一张手牌后自动补牌，不中断原来的结算', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.luxun';
  const attack = f.hand(0, 'sha');
  const played = choose(f.start(), action => action.type === 'play' && action.cid === attack);
  assert.equal(played.players[0].hand.length, 1);
  assert.equal(decision(played)?.kind, 'respond');
  assert.equal(decision(played)?.actor, 1);
  assert.equal(played.events.filter(event => event.kind === 'skillActivated' &&
    event.data.ability === 'standard.lianying').length, 1);

  const g = fixture();
  g.state.players[1].general = 'standard.luxun';
  const trick = g.hand(0, 'guohe');
  const last = g.hand(1, 'shan');
  let discarded = choose(g.start(), action => action.type === 'play' && action.cid === trick);
  discarded = choose(discarded, action => action.type === 'zone' && action.zone === 'hand');
  assert.ok(discarded.discard.includes(last));
  assert.equal(discarded.players[1].hand.length, 1);
  assert.equal(decision(discarded)?.kind, 'play');
  assert.equal(discarded.events.filter(event => event.kind === 'skillActivated' &&
    event.data.ability === 'standard.lianying').length, 1);
});

test('连营不在尚有手牌或只失去装备时触发', () => {
  const f = fixture();
  f.state.players[1].general = 'standard.luxun';
  const attack = f.hand(0, 'sha');
  const defense = f.hand(1, 'shan');
  const remaining = f.hand(1, 'tao');
  let state = choose(f.start(), action => action.type === 'play' && action.cid === attack);
  state = choose(state, action => action.type === 'respond' && action.ids.includes(defense));
  assert.deepEqual(state.players[1].hand, [remaining]);
  assert.ok(!state.events.some(event => event.kind === 'skillActivated' &&
    event.data.ability === 'standard.lianying'));

  const g = fixture();
  g.state.players[1].general = 'standard.luxun';
  const trick = g.hand(0, 'guohe');
  const weapon = g.equip(1, 'qinglong', 'weapon');
  state = choose(g.start(), action => action.type === 'play' && action.cid === trick);
  state = choose(state, action => action.type === 'zone' && action.zone === 'equip' && action.cid === weapon);
  assert.equal(state.players[1].hand.length, 0);
  assert.ok(!state.events.some(event => event.kind === 'skillActivated' &&
    event.data.ability === 'standard.lianying'));
});

test('孙尚香枭姬在装备离开时摸两张；结姻弃两张手牌回复双方', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'standard.sunshangxiang';
  const weapon = f.equip(0, 'qinglong', 'weapon');
  const trick = f.hand(1, 'guohe');
  let state = choose(f.start(1), action => action.type === 'play' && action.cid === trick && action.targets[0] === 0);
  state = choose(state, action => action.type === 'zone' && action.zone === 'equip' && action.cid === weapon);
  assert.equal(decision(state)?.kind, 'triggerConfirm');
  state = choose(state, action => action.type === 'yes');
  assert.equal(state.players[0].hand.length, 2);
  assert.equal(state.players[0].equip.weapon, null);

  const g = fixture();
  g.state.players[0].general = 'standard.sunshangxiang';
  g.state.players[0].hp = 2;
  g.state.players[1].sex = 'male';
  g.state.players[1].hp = 2;
  const first = g.hand(0, 'sha');
  const second = g.hand(0, 'shan');
  play(g.state);
  state = choose(g.state, action => action.type === 'beginSkill' && action.ability === 'standard.jieyin');
  state = choose(state, action => action.type === 'toggle' && action.cid === first);
  state = choose(state, action => action.type === 'toggle' && action.cid === second);
  state = choose(state, action => action.type === 'confirm');
  assert.equal(state.players[0].hp, 3);
  assert.equal(state.players[1].hp, 3);
  assert.ok(state.discard.includes(first) && state.discard.includes(second));
});
