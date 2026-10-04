import { debugLog } from '../src/presentation/event-formatter.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, createGame, decision, GameEngine, legalActions, observe, StandardRuleset } from '../engine.ts';
import type { GameConfig, GameOutcome } from '../contracts.ts';
import type { ActionData, DamageCause, GameState, ReadonlyGameState, TaskOf } from '../src/domain/state.ts';
import { IdentityMode } from '../src/modes/identity-mode.ts';
import { DuelMode } from '../src/modes/duel-mode.ts';
import { ModeRegistry } from '../src/rules/mode-registry.ts';
import { RuleBasePolicy } from '../policy.ts';
import { GameTrace } from '../trace.ts';
import { renderTraceReport } from '../trace-report.ts';
import { fixture } from './support/scenario-builder.ts';

const rolesFor = (count: number) => count === 5
  ? ['lord', 'loyalist', 'rebel', 'rebel', 'renegade']
  : ['lord', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'loyalist', 'renegade'];
const playersFor = (count: number): GameConfig['players'] => Array.from({ length: count }, (_, id) => ({
  label: `角色${id}`, sex: id % 2 ? 'female' : 'male',
}));
function choose(state: GameState, matches: (data: ActionData) => boolean, trace?: GameTrace<GameState>): GameState {
  const option = legalActions(state).find(option => option.data && matches(option.data));
  assert.ok(option, '缺少预期选择');
  return apply(state, option.id, trace ? (transition, snapshot) => trace.record(transition, snapshot) : undefined);
}
function conservation(state: GameState): void {
  const ids = [...state.deck, ...state.discard, ...state.table, ...state.players.flatMap(p =>
    [...p.hand, ...p.judge, ...Object.values(p.equip).filter((id): id is number => id !== null)])];
  assert.equal(ids.length, 108);
  assert.equal(new Set(ids).size, 108);
}

function assertDeath(trace: GameTrace<GameState>, target: number, cause: DamageCause): void {
  const frame = trace.frames.find(f => f.transition.type === 'task' &&
    (f.transition.task as { kind: string }).kind === 'death')!;
  assert.ok(frame);
  assert.equal(frame.transition.type, 'task');
  if (frame.transition.type !== 'task') throw new Error('missing task');
  const task = frame.transition.task as TaskOf<'death'>;
  const { frameId, parentFrameId, ...context } = task.context;
  assert.deepEqual(context, { target, cause });
  assert.equal(frameId, frame.transition.frameId);
  assert.equal(parentFrameId, frame.transition.parentFrameId);
  assert.equal(frame.state.resolution.stack.find(f => f.id === frameId)?.kind, 'dying');
  assert.equal(frame.state.resolution.stack.find(f => f.id === parentFrameId)?.kind, 'damage');
}

