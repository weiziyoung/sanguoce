import { baselineLog } from './support/baseline-log.ts';
import { debugLog } from '../src/presentation/event-formatter.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createGame, decision, legalActions, observe } from '../engine.ts';
import { ResolutionScheduler } from '../src/core/resolution-scheduler.ts';
import { ChoiceExecutor, type ChoiceHandlers } from '../src/core/choice-executor.ts';
import { choices, scheduler } from '../src/app/standard-resolution.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import type { ActionData, GameState } from '../src/domain/state.ts';
import { beginCardUse } from '../src/content/standard/flows/card-use-flow.ts';
import { damage } from '../src/content/standard/flows/damage-flow.ts';
import { fixture } from './support/scenario-builder.ts';
import { RuleBasePolicy } from '../policy.ts';
import { GameTrace } from '../trace.ts';

const executor = (overrides: Partial<ChoiceHandlers>) => new ChoiceExecutor({ ...choices.handlers, ...overrides }, scheduler);
function choose(state: GameState, matches: (data: ActionData) => boolean, run = choices, trace?: GameTrace<GameState>): GameState {
  const option = legalActions(state).find(option => option.data && matches(option.data));
  assert.ok(option, `缺少预期选择：${decision(state)?.kind}`);
  return run.apply(state, option.id, trace ? (transition, snapshot) => trace.record(transition, snapshot) : undefined);
}
function conservation(state: GameState): void {
  const ids = [...state.deck, ...state.discard, ...state.table, ...state.players.flatMap(p =>
    [...p.hand, ...p.judge, ...Object.values(p.equip).filter((id): id is number => id !== null)])];
  assert.equal(ids.length, 108);
  assert.equal(new Set(ids).size, 108);
}
const countInDiscard = (state: GameState, card: number) => state.discard.filter(id => id === card).length;
const identityRoles = (count: number) => count === 5
  ? ['lord', 'loyalist', 'rebel', 'rebel', 'renegade']
  : ['lord', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'loyalist', 'renegade'];

