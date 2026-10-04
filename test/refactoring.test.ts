import { baselineLog } from './support/baseline-log.ts';
import { debugLog } from '../src/presentation/event-formatter.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { apply, createGame, decision, GameEngine, legalActions, observe } from '../engine.ts';
import { RuleBasePolicy } from '../policy.ts';
import { ChoiceExecutor } from '../src/core/choice-executor.ts';
import { ResolutionScheduler } from '../src/core/resolution-scheduler.ts';
import { choices, scheduler } from '../src/app/standard-resolution.ts';
import { cardMovement } from '../src/rules/operations/card-movement-service.ts';
import { deckService } from '../src/rules/operations/deck-service.ts';
import { vitals } from '../src/rules/operations/vitals-service.ts';
import { RuleQueryService } from '../src/rules/rule-query-service.ts';
import { CardTransformResolver } from '../src/rules/card-transform-resolver.ts';
import { standardTransforms } from '../src/content/standard/transforms.ts';
import { fixture } from './support/scenario-builder.ts';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('30 个标准局种子的行动序列与状态投影保持 v5 策略基线', () => {
  const baseline: { policyVersion: string; seed: number; choices: string; state: string }[] = JSON.parse(
    readFileSync(new URL('./fixtures/standard-v5-baseline.json', import.meta.url), 'utf8'));
  const policy = new RuleBasePolicy();
  for (const expected of baseline) {
    assert.equal(expected.policyVersion, 'v5');
    let state = createGame({ seed: expected.seed });
    const picks: string[] = [];
    while (state.outcome.status === 'ongoing' && picks.length < 2000) {
      const prompt = decision(state)!;
      const id = policy.choose(observe(state, prompt.actor), prompt);
      picks.push(id);
      state = apply(state, id);
    }
    assert.equal(digest(picks), expected.choices, `种子 ${expected.seed} 的动作改变`);
    // Baseline reflects positional selection of hidden hand cards; unrelated rule changes still fail here.
    assert.equal(state.resolution.stack.length, 0, '结束后不能残留结算帧');
    const outcome = state.outcome;
    const legacyOutcome = outcome.status === 'ongoing' ? null : outcome.status === 'draw' ? 'draw' : outcome.winners[0];
    // Preserve the original property order used by the frozen JSON hash.
    const { cards, deck, discard, table, players, rng, active, turn, phase, shaUsed, skipPlay } = state;
    const log = baselineLog(state);
    const legacyState = { cards, deck, discard, table, players, rng, active, turn, phase, shaUsed,
      queue: [], prompt: null, nullify: null, dying: null, outcome: legacyOutcome, log, skipPlay, wuguPool: [] };
    assert.equal(digest(legacyState), expected.state, `种子 ${expected.seed} 的规则结果改变`);
  }
});

test('公开选项、观察值与决策的嵌套对象不能修改对局', () => {
  const game = GameEngine.standard({ seed: 7 });
  const before = game.getDecision();
  const view = game.getObservation(0);
  const actions = game.getLegalActions();
  actions[0].id = '篡改';
  actions[0].data = { type: 'play', cid: 9999, targets: [0] };
  const returned = game.getDecision()!;
  returned.options.length = 0;
  returned.title = '篡改';
  const returnedView = game.getObservation(0);
  returnedView.self.hp = 100;
  returnedView.self.hand[0].name = 'tao';
  assert.deepEqual(game.getDecision(), before);
  assert.deepEqual(game.getObservation(0), view);
  const state = createGame({ seed: 7 });
  legalActions(state)[0].id = '篡改';
  assert.notEqual(legalActions(state)[0].id, '篡改');
});

test('过期决策及异步策略的迟到结果不会提交到新的决策', async () => {
  const game = GameEngine.standard({ seed: 7 });
  const current = game.getDecision()!;
  let resolve!: (id: string) => void;
  const pending = game.chooseWith({ choose: () => new Promise<string>(done => { resolve = done; }) });
  game.choose({ decisionId: current.id!, optionId: 'end-play' });
  const before = game.getObservation(0);
  assert.throws(() => game.choose({ decisionId: current.id!, optionId: 'end-play' }), /过期/);
  resolve('end-play');
  await assert.rejects(pending, /过期/);
  assert.deepEqual(game.getObservation(0), before);
});