for (const count of [5, 8]) {
  test(`${count} 人身份模式：随机身份可复现，主公加一点体力并首先行动`, () => {
    const config = { mode: 'identity', seed: 19, players: playersFor(count) };
    const state = createGame(config);
    assert.deepEqual(state, createGame(config));
    assert.deepEqual(Object.values(state.mode.roles).sort(), rolesFor(count).sort());
    const lord = state.players.find(p => state.mode.roles[p.id] === 'lord')!;
    if (count === 5) assert.equal(lord.id, 0, '标准五人局主公固定在座位 1');
    assert.equal(state.active, lord.id);
    assert.equal(lord.maxHp, 5);
    assert.equal(lord.hp, 5);
    assert.equal(lord.hand.length, 6);
    assert.ok(state.players.filter(p => p.id !== lord.id).every(p => p.hp === 4 && p.hand.length === 4));
    const forced = createGame({ ...config, first: count - 1 });
    assert.equal(forced.mode.roles[count - 1], 'lord');
    assert.equal(forced.active, count - 1);
    conservation(state);
  });

  test(`${count} 人身份模式：所有视角只知道自身与公开身份，投影不共享引用`, () => {
    const state = createGame({ mode: 'identity', roles: rolesFor(count), players: playersFor(count) });
    for (let viewer = 0; viewer < count; viewer++) {
      const observation = observe(state, viewer);
      assert.equal(observation.mode.id, 'identity');
      assert.equal(observation.self.role, rolesFor(count)[viewer]);
      for (const player of observation.others) {
        assert.equal(player.role, player.id === 0 ? 'lord' : undefined);
        assert.equal('roles' in player, false);
        assert.equal('hand' in player, false);
      }
      assert.doesNotMatch(JSON.stringify(decision(state)), /loyalist|rebel|renegade/);
      assert.doesNotMatch(observation.log.join('\n'), /loyalist|rebel|renegade/);
    }
    // Knowledge granted to one viewer must not become globally public.
    state.mode.knownTo[2].push(1);
    assert.equal(observe(state, 1).others.find(p => p.id === 2)?.role, 'rebel');
    assert.equal(observe(state, 3).others.find(p => p.id === 2)?.role, undefined);
    const view = observe(state, 1);
    view.others.find(p => p.id === 2)!.role = 'lord';
    view.outcome.status = 'draw';
    assert.equal(state.mode.roles[2], 'rebel');
    assert.equal(state.outcome.status, 'ongoing');
  });

  test(`${count} 人身份模式：反贼死亡公开身份，实际击杀者摸三张`, () => {
    const f = fixture(count, { mode: 'identity', roles: rolesFor(count) });
    const attack = f.hand(1, 'sha');
    f.state.players[2].hp = 1;
    const trace = new GameTrace<GameState>({ mode: 'identity' });
    let state = choose(f.start(1), d => d.type === 'play' && d.cid === attack && d.targets[0] === 2);
    state = choose(state, d => d.type === 'pass', trace);
    assert.equal(state.players[2].alive, false);
    assert.equal(state.players[1].hand.length, 3);
    assert.equal(state.outcome.status, 'ongoing');
    for (let viewer = 0; viewer < count; viewer++) {
      const view = observe(state, viewer);
      assert.equal([view.self, ...view.others].find(p => p.id === 2)!.role, 'rebel');
    }
    assertDeath(trace, 2, { kind: 'damage', source: 1, amount: 1, card: attack });
    conservation(state);
  });

  test(`${count} 人身份模式：反贼击杀反贼也摸三张`, () => {
    const f = fixture(count, { mode: 'identity', roles: rolesFor(count) });
    const attack = f.hand(2, 'sha');
    f.state.players[3].hp = 1;
    let state = choose(f.start(2), d => d.type === 'play' && d.cid === attack && d.targets[0] === 3);
    state = choose(state, d => d.type === 'pass');
    assert.equal(state.mode.roles[2], 'rebel');
    assert.equal(state.mode.roles[3], 'rebel');
    assert.equal(state.players[3].alive, false);
    assert.equal(state.players[2].hand.length, 3);
    assert.equal(state.outcome.status, 'ongoing');
    conservation(state);
  });

  test(`${count} 人身份模式：主公杀忠臣弃手牌和装备，判定区保留`, () => {
    const f = fixture(count, { mode: 'identity', roles: rolesFor(count) });
    const attack = f.hand(0, 'sha');
    const kept = f.hand(0, 'shan');
    const armor = f.equip(0, 'bagua', 'armor');
    const delayed = f.take('lebu');
    f.state.players[0].judge.push(delayed);
    f.state.players[1].hp = 1;
    let state = choose(f.start(), d => d.type === 'play' && d.cid === attack && d.targets[0] === 1);
    state = choose(state, d => d.type === 'pass');
    assert.deepEqual(state.players[0].hand, []);
    assert.equal(state.players[0].equip.armor, null);
    assert.deepEqual(state.players[0].judge, [delayed]);
    assert.ok(state.discard.includes(kept) && state.discard.includes(armor));
    conservation(state);
  });

  test(`${count} 人身份模式：决斗反杀奖励响应者，濒死询问不覆盖来源`, () => {
    const f = fixture(count, { mode: 'identity', roles: rolesFor(count) });
    const duel = f.hand(2, 'juedou');
    f.hand(1, 'sha');
    f.hand(count - 1, 'tao');
    f.state.players[2].hp = 1;
    let state = choose(f.start(2), d => d.type === 'play' && d.cid === duel && d.targets[0] === 1);
    state = choose(state, d => d.type === 'respond');
    state = choose(state, d => d.type === 'pass');
    assert.equal(decision(state)?.actor, count - 1);
    assert.deepEqual(resolutionStack.require(state, 'dying').data.cause, { kind: 'damage', source: 1, amount: 1, card: duel });
    state = choose(state, d => d.type === 'pass');
    assert.equal(state.players[1].hand.length, 3);
    assert.equal(state.players[2].alive, false);
    assert.equal(state.players[count - 1].hand.length, 1);
    assert.equal(state.active, 3);
    conservation(state);
  });

  test(`${count} 人身份模式：第三方救活后不公开身份，不提前奖励击杀者`, () => {
    const f = fixture(count, { mode: 'identity', roles: rolesFor(count) });
    const attack = f.hand(1, 'sha');
    f.hand(count - 1, 'tao');
    f.state.players[2].hp = 1;
    let state = choose(f.start(1), d => d.type === 'play' && d.cid === attack && d.targets[0] === 2);
    state = choose(state, d => d.type === 'pass');
    state = choose(state, d => d.type === 'save');
    assert.equal(state.players[2].hp, 1);
    assert.equal(state.players[2].alive, true);
    assert.equal(state.players[1].hand.length, 0);
    assert.equal(observe(state, 0).others.find(p => p.id === 2)?.role, undefined);
    conservation(state);
  });

  test(`${count} 人身份模式：主公阵亡立即结束，多个反贼含阵亡者获胜`, () => {
    const f = fixture(count, { mode: 'identity', roles: rolesFor(count) });
    const attack = f.hand(count - 1, 'sha');
    f.hand(0, 'shan');
    f.state.players[0].hp = 1;
    f.state.players[2].alive = false;
    f.state.players[2].hp = 0;
    let state = choose(f.start(count - 1), d => d.type === 'play' && d.cid === attack && d.targets[0] === 0);
    state = choose(state, d => d.type === 'pass');
    assert.deepEqual(state.outcome, {
      status: 'finished', winners: count === 5 ? [2, 3] : [2, 3, 4, 5],
      losers: count === 5 ? [0, 1, 4] : [0, 1, 6, 7], reason: 'lord-dead',
    });
    assert.equal(decision(state), null);
    assert.equal(state.phase, 'finished');
    assert.deepEqual(state.table, []);
    assert.deepEqual(state.players[0].hand, []);
    assert.ok(observe(state, 0).others.every(p => p.role !== undefined));
    const view = observe(state, 0);
    assert.equal(view.outcome.status, 'finished');
    if (view.outcome.status === 'finished') view.outcome.winners.length = 0;
    assert.notDeepEqual(view.outcome, state.outcome);
    conservation(state);
  });

  test(`${count} 人身份模式：多个种子同一引擎运行至结束、牌守恒且不向死者决策`, () => {
    // This is a liveness/legality harness; the duel AI is not an identity strategy.
    const policy = new RuleBasePolicy();
    for (const seed of [1, 7, 19]) {
      const config = { mode: 'identity', seed, players: playersFor(count) };
      const trace = new GameTrace<GameState>(config);
      const game = GameEngine.standard(config, trace);
      let steps = 0;
      while (!game.finished && steps++ < 5000) {
        const prompt = game.getDecision();
        assert.ok(prompt);
        const observation = game.getObservation(prompt.actor);
        assert.ok(observation.self.alive);
        game.choose(policy.choose(observation, prompt));
      }
      assert.ok(game.finished, `种子 ${seed} 超过步数上限`);
      for (const frame of trace.frames) conservation(frame.state);
      assert.equal(trace.document().complete, true);
      assert.match(renderTraceReport(trace.document()), /获胜/);
      const replay = GameEngine.standard(config);
      for (const frame of trace.frames) {
        if (frame.transition.type === 'choice') replay.choose(frame.transition.choiceId);
      }
      for (let viewer = 0; viewer < count; viewer++) {
        assert.deepEqual(replay.getObservation(viewer), game.getObservation(viewer));
      }
    }
  });
}

