import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, decision, legalActions, observe, StandardRuleset } from '../engine.ts';
import { cardText } from '../catalog.ts';
import type { ActionData, GameState } from '../src/domain/state.ts';
import { emitEvent } from '../src/domain/event-journal.ts';
import { projectEvent } from '../src/core/event-projector.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { TriggerRegistry, type TriggerDefinition } from '../src/rules/trigger-registry.ts';
import { standardTriggerDefinitions } from '../src/content/standard/triggers.ts';
import { beginCardUse } from '../src/content/standard/flows/card-use-flow.ts';
import { damage } from '../src/content/standard/flows/damage-flow.ts';
import { discardOwned, draw, takeOwned } from '../src/rules/operations/cards.ts';
import { cardMovement } from '../src/rules/operations/card-movement-service.ts';
import { GameTrace } from '../trace.ts';
import { fixture } from './support/scenario-builder.ts';

function choose(state: GameState, matches: (data: ActionData) => boolean, rules?: StandardRuleset): GameState {
  const option = legalActions(state).find(option => option.data && matches(option.data));
  assert.ok(option, `缺少合法行动：${decision(state)?.kind}`);
  return rules ? rules.apply(state, option.id) : apply(state, option.id);
}
const rulesWith = (...definitions: TriggerDefinition[]) => new StandardRuleset(standardModes,
  new TriggerRegistry([...standardTriggerDefinitions, ...definitions]));
const invoked = (s: GameState) => s.events.filter(e => e.kind === 'triggerInvoked').map(e => [e.data.definition, e.data.owner]);
function assertConservation(state: GameState): void {
  const zones = [...state.deck, ...state.discard, ...state.table,
    ...state.players.flatMap(p => [...p.hand, ...p.judge, ...Object.values(p.equip).filter((id): id is number => id !== null)])];
  assert.equal(zones.length, 108);
  assert.equal(new Set(zones).size, 108);
}

for (const count of [5, 8]) {
  test(`${count} 人：获得隐藏手牌只向双方显示牌名，第三方的事件和日志均不泄漏`, () => {
    const f = fixture(count);
    const steal = f.hand(0, 'shunshou');
    const secret = f.hand(1, 'lebu');
    let state = choose(f.start(), d => d.type === 'play' && d.cid === steal && d.targets[0] === 1);
    state = choose(state, d => d.type === 'zone' && d.zone === 'hand');
    const name = cardText(state.cards[secret]);
    for (let viewer = 0; viewer < count; viewer++) {
      const observation = observe(state, viewer);
      const event = observation.events.find(e => e.kind === 'gained')!;
      assert.equal(event.kind, 'gained');
      if (event.kind !== 'gained') throw new Error('missing gain');
      assert.equal(event.data.card, viewer < 2 ? secret : null);
      const message = observation.log.find(line => line.includes('获得'))!;
      if (viewer < 2) assert.ok(message.includes(name));
      else {
        assert.equal(message, '角色1获得角色2的一张手牌');
        assert.ok(!JSON.stringify(observation).includes(name));
        assert.ok(!('hidden' in event.data));
      }
      assert.ok(observation.events.every(e => !['cardsMoved', 'triggerInvoked'].includes(e.kind)));
    }
    // Revealing the card later must not retroactively reveal the old private transfer.
    discardOwned(state, 0, secret);
    const historical = observe(state, 2).events.find(e => e.kind === 'gained')!;
    assert.ok(historical.kind === 'gained' && historical.data.card === null);
    assertConservation(state);
  });
}

test('从公开装备区获得牌对所有人可见，事件副本无法修改内部记录', () => {
  const f = fixture(5);
  const equipment = f.equip(1, 'bagua', 'armor');
  takeOwned(f.state, 1, 0, equipment);
  for (let viewer = 0; viewer < 5; viewer++) {
    const view = observe(f.state, viewer);
    const event = view.events.find(e => e.kind === 'gained')!;
    assert.ok(event.kind === 'gained');
    assert.equal(event.data.card, equipment);
    event.data.card = null;
    assert.match(view.log.join('\n'), /八卦阵/);
  }
  assert.equal(f.state.events.find(e => e.kind === 'gained')!.data.card, equipment);
});

test('底层移牌事件在整批提交后写入，非法批次不产生事件或部分移动', () => {
  const f = fixture();
  const a = f.hand(0, 'sha');
  const b = f.hand(0, 'shan');
  const input = [a, b];
  cardMovement.move(f.state, input, { kind: 'discard' }, 0);
  input.length = 0;
  const last = f.state.events.at(-1)!;
  assert.equal(last.kind, 'cardsMoved');
  if (last.kind !== 'cardsMoved') throw new Error('missing move');
  assert.deepEqual(last.data.moves.map(move => move.card), [a, b]);
  assert.ok(last.data.moves.every(move => move.from.kind === 'hand' && move.to.kind === 'discard'));
  assert.equal(projectEvent(last, 0), null, '底层实体 ID 不进入玩家事件');
  const before = structuredClone(f.state);
  assert.throws(() => cardMovement.move(f.state, [a, 9999], { kind: 'hand', owner: 0 }));
  assert.deepEqual(f.state, before);
});

