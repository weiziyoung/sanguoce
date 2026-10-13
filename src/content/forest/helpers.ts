import { cardText } from '../../../catalog.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { ContentChoiceContext, GameState, ReadonlyGameState } from '../../domain/state.ts';
import { discardOwned } from '../../rules/operations/cards.ts';
import { cardMovement } from '../../rules/operations/card-movement-service.ts';
import { vitals } from '../../rules/operations/vitals-service.ts';
import { beginDying } from '../../rules/flows/dying-flow.ts';

export const owned = (s: ReadonlyGameState, owner: number) => [...s.players[owner].hand,
  ...Object.values(s.players[owner].equip).filter((id): id is number => id !== null)];
export function give(s: GameState, from: number, to: number, ids: readonly number[], ability: string) {
  const hand = new Set(s.players[from].hand);
  cardMovement.move(s, ids, { kind: 'hand', owner: to }, from);
  for (const card of ids) emitEvent(s, 'gained', { from, to, card, hidden: hand.has(card), cause: ability });
}
export function loseLife(s: GameState, owner: number) {
  vitals.loseHp(s, owner, 1);
  emitEvent(s, 'hpLost', { player: owner, amount: 1 });
  if (s.players[owner].hp <= 0) beginDying(s, owner);
}
export function discardOptions(s: ReadonlyGameState, target: number) {
  return owned(s, target).map(id => ({ id: `discard:${id}`, ids: [id], label: `弃置${cardText(s.cards[id])}` }));
}
export function discardStep(s: GameState, context: ContentChoiceContext, id: number) {
  discardOwned(s, context.target!, id);
  context.amount = Math.max(0, (context.amount ?? 1) - 1);
  if (context.amount && owned(s, context.target!).length) resolutionStack.enqueue(s, { kind: 'contentChoiceOffer' });
}
