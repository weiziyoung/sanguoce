import { emitEvent } from '../../domain/event-journal.ts';
import type { GameState } from '../../domain/state.ts';
import { cardMovement } from './card-movement-service.ts';
import { shuffle } from './random.ts';

/** Only this service decides how an exhausted draw pile is replenished. */
type DrawDestination = { kind: 'table' | 'discard' } | { kind: 'hand'; owner: number };

export class DeckService {
  shuffle(s: GameState): void {
    const order = [...s.deck];
    shuffle(s, order);
    cardMovement.reorderDeck(s, order);
  }
  takeTop(s: GameState, count: number, destination: DrawDestination): number[] {
    if (!Number.isInteger(count) || count < 0) throw new Error('取牌数必须为非负整数');
    if (destination.kind === 'hand' && !s.players[destination.owner]) throw new Error('目标角色不存在');
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      if (!s.deck.length && s.discard.length) {
        cardMovement.move(s, [...s.discard], { kind: 'deck' });
        this.shuffle(s);
        emitEvent(s, 'reshuffled', {});
      }
      const id = s.deck.at(-1);
      if (id === undefined) break;
      cardMovement.move(s, [id], destination);
      result.push(id);
    }
    return result;
  }
}
export const deckService = new DeckService();
