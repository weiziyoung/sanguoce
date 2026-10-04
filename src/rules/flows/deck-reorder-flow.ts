import { cardText } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { ActionMap, GameState, PromptOf } from '../../domain/state.ts';
import { cardMovement } from '../operations/card-movement-service.ts';
import { deckService } from '../operations/deck-service.ts';

/** Private top-deck inspection, with explicit ordered placement above and below the remaining deck. */
export class DeckReorderFlow {
  begin(state: GameState, owner: number, ability: string, count: number): void {
    const frame = resolutionStack.open(state, 'deckReorder', { owner, ability, cards: [], top: [], bottom: [] },
      [{ kind: 'deckReorderPoll' }]);
    frame.data.cards.push(...deckService.takeTop(state, count, { kind: 'table' }));
  }
  poll(state: GameState): void {
    const frame = resolutionStack.require(state, 'deckReorder');
    const { owner, ability, cards, top, bottom } = frame.data;
    if (!cards.length) {
      const middle = [...state.deck];
      cardMovement.move(state, [...bottom, ...[...top].reverse()], { kind: 'deck' });
      cardMovement.reorderDeck(state, [...bottom, ...middle, ...[...top].reverse()]);
      return;
    }
    setPrompt(state, owner, 'deckReorder', '观星：选择牌和牌堆顶／底的顺序', cards.flatMap(id => [
      leaf(`reorder:${ability}:${id}:top`, `${cardText(state.cards[id])}放牌堆顶`, { type: 'place', card: id, side: 'top' }),
      leaf(`reorder:${ability}:${id}:bottom`, `${cardText(state.cards[id])}放牌堆底`, { type: 'place', card: id, side: 'bottom' }),
    ]), { ability, owner });
  }
  choice(state: GameState, prompt: PromptOf<'deckReorder'>, action: ActionMap['deckReorder']): void {
    const frame = resolutionStack.require(state, 'deckReorder');
    const { owner, ability, cards } = frame.data;
    if (owner !== prompt.actor || owner !== prompt.context.owner || ability !== prompt.context.ability ||
      !cards.includes(action.card) || !state.table.includes(action.card)) throw new Error('观星选择已失效');
    cards.splice(cards.indexOf(action.card), 1);
    frame.data[action.side].push(action.card);
    resolutionStack.enqueue(state, { kind: 'deckReorderPoll' });
  }
}
