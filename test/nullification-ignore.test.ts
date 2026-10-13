import test from 'node:test';
import assert from 'node:assert/strict';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { beginNullify } from '../src/content/standard/flows/nullification-flow.ts';
import { beginTrick } from '../src/content/standard/flows/trick-flow.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { contextActionChoices } from '../src/web/hud.ts';
import type { GameState } from '../src/domain/state.ts';
import { mountainScene, conserved } from './support/mountain-scenario.ts';
import { tableSceneFixture } from './support/table-scene-fixture.ts';

function setup(count = 5, cards: 'standard' | 'junzheng' = 'standard') {
  const x = mountainScene(count, cards, count === 5);
  for (let seat = 0; seat < count; seat++) x.general(seat, 'standard.zhangfei');
  return x;
}
function finishUse(x: ReturnType<typeof setup>, initial: GameState, ignored: number) {
  let state = initial;
  const choices: { actor: number; kind: string }[] = [];
  for (let step = 0; step < 80 && decision(state)?.kind !== 'play'; step++) {
    const d = decision(state)!;
    assert.ok(d);
    assert.ok(d.actor !== ignored || d.kind !== 'nullify', '本次用牌不能再次询问已忽略角色');
    choices.push({ actor: d.actor, kind: d.kind });
    const option = (d.actor === ignored ? legalActions(state).find(o => o.data?.type === 'respond') : undefined) ??
      legalActions(state).find(o => o.data?.type === 'pass') ?? legalActions(state)[0];
    state = x.rules.apply(state, option.id);
  }
  assert.equal(decision(state)?.kind, 'play');
  return { state, choices };
}

for (const count of [2, 5]) for (const cards of ['standard', 'junzheng'] as const)
  for (const name of ['nanman', 'wanjian', 'wugu'] as const) {
    test(`${count}人/${cards}/${name}：真实按钮忽略本次各目标，下一张牌恢复（有同名牌时仍询问）`, () => {
      const x = setup(count, cards), trick = x.f.hand(0, name), next = x.f.hand(0, name === 'wanjian' ? 'nanman' : name);
      const ignored = name === 'wugu' ? 0 : 1;
      const wuxie = x.f.hand(ignored, 'wuxie');
      if (name !== 'wugu') x.f.hand(ignored, name === 'nanman' ? 'sha' : 'shan');
      const beforeHp = x.f.state.players.map(p => p.hp);
      let state = x.choose(x.start(), a => a.type === 'play' && a.cid === trick);
      assert.equal(decision(state)?.kind, 'nullify');
      assert.equal(decision(state)?.actor, ignored);
      const ui = tableSceneFixture(state, ignored);
      try {
        assert.equal(ui.node('ignore-nullify').classes.has('hidden'), false);
        assert.equal(contextActionChoices(ui.scene.model!).some(c => c.actionType === 'ignoreNullify'), false);
        assert.equal(ui.node('play-action').disabled, true, '忽略入口不能冒充出牌确认');
        ui.clickCard(wuxie);
        assert.equal(ui.node('play-action').disabled, false, '选无懈后仍可正常确认');
        ui.node('ignore-nullify').click();
        assert.equal(ui.submitted[0].actionType, 'ignoreNullify');
        state = x.rules.apply(state, ui.submitted[0].id);
        const finished = finishUse(x, state, ignored); state = finished.state;
        assert.ok(state.players[ignored].hand.includes(wuxie), '忽略不消耗无懈');
        if (name === 'wugu') {
          assert.ok(finished.choices.some(d => d.actor === ignored && d.kind === 'wugu'), '五谷选牌照常询问');
          for (let seat = 1; seat < count; seat++) assert.equal(state.players[seat].hand.length, 1);
        } else {
          assert.ok(finished.choices.some(d => d.actor === ignored && d.kind === 'respond'), '杀／闪仍询问');
          assert.equal(state.players[ignored].hp, beforeHp[ignored]);
          for (let seat = 2; seat < count; seat++) assert.equal(state.players[seat].hp, beforeHp[seat] - 1);
        }
        assert.equal(state.resolution.stack.some(f => f.kind === 'trick'), false);
        ui.load(state); assert.ok(ui.node('ignore-nullify').classes.has('hidden'));
        state = x.choose(state, a => a.type === 'play' && a.cid === next);
        assert.equal(decision(state)?.kind, 'nullify');
        assert.equal(decision(state)?.actor, ignored);
        conserved(state);
      } finally { ui.dispose(); }
    });
  }

