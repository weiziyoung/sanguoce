import test from 'node:test';
import assert from 'node:assert/strict';
import { coinReward } from '../src/web/shop.ts';
import { BrowserDuel } from '../src/app/browser-duel.ts';
import { BrowserIdentity } from '../src/app/browser-identity.ts';
import { createOpeningState } from '../src/app/standard-game.ts';
import type { WebGameDocument } from '../src/app/web-game-record.ts';
import type { RuleEvent } from '../src/domain/events.ts';

const game = (mode = 'duel'): WebGameDocument => ({ format: 'sanguosha.web-game.v1', config: { mode }, humanSeat: 0,
  startedAt: '', finishedAt: '', choices: [], events: [], turn: 1,
  players: [{ id: 0, label: '你', role: 'lord' }, { id: 1, label: '敌', role: 'rebel' }, { id: 2, label: '友', role: 'loyalist' }],
  outcome: { status: 'finished', winners: [0, 2], losers: [1], reason: 'opposition-eliminated' } });
const event = (kind: string, data: object) => ({ id: 1, kind, data, frameId: null, parentEventId: null }) as RuleEvent;

test('金币仅胜利发放：贡献增加奖励，友伤扣除，上限受模式约束', () => {
  const duel = game(); assert.deepEqual(coinReward(duel), { victory: 20, contribution: 0, total: 20 });
  duel.events = [event('damaged', { source: 0, target: 1, amount: 2 })];
  assert.equal(coinReward(duel).total, 32);
  duel.events = [event('damaged', { source: 0, target: 1, amount: 100 })];
  assert.equal(coinReward(duel).total, 50);
  for (const outcome of [{ status: 'draw', reason: 'test' }, { status: 'finished', winners: [1], losers: [0], reason: 'test' }] as const) {
    duel.outcome = structuredClone(outcome) as WebGameDocument['outcome']; assert.equal(coinReward(duel).total, 0);
  }
  const identity = game('identity');
  identity.events = [event('damaged', { source: 0, target: 1, amount: 3 }), event('recovered', { source: 0, player: 2, amount: 1 })];
  assert.equal(coinReward(identity).total, 62);
  identity.events.push(event('damaged', { source: 0, target: 2, amount: 3 }));
  assert.equal(coinReward(identity).total, 44);
  identity.events = [event('damaged', { source: 0, target: 1, amount: 100 })]; assert.equal(coinReward(identity).total, 120);
});

test('网页五张起手牌与重抽可复现，重抽不混回原手牌、不改变对手起手，所有牌唯一', () => {
  for (const session of [new BrowserDuel(16), new BrowserIdentity(16), new BrowserIdentity(16, 'junzheng', ['wind'])]) {
    const general = session.candidates[0].id;
    const original = session.openingHand(general), redraw = session.openingHand(general, { redraw: true });
    assert.equal(original.length, 5); assert.equal(redraw.length, 5);
    assert.ok(redraw.every(card => !original.some(old => old.id === card.id)));
    assert.deepEqual(session.openingHand(general, { redraw: true }), redraw);
    session.start(general, { redraw: true });
    const config = session.record!.config;
    const state = createOpeningState(config), before = createOpeningState({ ...config, opening: { humanSeat: session.humanSeat, redraw: false } });
    assert.deepEqual(state.players[session.humanSeat].hand, redraw.map(card => card.id));
    for (const player of state.players) if (player.id !== session.humanSeat) assert.deepEqual(player.hand, before.players[player.id].hand);
    const all = [...state.deck, ...state.discard, ...state.table, ...state.players.flatMap(player => player.hand)];
    assert.equal(all.length, new Set(all).size); assert.equal(all.length, Object.keys(state.cards).length);
    assert.throws(() => session.start(general), /已经开始/);
  }
});

test('点将覆盖所有启用武将，2／5人均不与电脑重将，未启用武将和普通越权选将被拒绝', () => {
  for (const count of [2, 5]) for (const seed of [1, 2, 8]) {
    const make = () => count === 2 ? new BrowserDuel(seed, 'standard', ['fire']) : new BrowserIdentity(seed, 'standard', ['fire']);
    const candidates = make().pointCandidates;
    assert.equal(candidates.length, 33);
    for (const general of candidates) {
      const session = make(); session.start(general.id, { pointGeneral: true });
      const players = session.record!.config.players!;
      assert.equal(players[session.humanSeat].general, general.id);
      assert.equal(new Set(players.map(player => player.general)).size, count);
    }
    const session = make();
    const outside = candidates.find(general => !session.candidates.some(candidate => candidate.id === general.id))!;
    assert.throws(() => session.start(outside.id), /候选/);
    assert.throws(() => session.start('wind.zhangjiao', { pointGeneral: true }), /候选/);
  }
});