test('身份模式拒绝非法配置，固定身份允许主公在任意座位', () => {
  assert.throws(() => createGame({ mode: 'missing' }), /未知模式/);
  assert.throws(() => createGame({ mode: 'identity', players: playersFor(4) }), /5 人或 8 人/);
  assert.throws(() => createGame({ mode: 'identity', players: playersFor(5), roles: Array(5).fill('lord') }), /身份数量/);
  assert.throws(() => createGame({ mode: 'identity', players: playersFor(5), roles: rolesFor(5), first: 1 }), /主公/);
  assert.throws(() => createGame({ roles: rolesFor(5) }), /不接受身份/);
  assert.throws(() => createGame({ first: 0.5 }), /参数/);
  assert.throws(() => createGame({ initialHp: 0 }), /参数/);
  const state = createGame({ mode: 'identity', players: playersFor(5), roles: ['rebel', 'renegade', 'lord', 'loyalist', 'rebel'] });
  assert.equal(state.active, 2);
});

test('身份胜负矩阵：清空反内、内奸独存、主公被内奸过早击杀、全员阵亡', () => {
  const mode = new IdentityMode();
  const cases: { living: number[]; outcome: GameOutcome }[] = [
    { living: [0, 2], outcome: { status: 'ongoing' } },
    { living: [0, 4], outcome: { status: 'ongoing' } },
    { living: [0], outcome: { status: 'finished', winners: [0, 1], losers: [2, 3, 4], reason: 'opposition-eliminated' } },
    { living: [4], outcome: { status: 'finished', winners: [4], losers: [0, 1, 2, 3], reason: 'renegade-last-survivor' } },
    { living: [1, 4], outcome: { status: 'finished', winners: [2, 3], losers: [0, 1, 4], reason: 'lord-dead' } },
    { living: [], outcome: { status: 'draw', reason: 'no-survivors' } },
  ];
  for (const scenario of cases) {
    const state = fixture(5, { mode: 'identity', roles: rolesFor(5) }).state;
    for (const player of state.players) player.alive = scenario.living.includes(player.id);
    const before = structuredClone(state);
    assert.deepEqual(mode.evaluateOutcome(state), scenario.outcome);
    assert.deepEqual(state, before, '模式查询不能修改状态');
  }
});

