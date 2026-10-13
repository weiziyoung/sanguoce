import type { Card } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { ActionChoice } from '../presentation/choice-view.ts';
import type { TableInteraction } from './interaction-model.ts';

export interface ZonePick {
  /** For multi-card costs, this is one candidate containing the card, not an immediate submission. */
  choice: ActionChoice;
  zone: 'hand' | 'equip' | 'judge' | 'pile' | 'discard';
  /** Only cards already visible in public zones are exposed. */
  card?: Card;
  /** Public owner, used to explain transfers without inspecting hidden cards. */
  owner?: number;
  /** Public pile identity distinguishes Tian from Buqu and other skill cards. */
  pile?: string;
}

/** Present every legal zone choice together; hidden hands remain card backs. */
export function zonePickerChoices(obs: Observation, model: TableInteraction | null): ZonePick[] {
  if (model && (['guanshi', 'contentChoice', 'judgeReplace', 'skillCost'].includes(model.decision.kind) || model.decision.kind === 'play' && model.focus)) {
    // A cost option contains a pair of IDs, not a zone action. Show each owned
    // equipment card once, but leave its click to normal multi-card selection.
    const costs = model.scoped;
    const publicPicks: { card: Card; zone: ZonePick['zone']; pile?: string }[] = [obs.self, ...obs.others].flatMap(player => [
      ...Object.values(player.equip).filter((c): c is Card => !!c).map(card => ({ card, zone: 'equip' as const })),
      ...(model.decision.kind === 'contentChoice' ? player.judge.map(card => ({ card, zone: 'judge' as const })) : []),
      ...Object.entries(player.piles ?? {}).flatMap(([pile, cards]) => cards.map(card => ({ card, zone: 'pile' as const, pile }))),
    ]);
    if (model.decision.kind === 'contentChoice' && (model.decision.context as { ability?: string }).ability === 'mountain.guzheng') {
      for (const card of Object.values(obs.eventCards ?? {})) if (costs.some(c => c.cardIds.includes(card.id))) publicPicks.push({ card, zone: 'discard' });
    }
    return publicPicks.flatMap<ZonePick>(({ card, zone, pile }) => {
      if (!card) return [];
      const choice = costs.find(choice => choice.cardIds.includes(card.id));
      const owner = model.qiaobianContext?.timing === 'move' ? choice?.targetIds[0] : undefined;
      return choice ? [{ choice, zone, card, ...(owner !== undefined ? { owner } : {}), ...(pile ? { pile } : {}) }] : [];
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
