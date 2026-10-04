import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { responseCard } from '../src/web/response-card.ts';

test('决斗中打出的杀进入公开的桌面痕迹事件，避免重复播放普通响应', () => {
  const scenario = fixture();
  const duel = scenario.hand(0, 'juedou');
  const sha = scenario.hand(1, 'sha');
  let state = scenario.start();
  const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === duel);
  assert.ok(play);
  state = apply(state, play.id);
  const answer = legalActions(state).find(choice => choice.data?.type === 'respond' && choice.data.ids.includes(sha));
  assert.ok(answer);
  state = apply(state, answer.id);
  const observation = observe(state, 0);
  const shown = observation.events.map(event => responseCard(event, observation)).filter(card => card !== null);
  assert.deepEqual(shown, []);
  const trace = observation.events.find(event => event.kind === 'duelResponded');
  assert.ok(trace);
  assert.deepEqual(trace.data, { player: 1, card: sha, effectiveName: 'sha' });
  assert.equal(observation.eventCards?.[sha]?.name, 'sha');
});

test('转化响应只显示一次生效后的牌名', () => {
  const scenario = fixture();
  const cost = scenario.hand(1, 'shan');
  const observation = observe(scenario.start(), 0);
  observation.eventCards = { [cost]: scenario.state.cards[cost] };
  observation.events = [
    { id: 10, kind: 'discarded', data: { player: 1, card: cost, reason: 'respond' } },
    { id: 11, kind: 'transformationUsed', data: { owner: 1, ability: 'standard.longdan', label: '龙胆', produces: 'sha' } },
  ];
  const shown = observation.events.map(event => responseCard(event, observation)).filter(card => card !== null);
  assert.deepEqual(shown.map(item => [item.player, item.card.name]), [[1, 'sha']]);
});

test('决斗双方的杀按顺序公开，结束事件在最后一次未响应后发出', () => {
  const scenario = fixture();
  const duel = scenario.hand(0, 'juedou');
  const opponentSha = scenario.hand(1, 'sha');
  const ownSha = scenario.hand(0, 'sha');
  let state = scenario.start();
  const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === duel);
  assert.ok(play);
  state = apply(state, play.id);
  for (const card of [opponentSha, ownSha]) {
    const answer = legalActions(state).find(choice => choice.data?.type === 'respond' && choice.data.ids.includes(card));
    assert.ok(answer);
    state = apply(state, answer.id);
  }
  const pass = legalActions(state).find(choice => choice.data?.type === 'pass');
  assert.ok(pass);
  state = apply(state, pass.id);
  const events = observe(state, 0).events;
  assert.deepEqual(events.filter(event => event.kind === 'duelResponded').map(event =>
    [event.data.player, event.data.card]), [[1, opponentSha], [0, ownSha]]);
  assert.ok(events.some(event => event.kind === 'duelEnded' && event.data.loser === 1));
  assert.equal(events.map(event => responseCard(event, observe(state, 0))).filter(Boolean).length, 0);
});