test('身份模式：最后一名反贼死亡触发终局时仍奖励击杀者摸三张', () => {
  const f = fixture(5, { mode: 'identity', roles: rolesFor(5) });
  for (const id of [1, 3, 4]) { f.state.players[id].alive = false; f.state.players[id].hp = 0; }
  const attack = f.hand(0, 'sha');
  f.state.players[2].hp = 1;
  let state = choose(f.start(), d => d.type === 'play' && d.cid === attack && d.targets[0] === 2);
  state = choose(state, d => d.type === 'pass');
  assert.equal(state.players[0].hand.length, 3);
  assert.deepEqual(state.outcome, { status: 'finished', winners: [0, 1], losers: [2, 3, 4], reason: 'opposition-eliminated' });
  conservation(state);
});

test('模式通过注册注入，新增胜负条件不修改伤害或调度器', () => {
  class FirstDeathMode extends DuelMode {
    override readonly id = 'first-death';
    override evaluateOutcome(state: ReadonlyGameState): GameOutcome {
      if (state.players.every(p => p.alive)) return { status: 'ongoing' };
      return { status: 'finished', winners: [0, 1], losers: [2], reason: 'custom-rule' };
    }
  }
  const rules = new StandardRuleset(new ModeRegistry([new FirstDeathMode()]));
  const trace = new GameTrace<GameState>({ mode: 'first-death' });
  const game = new GameEngine(rules, { mode: 'first-death', initialHp: 1, players: playersFor(3) }, trace);
  const policy = new RuleBasePolicy();
  for (let step = 0; !game.finished && step < 200; step++) {
    const prompt = game.getDecision()!;
    game.choose(policy.choose(game.getObservation(prompt.actor), prompt));
  }
  assert.ok(game.finished);
  assert.deepEqual(game.getObservation(0).outcome, { status: 'finished', winners: [0, 1], losers: [2], reason: 'custom-rule' });
  assert.equal(trace.frames.at(-1)!.state.players.filter(p => p.alive).length, 2);
});

