import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardRuleset } from '../engine.ts';
import { pilotSkillPack } from '../src/content/pilot/content.ts';
import { standardPack } from '../src/content/standard/content.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { legalActions, decision } from '../src/core/decision-manager.ts';
import { ContentRegistry } from '../src/rules/content-registry.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { SkillFlow } from '../src/rules/flows/skill-flow.ts';
import { discardOwned } from '../src/rules/operations/cards.ts';
import type { ActionMap, GameState } from '../src/domain/state.ts';
import { fixture } from './support/scenario-builder.ts';

const content = new ContentRegistry([standardPack, pilotSkillPack]);
const runtime = new ContentRuntime(content);
const rules = new StandardRuleset(standardModes, undefined, content);

test('试验内容包可由建局配置选择，且不改变默认标准内容', () => {
  const state = rules.create({ seed: 5, players: [
    { label: '甲', sex: 'male', general: 'pilot.zhaoyun' },
    { label: '乙', sex: 'female' },
  ] });
  assert.equal(state.players[0].general, 'pilot.zhaoyun');
  assert.ok(runtime.abilities.has(state, 0, 'pilot.longdan'));
  assert.equal(state.cards[1].label, undefined);
});

function play(state: GameState): void {
  state.active = 0;
  state.resolution = resolutionStack.initial();
  resolutionStack.enqueue(state, { kind: 'phasePlay' }, { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(state);
}
function choose(state: GameState, predicate: (action: ActionMap[keyof ActionMap]) => boolean): GameState {
  const option = legalActions(state).find(option => option.data && predicate(option.data));
  assert.ok(option, `缺少行动：${decision(state)?.title}`);
  return rules.apply(state, option.id);
}

for (const count of [2, 5, 8]) {
  test(`${count} 人：青囊使用手牌费用、受伤目标与回合限次`, () => {
    const f = fixture(count, count === 2 ? {} : { mode: 'identity' });
    f.state.players[0].general = 'pilot.huatuo';
    f.state.players[1].hp = 2;
    const payment = f.hand(0, 'shan');
    f.hand(0, 'tao');
    play(f.state);
    let state = choose(f.state, action => action.type === 'activeSkill' && action.ability === 'pilot.qingnang' &&
      action.ids[0] === payment && action.targets[0] === 1);
    assert.equal(state.players[1].hp, 3);
    assert.ok(state.discard.includes(payment));
    assert.equal(state.skillUses?.find(item => item.ability === 'pilot.qingnang')?.count, 1);
    assert.ok(!legalActions(state).some(option => (option.data as { ability?: string } | undefined)?.ability === 'pilot.qingnang'));
    assert.equal(state.events.filter(event => event.kind === 'skillActivated').length, 1);
  });
}

test('龙胆：闪作为杀主动使用，杀作为闪响应且只支付实际实体牌', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'pilot.zhaoyun';
  f.state.players[1].general = 'pilot.zhaoyun';
  const offense = f.hand(0, 'shan');
  const defense = f.hand(1, 'sha');
  play(f.state);
  let state = choose(f.state, action => action.type === 'virtualSha' && action.transformation === 'pilot.longdan.sha' &&
    action.ids[0] === offense && action.targets[0] === 1);
  assert.equal(decision(state)?.kind, 'respond');
  state = choose(state, action => action.type === 'respond' && action.transformation === 'pilot.longdan.shan' &&
    action.ids[0] === defense);
  assert.equal(state.players[1].hp, 4);
  assert.ok(state.discard.includes(offense));
  assert.ok(state.discard.includes(defense));
  assert.equal(state.events.filter(event => event.kind === 'transformationUsed').length, 2);
});

test('主动技能在执行前复核费用与目标，失效时不扣次数或执行回复', () => {
  const f = fixture(5, { mode: 'identity' });
  const skills = new SkillFlow(runtime);
  f.state.players[0].general = 'pilot.huatuo';
  f.state.players[1].hp = 2;
  f.state.phase = 'play';
  f.state.active = 0;
  const payment = f.hand(0, 'shan');
  skills.open(f.state, 0, 'pilot.qingnang', [payment], [1]);
  discardOwned(f.state, 0, payment);
  assert.throws(() => skills.execute(f.state), /费用或目标已失效/);
  assert.equal(f.state.players[1].hp, 2);
  assert.equal(f.state.skillUses, undefined);

  const second = fixture(5, { mode: 'identity' });
  second.state.players[0].general = 'pilot.huatuo';
  second.state.players[1].hp = 2;
  second.state.phase = 'play';
  second.state.active = 0;
  const card = second.hand(0, 'shan');
  skills.open(second.state, 0, 'pilot.qingnang', [card], [1]);
  second.state.players[1].hp = 4;
  assert.throws(() => skills.execute(second.state), /费用或目标已失效/);
  assert.ok(second.state.players[0].hand.includes(card));
});

test('集智拒绝发动时不摸牌，也不记录已发动', () => {
  const f = fixture();
  f.state.players[0].general = 'pilot.huangyueying';
  const trick = f.hand(0, 'wuzhong');
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.cid === trick);
  assert.equal(decision(state)?.kind, 'triggerConfirm');
  state = choose(state, action => action.type === 'no');
  while (decision(state)?.kind === 'nullify') state = choose(state, action => action.type === 'pass');
  assert.equal(state.events.filter(event => event.kind === 'triggerInvoked' && event.data.definition === 'pilot.jizhi').length, 0);
  assert.equal(state.players[0].hand.length, 2);
});