test('普通不响应仍在下一目标、反无懈时询问', () => {
  const x = setup(); const card = x.f.hand(0, 'wanjian'); x.f.hand(0, 'wuxie'); const counter = x.f.hand(1, 'wuxie');
  let state = x.choose(x.start(), a => a.type === 'play' && a.cid === card);
  state = x.choose(state, a => a.type === 'pass');
  assert.equal(decision(state)?.actor, 0);
  state = x.choose(state, a => a.type === 'pass');
  assert.equal(decision(state)?.kind, 'respond');
  state = x.choose(state, a => a.type === 'pass');
  assert.equal(decision(state)?.actor, 0); // Next target begins a new window.
  state = x.choose(state, a => a.type === 'pass');
  assert.equal(decision(state)?.kind, 'nullify'); assert.equal(decision(state)?.actor, 1);
  state = x.choose(state, a => a.type === 'nullify' && a.cid === counter);
  assert.equal(decision(state)?.actor, 0); assert.equal(decision(state)?.kind, 'nullify');
});

test('忽略随 JSON 保存，其他人仍可无懈，反无懈不重新询问忽略者', () => {
  const x = setup(); const card = x.f.hand(0, 'wanjian'); const own = x.f.hand(1, 'wuxie'); const other = x.f.hand(2, 'wuxie');
  let state = x.choose(x.start(), a => a.type === 'play' && a.cid === card);
  state = x.choose(state, a => a.type === 'ignoreNullify');
  state = JSON.parse(JSON.stringify(state));
  assert.equal(decision(state)?.actor, 2);
  state = x.choose(state, a => a.type === 'nullify' && a.cid === other);
  const finished = finishUse(x, state, 1); state = finished.state;
  assert.ok(state.players[1].hand.includes(own));
  assert.ok(state.discard.includes(other));
  assert.equal(state.players[1].hp, 4); assert.equal(state.players[2].hp, 3);
  conserved(state);
});

test('两个人可分别忽略同一次用牌，不消耗双方无懈', () => {
  const x = setup(); const card = x.f.hand(0, 'nanman'); const first = x.f.hand(1, 'wuxie'), second = x.f.hand(2, 'wuxie');
  let state = x.choose(x.start(), a => a.type === 'play' && a.cid === card);
  state = x.choose(state, a => a.type === 'ignoreNullify');
  state = x.choose(state, a => a.type === 'ignoreNullify');
  state = finishUse(x, state, 1).state;
  assert.ok(state.players[1].hand.includes(first)); assert.ok(state.players[2].hand.includes(second));
});

test('看破转化的无懈也可忽略，下一张牌恢复转化候选', () => {
  const x = setup(); x.general(1, 'fire.wolong');
  const card = x.f.hand(0, 'nanman'), next = x.f.hand(0, 'wanjian'), black = x.f.hand(1, 'qinggang', 'spade');
  let state = x.choose(x.start(), a => a.type === 'play' && a.cid === card);
  assert.ok(legalActions(state).some(o => o.data?.type === 'nullify' && o.data.transformation === 'fire.kanpo'));
  state = finishUse(x, x.choose(state, a => a.type === 'ignoreNullify'), 1).state;
  assert.ok(state.players[1].hand.includes(black));
  state = x.choose(state, a => a.type === 'play' && a.cid === next);
  assert.equal(decision(state)?.actor, 1);
  assert.ok(legalActions(state).some(o => o.data?.type === 'nullify' && o.data.cid === black));
});