// Hooks below extend real choice handlers at a deterministic point. They exercise the shared
// nesting protocol without inventing a production hero or changing the standard card pack.
for (const count of [2, 5, 8]) {
  test(`${count} 人：内层无懈不覆盖外层奇偶与游标，外层锦囊只结算一次`, () => {
    const f = fixture(count);
    const outer = f.hand(0, 'guohe');
    const innerSource = count - 1;
    const inner = f.hand(innerSource, 'wuzhong');
    const cancel = f.hand(1, 'wuxie');
    f.hand(0, 'wuxie');
    const armor = f.equip(1, 'bagua', 'armor');
    f.top('sha'); f.top('shan');
    const nested = executor({ nullify: (s, prompt, action) => {
      const outerChain = resolutionStack.require(s, 'nullification').data.cname === 'guohe';
      choices.handlers.nullify(s, prompt, action);
      if (outerChain && action.type === 'nullify') beginCardUse(s, innerSource, { type: 'play', cid: inner, targets: [] });
    } });
    let state = choose(f.start(), d => d.type === 'play' && d.cid === outer && d.targets[0] === 1, nested);
    assert.equal(decision(state)?.actor, 1);
    state = choose(state, d => d.type === 'nullify', nested);
    const chains = state.resolution.stack.filter(frame => frame.kind === 'nullification');
    assert.equal(chains.length, 2);
    const outerId = chains[0].id;
    assert.equal(chains[0].data.parity, 1);
    assert.equal(chains[1].data.parity, 0);
    assert.equal(observe(state, 0).nullify?.cname, 'wuzhong');
    assert.doesNotMatch(JSON.stringify(decision(state)), /frameId|resolution/);
    assert.ok(state.table.includes(outer) && state.table.includes(inner));
    const cloned = JSON.parse(JSON.stringify(state)) as GameState;
    const finish = (snapshot: GameState) => {
      // Inner wuxie is passed: inner draw happens; outer chain resumes at its own cursor/parity.
      let next = choose(snapshot, d => d.type === 'pass', nested);
      assert.equal(resolutionStack.require(next, 'nullification').id, outerId);
      assert.equal(observe(next, 0).nullify?.parity, 1);
      assert.equal(observe(next, 0).nullify?.cname, 'guohe');
      next = choose(next, d => d.type === 'pass', nested);
      return next;
    };
    state = finish(state);
    assert.deepEqual(state, finish(cloned), '暂停点的 JSON 快照必须可恢复');
    assert.equal(state.players[1].equip.armor, armor);
    assert.equal(state.players[innerSource].hand.length, 2);
    assert.equal(debugLog(state).filter(line => line.includes('摸了2张')).length, 1);
    for (const id of [outer, inner, cancel]) assert.equal(countInDiscard(state, id), 1);
    assert.equal(state.resolution.stack.length, 1);
    assert.equal(decision(state)?.kind, 'play');
    conservation(state);
  });

  test(`${count} 人：嵌套五谷使用独立牌池，内层完成后恢复外层目标与清理`, () => {
    const f = fixture(count);
    const outer = f.hand(0, 'wugu');
    const inner = f.hand(count - 1, 'wugu');
    for (let i = 0; i < count * 2; i++) f.top('sha');
    const nested = executor({ wugu: (s, prompt, action) => {
      const current = resolutionStack.nearest(s, 'trick');
      const startsChild = current.data.cid === outer && prompt.actor === 0;
      choices.handlers.wugu(s, prompt, action);
      if (startsChild) beginCardUse(s, count - 1, { type: 'play', cid: inner, targets: [] });
    } });
    let state = choose(f.start(), d => d.type === 'play' && d.cid === outer, nested);
    const outerFrame = resolutionStack.nearest(state, 'trick');
    const firstOuterCard = outerFrame.data.pool[0];
    state = choose(state, d => d.type === 'wugu' && d.cid === firstOuterCard, nested);
    const trickFrames = state.resolution.stack.filter(frame => frame.kind === 'trick');
    assert.equal(trickFrames.length, 2);
    const remainingOuter = [...trickFrames[0].data.pool];
    const innerPool = [...trickFrames[1].data.pool];
    assert.equal(remainingOuter.length, count - 1);
    assert.equal(innerPool.length, count);
    assert.ok(innerPool.every(id => !remainingOuter.includes(id)));
    const saved = JSON.parse(JSON.stringify(state)) as GameState;
    const finish = (snapshot: GameState) => {
      const innerActors: number[] = [];
      let next = snapshot;
      while (resolutionStack.nearest(next, 'trick').data.cid === inner) {
        innerActors.push(decision(next)!.actor);
        assert.deepEqual(resolutionStack.get(next, outerFrame.id, 'trick').data.pool, remainingOuter);
        assert.ok(legalActions(next).every(option => {
          const data = option.data;
          return data?.type === 'wugu' && innerPool.includes(data.cid);
        }));
        next = choose(next, d => d.type === 'wugu', nested);
      }
      assert.deepEqual(innerActors, [count - 1, ...Array.from({ length: count - 1 }, (_, i) => i)]);
      assert.equal(decision(next)?.actor, 1);
      const outerActors: number[] = [];
      while (decision(next)?.kind === 'wugu') {
        outerActors.push(decision(next)!.actor);
        next = choose(next, d => d.type === 'wugu', nested);
      }
      assert.deepEqual(outerActors, Array.from({ length: count - 1 }, (_, i) => i + 1));
      return next;
    };
    state = finish(state);
    assert.deepEqual(state, finish(saved));
    assert.ok(state.players.every(player => player.hand.length === 2));
    assert.deepEqual(state.table, []);
    assert.equal(countInDiscard(state, outer), 1);
    assert.equal(countInDiscard(state, inner), 1);
    assert.equal(state.resolution.stack.length, 1);
    conservation(state);
  });
}

