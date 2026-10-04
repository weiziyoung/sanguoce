import { cardText } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { ActionMap, GameState, PromptOf } from '../../domain/state.ts';
import { cardMovement } from '../operations/card-movement-service.ts';
import { deckService } from '../operations/deck-service.ts';

/** A private reveal is held in the owner's hand until every assignment is chosen. */
export class DistributionFlow {
  begin(state: GameState, owner: number, ability: string): void {
    resolutionStack.open(state, 'distribution', { owner, ability, cards: [] }, [{ kind: 'distributionPoll' }]);
  }
  poll(state: GameState): void {
    const frame = resolutionStack.require(state, 'distribution');
    const { owner, ability, cards } = frame.data;
    if (!cards.length) cards.push(...deckService.takeTop(state, 2, { kind: 'hand', owner }));
    if (!cards.length) return;
    const recipients = state.players.filter(player => player.alive);
    setPrompt(state, owner, 'distribution', '分配观看的牌', cards.flatMap(id =>
      recipients.map(player => leaf(`distribute:${ability}:${id}:${player.id}`,
        `${cardText(state.cards[id])} → ${player.label}`, { type: 'assign', card: id, target: player.id }))),
    { ability, owner });
  }
  choice(state: GameState, prompt: PromptOf<'distribution'>, action: ActionMap['distribution']): void {
    const frame = resolutionStack.require(state, 'distribution');
    const { owner, ability, cards } = frame.data;
    if (prompt.actor !== owner || prompt.context.owner !== owner || prompt.context.ability !== ability ||
      !cards.includes(action.card) || !state.players[owner].hand.includes(action.card) ||
      !state.players[action.target]?.alive) throw new Error('分配牌选择已失效');
    cards.splice(cards.indexOf(action.card), 1);
    if (action.target !== owner) {
      cardMovement.move(state, [action.card], { kind: 'hand', owner: action.target }, owner);
      emitEvent(state, 'gained', { from: owner, to: action.target, card: action.card, hidden: true, cause: ability });
    }
    if (cards.length) resolutionStack.enqueue(state, { kind: 'distributionPoll' });
  }
}