test('一次用牌的忽略不会影响嵌套的另一张锦囊', () => {
  const x = setup(); const outer = x.f.hand(0, 'nanman'), inner = x.f.take('wugu'); x.f.hand(1, 'wuxie');
  let state = x.choose(x.start(), a => a.type === 'play' && a.cid === outer);
  state = x.choose(state, a => a.type === 'ignoreNullify');
  assert.equal(decision(state)?.kind, 'respond');
  const frame = resolutionStack.nearest(state, 'trick');
  // Simulate a separate trick opened by a trigger during the outer resolution.
  resolutionStack.active(state).prompt = null;
  beginTrick(state, 0, 'wugu', [1], inner, null, x.runtime); x.advance(state);
  assert.equal(decision(state)?.kind, 'nullify'); assert.equal(decision(state)?.actor, 1);
  assert.deepEqual(resolutionStack.get(state, frame.id, 'trick').data.ignoredNullifiers, [1]);
});

test('延时锦囊的忽略仅覆盖当前判定的反无懈链', () => {
  const x = setup(2); const first = x.f.take('lebu'), second = x.f.take('lebu'); const own = x.f.hand(0, 'wuxie'), other = x.f.hand(1, 'wuxie');
  x.f.state.players[0].judge.push(first, second);
  beginNullify(x.f.state, { kind: 'resolveJudge', owner: 0, cid: first }, { kind: 'cancelJudge', owner: 0, cid: first }, 0, 0, 'lebu');
  let state = x.advance(x.f.state);
  state = x.choose(state, a => a.type === 'ignoreNullify');
  state = x.choose(state, a => a.type === 'nullify' && a.cid === other);
  assert.equal(decision(state), null); assert.ok(state.players[0].hand.includes(own));
  beginNullify(state, { kind: 'resolveJudge', owner: 0, cid: second }, null, 0, 0, 'lebu'); x.advance(state);
  assert.equal(decision(state)?.kind, 'nullify'); assert.equal(decision(state)?.actor, 0);
});

test('规则 AI 保留逐目标无懈决策，不自动启用忽略', () => {
  const x = setup(2); const card = x.f.hand(0, 'wanjian'); x.f.hand(1, 'wuxie');
  const state = x.choose(x.start(), a => a.type === 'play' && a.cid === card), d = decision(state)!;
  const policy = new StrategicPolicy(); const choice = policy.choose(x.rules.observe(state, d.actor), d);
  assert.equal(legalActions(state).find(o => o.id === choice)?.data?.type, 'nullify');
  const ui = tableSceneFixture(state);
  try {
    ui.scene.busy = true; ui.scene.updateSelection();
    assert.equal(ui.node('ignore-nullify').disabled, true);
  } finally { ui.dispose(); }
});

for (const name of ['taoyuan', 'tiesuo'] as const) {
  test(`${name}同样跨目标忽略无懈`, () => {
    const x = setup(5, 'junzheng'), card = x.f.hand(0, name), own = x.f.hand(1, 'wuxie');
    x.f.state.players.forEach(p => p.hp--);
    let state = x.choose(x.start(), a => a.type === 'play' && a.cid === card &&
      (name !== 'tiesuo' || a.targets.length === 2 && a.targets.includes(1) && a.targets.includes(2)));
    if (name === 'taoyuan') assert.equal(decision(state)?.actor, 1);
    state = finishUse(x, x.choose(state, a => a.type === 'ignoreNullify'), 1).state;
    assert.ok(state.players[1].hand.includes(own));
    if (name === 'taoyuan') state.players.forEach(p => assert.equal(p.hp, p.maxHp));
    else { assert.equal(state.players[1].chained, true); assert.equal(state.players[2].chained, true); }
    conserved(state);
  });
}