for (const count of [5, 8]) {
  test(`${count} 人：外层求桃救活后触发内层濒死，两次费用和伤害均只执行一次`, () => {
    const f = fixture(count);
    const attack = f.hand(0, 'sha');
    const outerPeach = f.hand(2, 'tao');
    const innerPeach = f.hand(3, 'tao');
    f.state.players[1].hp = 1;
    f.state.players[2].hp = 1;
    const nested = executor({ dying: (s, prompt, action) => {
      const target = resolutionStack.require(s, 'dying').data.target;
      choices.handlers.dying(s, prompt, action);
      if (target === 1 && action.type === 'save') damage(s, 2, 3);
    } });
    let state = choose(f.start(), d => d.type === 'play' && d.cid === attack && d.targets[0] === 1, nested);
    state = choose(state, d => d.type === 'pass', nested);
    assert.equal(decision(state)?.actor, 2);
    state = choose(state, d => d.type === 'save', nested);
    const dying = state.resolution.stack.filter(frame => frame.kind === 'dying');
    assert.deepEqual(dying.map(frame => frame.data.target), [1, 2]);
    assert.equal(state.players[1].hp, 1);
    assert.equal(state.players[2].hp, 0);
    assert.equal(decision(state)?.actor, 3);
    const checkpoint = JSON.parse(JSON.stringify(state)) as GameState;
    const before = structuredClone(state);
    const records: unknown[] = [];
    const failing = executor({ dying: (s, prompt, action) => {
      choices.handlers.dying(s, prompt, action);
      throw new Error('子流程提交失败');
    } });
    assert.throws(() => failing.apply(state, `save:${innerPeach}`, (event, snapshot) => records.push({ event, snapshot })), /子流程提交失败/);
    assert.deepEqual(state, before);
    assert.deepEqual(records, []);
    state = choose(state, d => d.type === 'save', nested);
    assert.deepEqual(state, choose(checkpoint, d => d.type === 'save', nested));
    assert.equal(state.players[1].hp, 1);
    assert.equal(state.players[2].hp, 1);
    assert.equal(state.shaUsed, 1);
    assert.equal(debugLog(state).filter(line => line.includes('受到1点')).length, 2);
    for (const id of [attack, outerPeach, innerPeach]) assert.equal(countInDiscard(state, id), 1);
    assert.equal(state.resolution.stack.length, 1);
    conservation(state);
  });

  test(`${count} 人：同一角色在内层阵亡，外层濒死不会再次死亡或重复发奖`, () => {
    const f = fixture(count, { mode: 'identity', roles: identityRoles(count) });
    const attack = f.hand(1, 'sha');
    f.hand(3, 'tao');
    f.state.players[2].hp = 1;
    const nested = executor({ dying: (s, prompt, action) => {
      const isOuter = s.resolution.stack.filter(frame => frame.kind === 'dying').length === 1;
      choices.handlers.dying(s, prompt, action);
      if (isOuter && action.type === 'pass') damage(s, 2, 1);
    } });
    let state = choose(f.start(1), d => d.type === 'play' && d.cid === attack && d.targets[0] === 2, nested);
    state = choose(state, d => d.type === 'pass', nested);
    state = choose(state, d => d.type === 'pass', nested);
    assert.equal(state.resolution.stack.filter(frame => frame.kind === 'dying').length, 2);
    state = choose(state, d => d.type === 'pass', nested);
    assert.equal(state.players[2].alive, false);
    assert.equal(state.players[1].hand.length, 3);
    assert.equal(debugLog(state).filter(line => line.endsWith('阵亡')).length, 1);
    assert.equal(debugLog(state).filter(line => line.includes('摸了3张')).length, 1);
    assert.equal(state.resolution.stack.length, 1);
    conservation(state);
  });

  test(`${count} 人：内层终局清理全部父子流程和未选牌池，不再恢复外层`, () => {
    const f = fixture(count, { mode: 'identity', roles: identityRoles(count) });
    const outer = f.hand(0, 'wugu');
    const inner = f.hand(count - 1, 'wugu');
    for (let i = 0; i < count * 2; i++) f.top('sha');
    f.state.players[0].hp = 1;
    const nested = executor({ wugu: (s, prompt, action) => {
      const cid = resolutionStack.nearest(s, 'trick').data.cid;
      choices.handlers.wugu(s, prompt, action);
      if (cid === outer && prompt.actor === 0) beginCardUse(s, count - 1, { type: 'play', cid: inner, targets: [] });
      else if (cid === inner) damage(s, 0, count - 1);
    } });
    let state = choose(f.start(), d => d.type === 'play' && d.cid === outer, nested);
    state = choose(state, d => d.type === 'wugu', nested);
    const unchosen = state.resolution.stack.flatMap(frame => frame.kind === 'trick' ? frame.data.pool : []);
    assert.equal(unchosen.length, count * 2 - 1);
    state = choose(state, d => d.type === 'wugu', nested);
    assert.equal(state.outcome.status, 'finished');
    assert.deepEqual(state.resolution.stack, []);
    assert.deepEqual(state.table, []);
    assert.equal(decision(state), null);
    assert.ok(unchosen.every(id => state.discard.includes(id) || state.players.some(p => p.hand.includes(id))));
    assert.equal(debugLog(state).filter(line => line.includes('从【五谷丰登】获得')).length, 2);
    assert.equal(countInDiscard(state, outer), 1);
    assert.equal(countInDiscard(state, inner), 1);
    conservation(state);
  });
}

