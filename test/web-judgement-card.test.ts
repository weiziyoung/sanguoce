import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { judgementCard } from '../src/web/judgement-card.ts';

test('对方八卦判定的牌面和红黑结果可从公开观察值显示', () => {
  for (const [name, suit, result] of [
    ['tao', 'heart', '红色 · 视为闪'], ['sha', 'spade', '黑色 · 判定失败'],
  ] as const) {
    const f = fixture();
    const attack = f.hand(0, 'sha');
    f.equip(1, 'bagua', 'armor');
    const revealed = f.top(name, suit);
    let state = f.start();
    const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === attack);
    assert.ok(play);
    state = apply(state, play.id);
    const activate = legalActions(state).find(choice => choice.data?.type === 'bagua');
    assert.ok(activate);
    state = apply(state, activate.id);
    const view = observe(state, 0);
    const judged = view.events.find(event => event.kind === 'judged' && event.data.reason === 'bagua');
    if (!judged || judged.kind !== 'judged') throw new Error('没有公开的八卦判定事件');
    assert.equal(judged.data.card, revealed);
    assert.equal(view.eventCards?.[revealed]?.suit, suit);
    assert.deepEqual(judgementCard(judged, view), {
      kind: 'finish', card: view.eventCards?.[revealed], label: `对手 · 八卦阵判定\n${result}`,
    });
  }
});

test('鬼才改判时公开桌面原牌、换入新牌，最后只结算新牌', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[2].general = 'standard.simayi';
  const attack = f.hand(0, 'sha');
  const replacement = f.hand(2, 'shan', 'heart');
  f.equip(1, 'bagua', 'armor');
  const original = f.top('sha', 'spade');
  let state = f.start();
  const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === attack &&
    choice.data.targets[0] === 1);
  assert.ok(play);
  state = apply(state, play.id);
  const activate = legalActions(state).find(choice => choice.data?.type === 'bagua');
  assert.ok(activate);
  state = apply(state, activate.id);
  const before = observe(state, 0);
  assert.equal(before.table.at(-1)?.id, original);
  assert.ok(before.table.some(card => card.id === attack));
  const replace = legalActions(state).find(choice => choice.data?.type === 'replace' && choice.data.cid === replacement);
  assert.ok(replace);
  state = apply(state, replace.id);
  const after = observe(state, 0);
  const cues = after.events.map(event => judgementCard(event, after)).filter(cue => cue !== null);
  assert.deepEqual(cues.map(cue => [cue.kind, cue.card.id]), [
    ['replace', replacement], ['finish', replacement],
  ]);
  assert.equal(cues[0]?.kind === 'replace' && cues[0].oldCard.id, original);
  assert.match(cues[1]?.label ?? '', /红色 · 视为闪/);
});