test('自动结算失败时不提交部分状态或部分轨迹', () => {
  const state = createGame({ seed: 7 });
  const before = structuredClone(state);
  const failing = new ChoiceExecutor({ ...choices.handlers, play: next => {
    next.players[0].hp--;
    next.events.length = 0;
    resolutionStack.active(next).tasks = [{ kind: 'phasePlay' }];
  } }, new ResolutionScheduler({ ...scheduler.handlers, phasePlay: () => { throw new Error('模拟结算失败'); } }));
  const frames: unknown[] = [];
  assert.throws(() => failing.apply(state, legalActions(state)[0].id,
    (transition, snapshot) => frames.push({ transition, snapshot })), /模拟结算失败/);
  assert.deepEqual(state, before);
  assert.deepEqual(frames, []);
});

test('轨迹接收者修改快照不影响初始化与后续结算', () => {
  const regular = createGame({ seed: 7 });
  const watched = createGame({ seed: 7 }, (_transition, state) => {
    state.players[0].hp = 100;
    state.resolution.stack.length = 0;
  });
  assert.deepEqual(watched, regular);
  const next = apply(watched, 'end-play', (_transition, state) => {
    state.players[0].hp = 100;
    resolutionStack.active(state).prompt = null;
  });
  assert.deepEqual(next, apply(regular, 'end-play'));
});

test('批量移牌验证全部成本，非法费用不能留下半次移动', () => {
  const f = fixture();
  const first = f.hand(0, 'sha');
  const other = f.hand(1, 'shan');
  const before = structuredClone(f.state);
  assert.throws(() => cardMovement.move(f.state, [first, other], { kind: 'discard' }, 0), /不属于/);
  assert.deepEqual(f.state, before);
  assert.throws(() => cardMovement.move(f.state, [first, first], { kind: 'discard' }, 0), /重复/);
  assert.deepEqual(f.state, before);
});

test('同一个牌堆服务支持判定、亮牌和手牌目标，重洗后实体牌仍唯一', () => {
  const f = fixture();
  cardMovement.move(f.state, [...f.state.deck], { kind: 'discard' });
  const revealed = deckService.takeTop(f.state, 2, { kind: 'table' });
  const hand = deckService.takeTop(f.state, 1, { kind: 'hand', owner: 0 });
  assert.equal(revealed.length, 2);
  assert.equal(hand.length, 1);
  assert.equal(debugLog(f.state).filter(line => line === '弃牌堆洗回牌堆').length, 1);
  const ids = [...f.state.deck, ...f.state.discard, ...f.state.table, ...f.state.players[0].hand];
  assert.equal(ids.length, 108);
  assert.equal(new Set(ids).size, 108);
});

test('体力服务只回复缺失体力，濒死回复可以仍处于零体力', () => {
  const f = fixture();
  assert.equal(vitals.recover(f.state, 0, 2), 0);
  f.state.players[0].hp = 3;
  assert.equal(vitals.recover(f.state, 0, 2), 1);
  f.state.players[0].hp = -1;
  assert.equal(vitals.recover(f.state, 0), 1);
  assert.equal(f.state.players[0].hp, 0);
});

test('规则查询通过内容修正扩展，查询不改变状态或随机数', () => {
  const f = fixture(4);
  const before = structuredClone(f.state);
  const queries = new RuleQueryService([{
    distance: (_s, _from, _to, current) => current + 1,
    attackRange: () => 3,
    shaLimit: () => 2,
    handLimit: (_s, _actor, current) => current + 2,
  }]);
  assert.equal(queries.distance(f.state, 0, 2), 3);
  assert.equal(queries.canSha(f.state, 0, 2), true);
  assert.equal(queries.shaLimit(f.state, 0), 2);
  assert.equal(queries.handLimit(f.state, 0), 6);
  assert.deepEqual(f.state, before);
});

test('转化接口支持单牌与无实体牌，丈八候选保持相同成本与颜色', () => {
  const f = fixture();
  const a = f.hand(0, 'shan', 'diamond');
  const b = f.hand(0, 'tao', 'heart');
  f.equip(0, 'zhangba', 'weapon');
  const before = structuredClone(f.state);
  const standard = standardTransforms.candidates(f.state, 0, 'sha');
  assert.deepEqual(standard.map(c => c.ids), [[a, b]]);
  assert.equal('color' in standard[0].effective && standard[0].effective.color, 'red');
  const transforms = new CardTransformResolver([
    { id: 'test.single', produces: 'shan', costs: () => [[b]] },
    { id: 'test.empty', produces: 'tao', costs: () => [[]] },
  ]);
  assert.equal(transforms.candidates(f.state, 0, 'shan').at(-1)!.effective.name, 'shan');
  assert.deepEqual(transforms.candidates(f.state, 0, 'tao').at(-1)!.ids, []);
  assert.deepEqual(f.state, before);
});