test('结算帧协议拒绝覆盖未提交选择，异常不能推进 ID 或损坏原状态', () => {
  const state = createGame();
  const before = structuredClone(state);
  assert.throws(() => damage(state, 1, 0), /先提交当前选择/);
  assert.deepEqual(state, before);
});

test('身份模式六场行动与业务状态摘要保持基础规则策略基线', () => {
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const baselines: { policy: string; count: number; seed: number; choices: string; gameplay: string }[] = JSON.parse(
    readFileSync(new URL('./fixtures/identity-rule-baseline.json', import.meta.url), 'utf8'));
  for (const expected of baselines) {
    assert.equal(expected.policy, 'RuleBasePolicy');
    // The frozen five-player traces predate the standard seat-one lord rule.
    let state = createGame({ mode: 'identity', seed: expected.seed, ...(expected.count === 5 ? { first: 4 } : {}),
      players: Array.from({ length: expected.count }, (_, id) => ({ label: `角色${id}`, sex: id % 2 ? 'female' : 'male' })) });
    const picks: string[] = [];
    const policy = new RuleBasePolicy();
    while (state.outcome.status === 'ongoing' && picks.length < 5000) {
      const prompt = decision(state)!;
      const id = policy.choose(observe(state, prompt.actor), prompt);
      picks.push(id);
      state = choices.apply(state, id);
    }
    const { resolution, events: _events, skipPlay, ...business } = state;
    const gameplay = { ...business, log: baselineLog(state), skipPlay };
    assert.deepEqual(resolution.stack, []);
    assert.equal(hash(picks), expected.choices);
    assert.equal(hash(gameplay), expected.gameplay);
  }
});

test('外层求桃恢复时重新生成候选，内层用掉的桃不会作为旧选择重新出现', () => {
  const f = fixture(5);
  const attack = f.hand(0, 'sha');
  const keptPeach = f.hand(2, 'tao');
  const spentPeach = f.hand(3, 'tao');
  f.state.players[1].hp = 1;
  f.state.players[3].hp = 1;
  const nested = executor({ dying: (s, prompt, action) => {
    const target = resolutionStack.require(s, 'dying').data.target;
    choices.handlers.dying(s, prompt, action);
    if (target === 1 && action.type === 'pass') damage(s, 3, 0);
  } });
  let state = choose(f.start(), d => d.type === 'play' && d.cid === attack && d.targets[0] === 1, nested);
  state = choose(state, d => d.type === 'pass', nested);
  assert.equal(decision(state)?.actor, 2);
  state = choose(state, d => d.type === 'pass', nested);
  assert.equal(decision(state)?.actor, 3);
  state = choose(state, d => d.type === 'save', nested);
  assert.equal(state.players[1].alive, false);
  assert.equal(state.players[3].hp, 1);
  assert.ok(state.players[2].hand.includes(keptPeach));
  assert.equal(countInDiscard(state, spentPeach), 1);
  assert.equal(decision(state)?.kind, 'play');
  conservation(state);
});

