import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, createGame, decision, legalActions, observe } from '../engine.ts';
import { RuleBasePolicy } from '../policy.ts';
import type { ActionData, GameState } from '../src/domain/state.ts';
import { standardQueries } from '../src/content/standard/queries.ts';
import { seatService } from '../src/domain/seat-service.ts';
import { fixture } from './support/scenario-builder.ts';

function choose(state: GameState, matches: (data: ActionData) => boolean): GameState {
  const option = legalActions(state).find(option => option.data && matches(option.data));
  assert.ok(option, '缺少预期选择');
  return apply(state, option.id);
}
function assertConservation(state: GameState): void {
  const ids = [...state.deck, ...state.discard, ...state.table, ...state.players.flatMap(p =>
    [...p.hand, ...p.judge, ...Object.values(p.equip).filter((id): id is number => id !== null)])];
  assert.equal(ids.length, 108);
  assert.equal(new Set(ids).size, 108);
}

for (const count of [5, 8]) {
  test(`${count} 人共用规则：多个种子完整运行，不向死者请求行动且牌守恒`, () => {
    const policy = new RuleBasePolicy();
    for (const seed of [1, 7, 19]) {
      let state = createGame({ seed, players: Array.from({ length: count }, (_, id) => ({
        label: `角色${id + 1}`, sex: id % 2 ? 'female' : 'male',
      })) });
      for (let step = 0; state.outcome.status === 'ongoing' && step < 5000; step++) {
        const prompt = decision(state);
        assert.ok(prompt);
        assert.ok(state.players[prompt.actor].alive, `种子 ${seed} 向阵亡角色请求行动`);
        state = apply(state, policy.choose(observe(state, prompt.actor), prompt));
        assertConservation(state);
      }
      // This harness uses existing last-survivor rules, not identity-mode victory rules.
      assert.notEqual(state.outcome.status, 'ongoing', `种子 ${seed} 未结束`);
    }
  });

  test(`${count} 人共用规则：回合角色在决斗中阵亡后不能继续出牌`, () => {
    const f = fixture(count);
    const duel = f.hand(0, 'juedou');
    f.hand(1, 'sha');
    f.state.players[0].hp = 1;
    let state = choose(f.start(), d => d.type === 'play' && d.cid === duel && d.targets[0] === 1);
    state = choose(state, d => d.type === 'respond');
    assert.equal(decision(state)?.actor, 0);
    state = choose(state, d => d.type === 'pass');
    assert.equal(state.players[0].alive, false);
    assert.equal(state.outcome.status, 'ongoing');
    assert.equal(decision(state)?.actor, 1);
    assert.equal(state.active, 1);
    assert.equal(state.players[0].hand.length, 0);
    assertConservation(state);
  });

  test(`${count} 人共用规则：距离按存活座次计算，死亡后重新缩短`, () => {
    const f = fixture(count);
    const target = Math.floor(count / 2);
    assert.equal(standardQueries.distance(f.state, 0, target), target);
    f.state.players[1].alive = false;
    assert.equal(standardQueries.distance(f.state, 0, target), target - 1);
  });

  test(`${count} 人共用规则：非目标角色可以使用无懈保护目标`, () => {
    const f = fixture(count);
    const trick = f.hand(0, 'guohe');
    const armor = f.equip(1, 'bagua', 'armor');
    f.hand(count - 1, 'wuxie');
    let state = choose(f.start(), d => d.type === 'play' && d.cid === trick && d.targets[0] === 1);
    assert.equal(decision(state)?.actor, count - 1);
    state = choose(state, d => d.type === 'nullify');
    assert.equal(state.players[1].equip.armor, armor);
    assert.equal(decision(state)?.actor, 0);
    assertConservation(state);
  });

  test(`${count} 人共用规则：第三方可以救治其他濒死角色`, () => {
    const f = fixture(count);
    const attack = f.hand(0, 'sha');
    f.hand(count - 1, 'tao');
    f.state.players[1].hp = 1;
    let state = choose(f.start(), d => d.type === 'play' && d.cid === attack && d.targets[0] === 1);
    state = choose(state, d => d.type === 'pass');
    assert.equal(decision(state)?.kind, 'dying');
    assert.equal(decision(state)?.actor, count - 1);
    state = choose(state, d => d.type === 'save');
    assert.equal(state.players[1].hp, 1);
    assert.equal(state.players[1].alive, true);
    assertConservation(state);
  });

  test(`${count} 人共用规则：范围锦囊在目标死亡后继续结算其他目标`, () => {
    const f = fixture(count);
    const attack = f.hand(0, 'nanman');
    f.state.players[1].hp = 1;
    let state = choose(f.start(), d => d.type === 'play' && d.cid === attack);
    const responders: number[] = [];
    while (decision(state)?.kind === 'respond') {
      responders.push(decision(state)!.actor);
      state = choose(state, d => d.type === 'pass');
    }
    assert.deepEqual(responders, Array.from({ length: count - 1 }, (_, i) => i + 1));
    assert.equal(state.players[1].alive, false);
    assert.ok(state.players.slice(2).every(p => p.hp === 3));
    assert.equal(decision(state)?.actor, 0);
    assertConservation(state);
  });

  test(`${count} 人共用规则：五谷按座次逐人选牌`, () => {
    const f = fixture(count);
    const harvest = f.hand(0, 'wugu');
    let state = choose(f.start(), d => d.type === 'play' && d.cid === harvest);
    const pickers: number[] = [];
    while (decision(state)?.kind === 'wugu' || decision(state)?.kind === 'nullify') {
      if (decision(state)?.kind === 'nullify') {
        state = choose(state, d => d.type === 'pass');
        continue;
      }
      pickers.push(decision(state)!.actor);
      state = choose(state, d => d.type === 'wugu');
    }
    assert.deepEqual(pickers, Array.from({ length: count }, (_, i) => i));
    assert.ok(state.players.every(p => p.hand.length === 1));
    assert.ok(!state.resolution.stack.some(frame => frame.kind === 'trick' && frame.data.pool.length));
    assertConservation(state);
  });
}


test('座次服务支持死亡锚点、全员死亡与非连续角色 ID', () => {
  const state = { players: [{ id: 10, alive: false }, { id: 30, alive: true }, { id: 20, alive: true }] };
  assert.deepEqual(seatService.livingOrder(state, 10), [30, 20]);
  assert.equal(seatService.nextLiving(state, 20), 30);
  assert.equal(seatService.distance(state, 30, 20), 1);
  for (const player of state.players) player.alive = false;
  assert.deepEqual(seatService.livingOrder(state, 10), []);
  assert.equal(seatService.nextLiving(state, 10), null);
});
