import type { Card } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { ActionChoice } from '../presentation/choice-view.ts';
import type { TableInteraction } from './interaction-model.ts';

export interface ZonePick {
  /** For multi-card costs, this is one candidate containing the card, not an immediate submission. */
  choice: ActionChoice;
  zone: 'hand' | 'equip' | 'judge';
  /** Only cards already visible in public zones are exposed. */
  card?: Card;
}

/** Present every legal zone choice together; hidden hands remain card backs. */
export function zonePickerChoices(obs: Observation, model: TableInteraction | null): ZonePick[] {
  if (model && (['guanshi', 'contentChoice', 'judgeReplace'].includes(model.decision.kind) || model.decision.kind === 'play' && model.focus)) {
    // A cost option contains a pair of IDs, not a zone action. Show each owned
    // equipment card once, but leave its click to normal multi-card selection.
    const costs = model.scoped;
    return Object.values(obs.self.equip).flatMap<ZonePick>(card => {
      if (!card) return [];
      const choice = costs.find(choice => choice.cardIds.includes(card.id));
      return choice ? [{ choice, zone: 'equip', card }] : [];
    });
  }
  const context = model?.decision.context as { target?: number } | undefined;
  const target = [obs.self, ...obs.others].find(player => player.id === context?.target);
  if (!target) return [];
  const publicCards = [...Object.values(target.equip).filter((card): card is Card => Boolean(card)),
    ...target.judge];
  return (model?.leaves ?? []).flatMap<ZonePick>(choice => {
    if (choice.zone === 'hand' && typeof choice.slot === 'number')
      return [{ choice, zone: 'hand' as const }];
    if (choice.zone !== 'equip' && choice.zone !== 'judge') return [];
    const card = publicCards.find(card => choice.cardIds.includes(card.id));
    return card ? [{ choice, zone: choice.zone, card }] : [];
  });
}