test('决斗响应中的子流程先结算，恢复后能用新摸到的杀继续响应', () => {
  const f = fixture();
  const duel = f.hand(0, 'juedou');
  const draw = f.hand(0, 'wuzhong');
  const answer = f.hand(1, 'sha');
  f.top('shan');
  const drawnSha = f.top('sha');
  const nested = executor({ respond: (s, prompt, action) => {
    choices.handlers.respond(s, prompt, action);
    if (prompt.context.mode === 'juedou' && prompt.actor === 1 && action.type === 'respond') {
      beginCardUse(s, 0, { type: 'play', cid: draw, targets: [] });
    }
  } });
  let state = choose(f.start(), d => d.type === 'play' && d.cid === duel, nested);
  state = choose(state, d => d.type === 'respond', nested);
  assert.equal(decision(state)?.actor, 0);
  assert.equal(decision(state)?.kind, 'respond');
  assert.ok(legalActions(state).some(option => option.data?.type === 'respond' && option.data.ids.includes(drawnSha)));
  state = choose(state, d => d.type === 'respond', nested);
  state = choose(state, d => d.type === 'pass', nested);
  assert.equal(state.players[1].hp, 3);
  assert.equal(state.players[0].hp, 4);
  assert.equal(state.shaUsed, 0);
  for (const id of [duel, draw, answer, drawnSha]) assert.equal(countInDiscard(state, id), 1);
  conservation(state);
});

test('内层五谷全部被抵消时只清理自己的未选牌，不丢失外层牌池', () => {
  const f = fixture();
  const outer = f.hand(0, 'wugu');
  const inner = f.hand(1, 'wugu');
  f.hand(0, 'wuxie'); f.hand(0, 'wuxie');
  for (let i = 0; i < 4; i++) f.top('sha');
  const nested = executor({ wugu: (s, prompt, action) => {
    const startsChild = resolutionStack.nearest(s, 'trick').data.cid === outer && prompt.actor === 0;
    choices.handlers.wugu(s, prompt, action);
    if (startsChild) beginCardUse(s, 1, { type: 'play', cid: inner, targets: [] });
  } });
  let state = choose(f.start(), d => d.type === 'play' && d.cid === outer, nested);
  state = choose(state, d => d.type === 'pass', nested);
  state = choose(state, d => d.type === 'wugu', nested);
  const outerPool = [...state.resolution.stack.filter(frame => frame.kind === 'trick').find(frame => frame.data.cid === outer)!.data.pool];
  const innerPool = [...resolutionStack.nearest(state, 'trick').data.pool];
  while (decision(state)?.kind === 'nullify') {
    const parity = observe(state, 0).nullify!.parity;
    state = choose(state, d => parity === 0 ? d.type === 'nullify' : d.type === 'pass', nested);
  }
  assert.equal(resolutionStack.nearest(state, 'trick').data.cid, outer);
  assert.ok(innerPool.every(id => state.discard.includes(id)));
  assert.ok(outerPool.every(id => state.table.includes(id)));
  assert.equal(decision(state)?.actor, 1);
  state = choose(state, d => d.type === 'wugu', nested);
  assert.equal(state.players[1].hand.length, 1);
  assert.deepEqual(state.table, []);
  conservation(state);
});