for (const count of [2, 8]) {
  test(`${count} 人：集智在普通锦囊使用后可选择发动，且多目标流程不重复触发`, () => {
    const f = fixture(count, count === 2 ? {} : { mode: 'identity' });
    f.state.players[0].general = 'pilot.huangyueying';
    const trick = f.hand(0, 'wugu');
    play(f.state);
    let state = choose(f.state, action => action.type === 'play' && action.cid === trick);
    assert.equal(decision(state)?.kind, 'triggerConfirm');
    const resumed = JSON.parse(JSON.stringify(state)) as GameState;
    state = choose(state, action => action.type === 'yes');
    assert.deepEqual(state, choose(resumed, action => action.type === 'yes'));
    for (let step = 0; step < count * 3 && ['nullify', 'wugu'].includes(decision(state)?.kind ?? ''); step++) {
      state = decision(state)?.kind === 'nullify'
        ? choose(state, action => action.type === 'pass') : choose(state, action => action.type === 'wugu');
    }
    assert.equal(decision(state)?.kind, 'play');
    assert.equal(state.events.filter(event => event.kind === 'triggerInvoked' && event.data.definition === 'pilot.jizhi').length, 1);
    assert.equal(state.events.filter(event => event.kind === 'cardUsed' && event.data.card === trick).length, 1);
    assert.ok(state.events.some(event => event.kind === 'drawn' && event.data.player === 0 && event.data.count === 1));
  });
}

for (const count of [2, 5, 8]) {
  test(`${count} 人：制衡逐张选择手牌与装备，确认后等量摸牌且每回合限一次`, () => {
    const f = fixture(count, count === 2 ? {} : { mode: 'identity' });
    f.state.players[0].general = 'pilot.sunquan';
    const first = f.hand(0, 'shan');
    const second = f.hand(0, 'sha');
    const armor = f.equip(0, 'bagua', 'armor');
    for (let index = 0; index < 10; index++) f.hand(0, 'sha');
    play(f.state);
    assert.equal(legalActions(f.state).filter(option => option.data?.type === 'beginSkill').length, 1);
    let state = choose(f.state, action => action.type === 'beginSkill' && action.ability === 'pilot.zhiheng');
    assert.equal(decision(state)?.kind, 'skillCost');
    assert.ok(legalActions(state).length <= state.players[0].hand.length + 2);
    state = choose(state, action => action.type === 'toggle' && action.cid === first);
    const resumed = JSON.parse(JSON.stringify(state)) as GameState;
    state = choose(state, action => action.type === 'toggle' && action.cid === second);
    assert.deepEqual(state, choose(resumed, action => action.type === 'toggle' && action.cid === second));
    state = choose(state, action => action.type === 'toggle' && action.cid === armor);
    const before = state.players[0].hand.length;
    state = choose(state, action => action.type === 'confirm');
    assert.equal(decision(state)?.kind, 'play');
    assert.equal(state.players[0].hand.length, before - 2 + 3);
    assert.equal(state.players[0].equip.armor, null);
    for (const id of [first, second, armor]) assert.ok(state.discard.includes(id));
    assert.equal(state.skillUses?.find(item => item.ability === 'pilot.zhiheng')?.count, 1);
    assert.ok(!legalActions(state).some(option => option.data?.type === 'beginSkill'));
  });
}

test('制衡取消逐张费用后不弃牌、不摸牌、不占用次数', () => {
  const f = fixture();
  f.state.players[0].general = 'pilot.sunquan';
  const card = f.hand(0, 'shan');
  play(f.state);
  let state = choose(f.state, action => action.type === 'beginSkill');
  state = choose(state, action => action.type === 'toggle' && action.cid === card);
  state = choose(state, action => action.type === 'cancel');
  assert.ok(state.players[0].hand.includes(card));
  assert.equal(state.skillUses, undefined);
  assert.ok(legalActions(state).some(option => option.data?.type === 'beginSkill'));
});

