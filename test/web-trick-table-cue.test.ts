import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { trickTableCue } from '../src/web/trick-table-cue.ts';

test('决斗与连续两张无懈都有公开牌号，桌面按出牌次序追加并在决斗结束后清空', () => {
  const f = fixture();
  const duel = f.hand(0, 'juedou');
  const first = f.hand(1, 'wuxie');
  const second = f.hand(0, 'wuxie');
  const sha = f.hand(1, 'sha');
  let state = f.start();
  const choose = (type: string, cid?: number) => {
    const action = legalActions(state).find(choice => {
      const data = choice.data;
      return data?.type === type && (cid === undefined ||
        ('cid' in data && data.cid === cid) || ('ids' in data && data.ids.includes(cid)));
    });
    assert.ok(action, `没有 ${type} ${cid ?? ''} 的合法动作`);
    state = apply(state, action.id);
  };
  choose('play', duel);
  choose('nullify', first);
  choose('nullify', second);
  const view = observe(state, 0);
  const cues = view.events.map(event => trickTableCue(event, view)).filter(cue => cue !== null);
  assert.deepEqual(cues.map(cue => cue.kind === 'end' || cue.kind === 'clear' ? [cue.kind] :
    [cue.kind, cue.player, cue.card.id]), [
    ['start', 0, duel], ['append', 1, first], ['append', 0, second],
  ]);
  assert.equal(view.eventCards?.[first]?.name, 'wuxie');
  assert.equal(view.eventCards?.[second]?.name, 'wuxie');
  assert.deepEqual(view.events.filter(event => event.kind === 'nullificationUsed').map(event =>
    [event.data.player, event.data.target, event.data.parityBefore]), [[1, 1, 0], [0, 1, 1]]);
  choose('respond', sha);
  choose('pass');
  const ended = observe(state, 0);
  assert.equal(ended.events.map(event => trickTableCue(event, ended)).filter(cue => cue !== null).at(-1)?.kind, 'end');
});

test('一张无懈抵消决斗时也会发出桌面清理信号', () => {
  const f = fixture();
  const duel = f.hand(0, 'juedou');
  const wuxie = f.hand(1, 'wuxie');
  let state = f.start();
  const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === duel);
  assert.ok(play);
  state = apply(state, play.id);
  const nullify = legalActions(state).find(choice => choice.data?.type === 'nullify' && choice.data.cid === wuxie);
  assert.ok(nullify);
  state = apply(state, nullify.id);
  const view = observe(state, 0);
  assert.deepEqual(view.events.map(event => trickTableCue(event, view)?.kind).filter(Boolean),
    ['start', 'append', 'end']);
});

test('顺手牵羊被无懈后，顺手与无懈都保留在桌面直到下一张行动牌', () => {
  const f = fixture();
  const steal = f.hand(0, 'shunshou');
  const wuxie = f.hand(1, 'wuxie');
  f.hand(1, 'sha');
  let state = f.start();
  const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === steal);
  assert.ok(play);
  state = apply(state, play.id);
  const nullify = legalActions(state).find(choice => choice.data?.type === 'nullify' && choice.data.cid === wuxie);
  assert.ok(nullify);
  state = apply(state, nullify.id);
  const view = observe(state, 0);
  assert.deepEqual(view.events.map(event => trickTableCue(event, view)).filter(cue => cue !== null)
    .map(cue => cue.kind === 'start' || cue.kind === 'append' ? [cue.kind, cue.card.id] : [cue.kind]),
  [['start', steal], ['append', wuxie]]);
  assert.equal(view.eventCards?.[wuxie]?.name, 'wuxie');
  assert.ok(view.events.some(event => event.kind === 'trickCancelled' && event.data.cname === 'shunshou'));
});

test('顺手牵羊的两张连续无懈按次序追加，新的出牌清理上一组', () => {
  const f = fixture();
  const steal = f.hand(0, 'shunshou');
  const first = f.hand(1, 'wuxie');
  const second = f.hand(0, 'wuxie');
  f.hand(1, 'sha');
  let state = f.start();
  const choose = (type: string, cid: number) => {
    const action = legalActions(state).find(option => option.data?.type === type &&
      'cid' in option.data && option.data.cid === cid);
    assert.ok(action);
    state = apply(state, action.id);
  };
  choose('play', steal);
  choose('nullify', first);
  choose('nullify', second);
  const view = observe(state, 0);
  assert.deepEqual(view.events.map(event => trickTableCue(event, view)).filter(cue => cue !== null)
    .map(cue => cue.kind === 'start' || cue.kind === 'append' ? cue.card.id : null).filter(id => id !== null),
    [steal, first, second]);
  const next = { id: 999, kind: 'cardUsed' as const,
    data: { source: 0, card: 777, targets: [1], effectiveName: 'sha' as const } };
  assert.deepEqual(trickTableCue(next, view), { kind: 'clear' });
});