test('内层自动结算失败回滚外层已支付费用、整个流程栈、ID 和全部轨迹', () => {
  const f = fixture();
  const outer = f.hand(0, 'guohe');
  const inner = f.hand(1, 'wuzhong');
  f.hand(1, 'wuxie');
  f.equip(1, 'bagua', 'armor');
  const failingScheduler = new ResolutionScheduler({
    ...scheduler.handlers,
    resolveTrick: (s, task) => {
      scheduler.handlers.resolveTrick(s, task);
      throw new Error('内层效果失败');
    },
  });
  const failing = new ChoiceExecutor({ ...choices.handlers, nullify: (s, prompt, action) => {
    choices.handlers.nullify(s, prompt, action);
    beginCardUse(s, 1, { type: 'play', cid: inner, targets: [] });
  } }, failingScheduler);
  const state = choose(f.start(), d => d.type === 'play' && d.cid === outer && d.targets[0] === 1);
  const before = structuredClone(state);
  const frames: unknown[] = [];
  const selected = legalActions(state).find(option => option.data?.type === 'nullify')!;
  assert.throws(() => failing.apply(state, selected.id, (transition, snapshot) => frames.push({ transition, snapshot })), /内层效果失败/);
  assert.deepEqual(state, before);
  assert.deepEqual(frames, []);
  conservation(state);
});

test('内层阵亡移除外层无懈参与者，恢复后不向死者索要响应', () => {
  const f = fixture(5);
  const trick = f.hand(0, 'guohe');
  const armor = f.equip(1, 'bagua', 'armor');
  f.hand(2, 'wuxie');
  const deadPlayersCounter = f.hand(3, 'wuxie');
  f.state.players[3].hp = 1;
  const nested = executor({ nullify: (s, prompt, action) => {
    choices.handlers.nullify(s, prompt, action);
    if (prompt.actor === 2 && action.type === 'pass') damage(s, 3, 0);
  } });
  let state = choose(f.start(), d => d.type === 'play' && d.cid === trick && d.targets[0] === 1, nested);
  assert.equal(decision(state)?.actor, 2);
  state = choose(state, d => d.type === 'pass', nested);
  assert.equal(state.players[3].alive, false);
  assert.equal(decision(state)?.kind, 'zone');
  assert.equal(decision(state)?.actor, 0);
  state = choose(state, d => d.type === 'zone', nested);
  assert.equal(countInDiscard(state, armor), 1);
  assert.equal(countInDiscard(state, deadPlayersCounter), 1);
  assert.equal(state.resolution.stack.length, 1);
  conservation(state);
});

test('内层阵亡改变求桃圈，外层跳过死者并在剩余人均放弃后结束', () => {
  const f = fixture(5);
  const attack = f.hand(0, 'sha');
  f.hand(2, 'tao');
  const deadPlayersPeach = f.hand(3, 'tao');
  f.state.players[1].hp = 1;
  f.state.players[3].hp = 1;
  const nested = executor({ dying: (s, prompt, action) => {
    const target = resolutionStack.require(s, 'dying').data.target;
    choices.handlers.dying(s, prompt, action);
    if (target === 1 && action.type === 'pass') damage(s, 3, 0);
  } });
  let state = choose(f.start(), d => d.type === 'play' && d.cid === attack && d.targets[0] === 1, nested);
  state = choose(state, d => d.type === 'pass', nested);
  assert.equal(decision(state)?.actor, 2);
  state = choose(state, d => d.type === 'pass', nested);
  assert.equal(decision(state)?.actor, 3);
  state = choose(state, d => d.type === 'pass', nested);
  assert.equal(decision(state)?.actor, 2);
  state = choose(state, d => d.type === 'pass', nested);
  assert.equal(state.players[3].alive, false);
  assert.equal(state.players[1].alive, false);
  assert.equal(countInDiscard(state, deadPlayersPeach), 1);
  assert.equal(decision(state)?.actor, 0);
  assert.equal(decision(state)?.kind, 'play');
  conservation(state);
});
