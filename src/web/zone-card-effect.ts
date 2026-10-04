import type { Card } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent, ZoneSelection } from '../domain/events.ts';

interface ZoneCardEffectBase {
  from: number;
  cardId: number | null;
  card?: Card;
  selection: ZoneSelection;
}
export type ZoneCardEffect =
  | (ZoneCardEffectBase & { kind: 'discard' })
  | (ZoneCardEffectBase & { kind: 'gain'; to: number });

/** A resolved zone choice carries its cause and origin without inspecting hidden hands. */
export function zoneCardEffect(event: VisibleEvent, obs: Observation): ZoneCardEffect | null {
  if (event.kind === 'discarded' && event.data.selection) return {
    kind: 'discard', from: event.data.player, cardId: event.data.card,
    card: obs.eventCards?.[event.data.card], selection: event.data.selection,
  };
  if (event.kind === 'gained' && event.data.selection) return {
    kind: 'gain', from: event.data.from, to: event.data.to, cardId: event.data.card,
    card: event.data.card === null ? undefined : obs.eventCards?.[event.data.card],
    selection: event.data.selection,
  };
  return null;
}