for (const count of [2, 5, 8]) {
  test(`${count} 人：鬼才改写乐不思蜀判定，牌在公开处理区等待选择并可暂停恢复`, () => {
    const f = fixture(count, count === 2 ? {} : { mode: 'identity' });
    f.state.players[0].general = 'pilot.simayi';
    const replacement = f.hand(0, 'shan', 'heart');
    const delayed = f.take('lebu');
    f.state.players[1].judge.push(delayed);
    const original = f.top('sha', 'spade', 7);
    play(f.state);
    let state = f.state;
    state = choose(state, action => action.type === 'endPlay');
    assert.equal(decision(state)?.kind, 'judgeReplace');
    assert.ok(state.table.includes(original));
    assert.ok(state.players[0].hand.includes(replacement));
    const resumed = JSON.parse(JSON.stringify(state)) as GameState;
    state = choose(state, action => action.type === 'replace' && action.cid === replacement);
    assert.deepEqual(state, choose(resumed, action => action.type === 'replace' && action.cid === replacement));
    assert.equal(state.skipPlay, false);
    assert.ok(state.discard.includes(original));
    assert.ok(state.discard.includes(replacement));
    assert.ok(state.discard.includes(delayed));
    assert.equal(state.events.filter(event => event.kind === 'judgementReplaced').length, 1);
    assert.equal(state.events.find(event => event.kind === 'judged')?.data.card, replacement);
  });
}

test('鬼才可以放弃改判，八卦阵判定失败后仍可正常打出闪', () => {
  const f = fixture(8, { mode: 'identity' });
  f.state.players[2].general = 'pilot.simayi';
  f.hand(0, 'sha');
  const shan = f.hand(1, 'shan');
  f.hand(2, 'tao');
  f.equip(1, 'bagua', 'armor');
  const black = f.state.deck.find(id => ['spade', 'club'].includes(f.state.cards[id].suit));
  assert.ok(black);
  f.state.deck.splice(f.state.deck.indexOf(black), 1);
  f.state.deck.push(black);
  play(f.state);
  let state = f.state;
  state = choose(state, action => action.type === 'play' && action.targets.includes(1));
  state = choose(state, action => action.type === 'bagua');
  assert.equal(decision(state)?.kind, 'judgeReplace');
  state = choose(state, action => action.type === 'pass');
  assert.equal(decision(state)?.kind, 'respond');
  state = choose(state, action => action.type === 'respond' && action.ids.includes(shan));
  assert.equal(state.players[1].hp, 4);
  assert.equal(state.events.filter(event => event.kind === 'judgementReplaced').length, 0);
});

test('鬼才把八卦阵黑色判定改为红色后，原响应成功且不重复询问', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[2].general = 'pilot.simayi';
  f.hand(0, 'sha');
  const replacement = f.hand(2, 'shan', 'heart');
  f.equip(1, 'bagua', 'armor');
  const black = f.state.deck.find(id => ['spade', 'club'].includes(f.state.cards[id].suit));
  assert.ok(black);
  f.state.deck.splice(f.state.deck.indexOf(black), 1);
  f.state.deck.push(black);
  play(f.state);
  let state = choose(f.state, action => action.type === 'play' && action.targets.includes(1));
  state = choose(state, action => action.type === 'bagua');
  state = choose(state, action => action.type === 'replace' && action.cid === replacement);
  assert.equal(decision(state)?.kind, 'play');
  assert.equal(state.players[1].hp, 4);
  assert.equal(state.events.filter(event => event.kind === 'attackMissed').length, 1);
  assert.equal(state.events.find(event => event.kind === 'judged')?.data.card, replacement);
});

test('两个鬼才按座次依次看到最新判定牌，最后一次改判决定闪电结果', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[0].general = 'pilot.simayi';
  f.state.players[2].general = 'pilot.simayi';
  const later = f.hand(0, 'shan', 'heart');
  const earlier = f.hand(2, 'sha', 'spade', 7);
  const bolt = f.take('shandian');
  f.state.players[1].judge.push(bolt);
  const original = f.top('sha', 'heart');
  play(f.state);
  let state = f.state;
  state = choose(state, action => action.type === 'endPlay');
  assert.equal(decision(state)?.actor, 2);
  state = choose(state, action => action.type === 'replace' && action.cid === earlier);
  assert.equal(decision(state)?.actor, 0);
  assert.match(decision(state)?.title ?? '', /♠7/);
  state = choose(state, action => action.type === 'replace' && action.cid === later);
  assert.equal(state.players[1].hp, 4);
  assert.equal(state.events.find(event => event.kind === 'judged')?.data.card, later);
  assert.equal(state.events.filter(event => event.kind === 'judgementReplaced').length, 2);
  for (const id of [original, earlier, later]) assert.ok(state.discard.includes(id));
});