test('摸牌只公开数量，原始移动记录与牌堆顺序不进入其他人的事件', () => {
  const f = fixture(5);
  draw(f.state, 1, 2);
  const observation = observe(f.state, 2);
  assert.deepEqual(observation.events.map(e => ({ kind: e.kind, data: e.data })), [
    { kind: 'drawn', data: { player: 1, count: 2 } },
  ]);
  assert.match(observation.log[0], /摸了2张/);
  assert.equal(f.state.events.filter(e => e.kind === 'cardsMoved').length, 2);
});

test('触发排序按优先级、当前回合座次、定义 ID，和注册顺序无关', () => {
  const f = fixture(5);
  const attack = f.hand(3, 'sha');
  const make = (id: string, priority: number, owners: number[]): TriggerDefinition => ({
    id, event: 'attackTargeted', priority, owners: () => owners,
    eligible: () => true, execute: (s, _event, owner) => draw(s, owner, 1),
  });
  const definitions = [make('test.beta', 10, [0, 1, 2, 3, 4]), make('test.first', 20, [2]), make('test.alpha', 10, [0, 1, 2, 3, 4])];
  const start = f.start(3);
  const first = choose(start, d => d.type === 'play' && d.cid === attack && d.targets[0] === 4, rulesWith(...definitions));
  const second = choose(start, d => d.type === 'play' && d.cid === attack && d.targets[0] === 4, rulesWith(...definitions.reverse()));
  assert.deepEqual(first, second);
  assert.deepEqual(invoked(first), [['test.first', 2], ...[3, 4, 0, 1, 2].flatMap(owner => [['test.alpha', owner], ['test.beta', owner]])]);
  assert.equal(decision(first)?.actor, 4);
  const timing = first.events.find(e => e.kind === 'attackTargeted')!;
  assert.ok(first.events.filter(e => e.kind === 'drawn').every(e => e.parentEventId === timing.id));
  assertConservation(first);
});

test('较早触发移除武器后重新检查资格，不再出现失效的青龙追击选择', () => {
  const f = fixture();
  const attack = f.hand(0, 'sha');
  const retained = f.hand(0, 'sha');
  f.hand(1, 'shan');
  const weapon = f.equip(0, 'qinglong', 'weapon');
  const rules = rulesWith({
    id: 'test.remove-weapon', event: 'attackMissed', priority: 100,
    owners: (_s, e) => e.data.source === null ? [] : [e.data.source], eligible: () => true,
    execute: (s, _e, owner) => discardOwned(s, owner, weapon),
  } satisfies TriggerDefinition<'attackMissed'>);
  let state = choose(f.start(), d => d.type === 'play' && d.cid === attack, rules);
  state = choose(state, d => d.type === 'respond', rules);
  assert.equal(decision(state)?.kind, 'play');
  assert.ok(state.players[0].hand.includes(retained));
  assert.ok(!invoked(state).some(([id]) => id === 'standard.qinglong'));
  assertConservation(state);
});

for (const count of [5, 8]) {
  test(`${count} 人：注册触发可嵌套伤害与求桃，恢复后跳过阵亡触发者`, () => {
    const f = fixture(count);
    const attack = f.hand(0, 'sha');
    f.hand(3, 'tao');
    f.state.players[2].hp = 1;
    const rules = rulesWith(
      { id: 'test.nested', event: 'attackTargeted', priority: 20,
        owners: () => [0], eligible: () => true, execute: s => damage(s, 2, 0) },
      { id: 'test.dead-owner', event: 'attackTargeted', priority: 10,
        owners: () => [2], eligible: () => true, execute: () => { throw new Error('不应执行死者触发'); } },
      { id: 'test.last', event: 'attackTargeted', priority: 0,
        owners: () => [3], eligible: () => true, execute: s => draw(s, 3, 1) },
    );
    let state = choose(f.start(), d => d.type === 'play' && d.cid === attack && d.targets[0] === 1, rules);
    assert.equal(decision(state)?.kind, 'dying');
    assert.equal(decision(state)?.actor, 3);
    const paused = JSON.parse(JSON.stringify(state)) as GameState;
    state = choose(state, d => d.type === 'pass', rules);
    assert.deepEqual(state, choose(paused, d => d.type === 'pass', rules));
    assert.equal(state.players[2].alive, false);
    assert.deepEqual(invoked(state), [['test.nested', 0], ['test.last', 3]]);
    assert.equal(decision(state)?.kind, 'respond');
    assert.equal(decision(state)?.actor, 1);
    assert.equal(state.events.filter(e => e.kind === 'damaged').length, 1);
    assertConservation(state);
  });
}