test('借刀杀人的击杀奖励归实际出杀者，不能归借刀的出牌者', () => {
  const f = fixture(5, { mode: 'identity', roles: rolesFor(5) });
  const trick = f.hand(0, 'jiedao');
  f.equip(1, 'zhuge', 'weapon');
  const attack = f.hand(1, 'sha');
  f.state.players[2].hp = 1;
  const trace = new GameTrace<GameState>({ mode: 'identity' });
  let state = choose(f.start(), d => d.type === 'play' && d.cid === trick && d.targets[0] === 1 && d.targets[1] === 2);
  state = choose(state, d => d.type === 'jiedaoSha');
  state = choose(state, d => d.type === 'pass', trace);
  assert.equal(state.players[1].hand.length, 3);
  assert.equal(state.players[0].hand.length, 0);
  assertDeath(trace, 2, { kind: 'damage', source: 1, amount: 1, card: state.cards[attack] });
  conservation(state);
});

test('无来源闪电击杀反贼不奖励任何角色，并保留判定牌来源', () => {
  const f = fixture(5, { mode: 'identity', roles: rolesFor(5) });
  const bolt = f.take('shandian');
  f.state.players[2].judge.push(bolt);
  f.state.players[2].hp = 3;
  f.top('sha', 'spade', 7);
  const trace = new GameTrace<GameState>({ mode: 'identity' });
  const state = choose(f.start(1), d => d.type === 'endPlay', trace);
  assert.equal(state.players[2].alive, false);
  assert.equal(state.players[1].hand.length, 0);
  assert.equal(state.active, 3);
  assert.doesNotMatch(debugLog(state).join('\n'), /摸了3张/);
  assertDeath(trace, 2, { kind: 'damage', source: null, amount: 3, card: bolt });
  conservation(state);
});

test('非主公击杀忠臣不受误杀惩罚，阵亡来源也不获得奖励', () => {
  const f = fixture(5, { mode: 'identity', roles: rolesFor(5) });
  const attack = f.hand(2, 'sha');
  const kept = f.hand(2, 'shan');
  f.state.players[1].hp = 1;
  let state = choose(f.start(2), d => d.type === 'play' && d.cid === attack && d.targets[0] === 1);
  state = choose(state, d => d.type === 'pass');
  assert.deepEqual(state.players[2].hand, [kept]);
  state.players[1].alive = false;
  const before = structuredClone(state);
  assert.deepEqual(new IdentityMode().onDeathWindow(state,
    { frameId: 1, parentFrameId: 0, target: 2, cause: { kind: 'damage', source: 1, amount: 1, card: null } }, 'afterCleanup'), []);
  assert.deepEqual(state, before);
  conservation(state);
});

test('轨迹 v4 正确区分未结束与结束，报告仍可读取旧 v1/v2 结果', () => {
  const trace = new GameTrace<GameState>({ seed: 7 });
  GameEngine.standard({ seed: 7 }, trace);
  assert.equal(trace.document().complete, false);
  assert.equal(trace.document().format, 'sanguosha-cli.full-trace.v4');
  assert.match(renderTraceReport(trace.document()), /结果：未结束/);
  assert.match(renderTraceReport({ ...trace.document(), format: 'sanguosha-cli.full-trace.v2' }), /结果：未结束/);
  assert.match(renderTraceReport({
    format: 'sanguosha-cli.full-trace.v1', complete: true, config: {}, frames: [],
    finalState: { outcome: 1, turn: 1, players: [{ label: '甲' }, { label: '乙' }] },
  }), /结果：乙获胜/);
});
