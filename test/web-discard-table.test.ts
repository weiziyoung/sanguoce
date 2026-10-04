import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { discardTableCard } from '../src/web/discard-table-card.ts';
import { discardTablePosition, PLAY_AREA } from '../src/web/layout.ts';
import type { VisibleEvent } from '../src/domain/events.ts';

for (const actor of [0, 1]) test(`${actor === 0 ? '己方' : '电脑'}连续弃牌均公开展示，即使观察已进入下一回合`, () => {
  const f = fixture();
  const cards = Array.from({ length: 6 }, () => f.hand(actor, 'sha'));
  let state = f.start(actor);
  const end = legalActions(state).find(choice => choice.data?.type === 'endPlay');
  assert.ok(end);
  state = apply(state, end.id);
  for (const card of cards.slice(0, 2)) {
    const action = legalActions(state).find(choice => choice.data?.type === 'discard' && choice.data.cid === card);
    assert.ok(action);
    state = apply(state, action.id);
  }
  const view = observe(state, 0);
  assert.notEqual(view.active, actor);
  const shown = view.events.map(event => discardTableCard(event, view)).filter(item => item !== null);
  assert.deepEqual(shown.map(item => [item.player, item.card.id, item.card.name]),
    cards.slice(0, 2).map(id => [actor, id, 'sha']));
  assert.ok(cards.slice(0, 2).every(id => state.discard.includes(id)));
});

test('弃牌展示不重复普通响应、转化费用或过拆选牌动画，也不猜测隐藏牌', () => {
  const f = fixture();
  const card = f.hand(0, 'sha');
  const view = observe(f.start(), 0);
  view.eventCards = { [card]: f.state.cards[card] };
  const make = (reason: 'discard' | 'respond' | 'use' | 'convertToSha'): VisibleEvent =>
    ({ id: 1, kind: 'discarded', data: { player: 0, card, reason } });
  for (const reason of ['respond', 'use', 'convertToSha'] as const)
    assert.equal(discardTableCard(make(reason), view), null);
  const zone: VisibleEvent = { id: 2, kind: 'discarded', data: { player: 1, card,
    reason: 'discard', selection: { cause: 'guohe', fromZone: 'hand' } } };
  assert.equal(discardTableCard(zone, view), null);
  assert.equal(discardTableCard(make('discard'), { ...view, eventCards: {} }), null);
});

test('多张弃牌居中铺开，大批弃牌仍留在桌面区域内', () => {
  for (const count of [1, 2, 6, 12, 30]) {
    const positions = Array.from({ length: count }, (_, index) => discardTablePosition(index, count));
    assert.equal((positions[0].x + positions.at(-1)!.x) / 2, PLAY_AREA.x);
    assert.ok(positions[0].x - 50 >= PLAY_AREA.x - PLAY_AREA.width / 2);
    assert.ok(positions.at(-1)!.x + 50 <= PLAY_AREA.x + PLAY_AREA.width / 2);
    assert.ok(positions.every((position, index) => index === 0 || position.x > positions[index - 1].x));
  }
});