test('取消触发窗口阻止后续同窗口触发和原效果，但保留用牌清理', () => {
  const f = fixture();
  const attack = f.hand(0, 'sha', 'spade');
  f.equip(1, 'renwang', 'armor');
  const rules = rulesWith({ id: 'test.after-armor', event: 'attackTargeted', priority: 0,
    owners: () => [0], eligible: () => true, execute: () => { throw new Error('被取消窗口不应继续'); } });
  const state = choose(f.start(), d => d.type === 'play' && d.cid === attack, rules);
  assert.equal(state.players[1].hp, 4);
  assert.equal(decision(state)?.kind, 'play');
  assert.ok(state.discard.includes(attack));
  assert.deepEqual(state.table, []);
  assertConservation(state);
});

test('注册触发异常回滚移牌、事件、窗口与全部轨迹，重试不留下错误事件 ID', () => {
  const f = fixture();
  const attack = f.hand(0, 'sha');
  const rules = rulesWith({ id: 'test.failure', event: 'attackTargeted', priority: 0,
    owners: () => [0], eligible: () => true, execute: s => { draw(s, 0, 2); throw new Error('触发失败'); } });
  const state = f.start();
  const before = structuredClone(state);
  const id = legalActions(state).find(option => option.data?.type === 'play' && option.data.cid === attack)!.id;
  const trace = new GameTrace<GameState>({});
  assert.throws(() => rules.apply(state, id, (transition, snapshot) => trace.record(transition, snapshot)), /触发失败/);
  assert.deepEqual(state, before);
  assert.equal(trace.frames.length, 0);
  const succeeded = apply(state, id);
  assert.deepEqual(succeeded.events.map(e => e.id), Array.from({ length: succeeded.events.length }, (_, i) => i + 1));
});

test('同一个注册表可用于多局，候选与游标不写入共享定义', () => {
  const definition: TriggerDefinition = { id: 'test.shared', event: 'attackTargeted', priority: 0,
    owners: () => [0], eligible: () => true, execute: s => draw(s, 0, 1) };
  const rules = rulesWith(definition);
  const f = fixture();
  const attack = f.hand(0, 'sha');
  const start = f.start();
  const before = { ...definition };
  const first = choose(start, d => d.type === 'play' && d.cid === attack, rules);
  const second = choose(start, d => d.type === 'play' && d.cid === attack, rules);
  assert.deepEqual(first, second);
  assert.deepEqual(definition, before);
  assert.throws(() => new TriggerRegistry([definition, definition]), /重复/);
  assert.throws(() => new TriggerRegistry([{ ...definition, priority: NaN }]), /优先级/);
});

test('事件载荷在写入时固定，不能通过调用者数组引用篡改历史', () => {
  const f = fixture();
  const ids = [f.state.deck[0]];
  const id = emitEvent(f.state, 'harvestRevealed', { cards: ids });
  ids.length = 0;
  const event = f.state.events[id - 1];
  assert.ok(event.kind === 'harvestRevealed');
  assert.equal(event.data.cards.length, 1);
});


test('雌雄与仁王盾同一事件按规则次序结算，支付选择后再处理防具', () => {
  const f = fixture();
  const attack = f.hand(0, 'sha', 'spade');
  f.equip(0, 'cixiong', 'weapon');
  f.equip(1, 'renwang', 'armor');
  f.hand(1, 'sha');
  let state = choose(f.start(), d => d.type === 'play' && d.cid === attack);
  assert.equal(decision(state)?.kind, 'cixiong');
  state = choose(state, d => d.type === 'yes');
  assert.equal(decision(state)?.kind, 'cixiongCost');
  const checkpoint = JSON.parse(JSON.stringify(state)) as GameState;
  state = choose(state, d => d.type === 'draw');
  assert.deepEqual(state, choose(checkpoint, d => d.type === 'draw'));
  assert.deepEqual(invoked(state), [['standard.cixiong', 0], ['standard.renwang', 1]]);
  assert.equal(state.players[0].hand.length, 1);
  assert.equal(state.players[1].hp, 4);
  assert.equal(decision(state)?.kind, 'play');
  assertConservation(state);
});

test('注册触发使用子流程的杀，内层防具取消不会取消外层攻击', () => {
  const f = fixture(5);
  const outer = f.hand(0, 'sha');
  const inner = f.hand(2, 'sha', 'spade');
  f.equip(3, 'renwang', 'armor');
  const rules = rulesWith({ id: 'test.nested-attack', event: 'attackTargeted', priority: 30,
    owners: () => [0], eligible: (_s, event) => event.data.source === 0,
    execute: s => beginCardUse(s, 2, { type: 'play', cid: inner, targets: [3] }) } satisfies TriggerDefinition<'attackTargeted'>);
  let state = choose(f.start(), d => d.type === 'play' && d.cid === outer && d.targets[0] === 1, rules);
  assert.equal(decision(state)?.kind, 'respond');
  assert.equal(decision(state)?.actor, 1);
  const attacks = state.events.filter(e => e.kind === 'attackTargeted');
  assert.equal(attacks.length, 2);
  assert.equal(attacks[1].parentEventId, attacks[0].id);
  state = choose(state, d => d.type === 'pass', rules);
  assert.equal(state.players[1].hp, 3);
  assert.equal(state.players[3].hp, 4);
  assert.equal(state.shaUsed, 1);
  assert.deepEqual(state.table, []);
  assertConservation(state);
});
