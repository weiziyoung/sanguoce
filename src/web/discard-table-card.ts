import type { Card } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';

/** Ordinary discards are public; zone-targeted discards have their own animation. */
export function discardTableCard(event: VisibleEvent, obs: Observation): { player: number; card: Card } | null {
  if (event.kind !== 'discarded' || event.data.reason !== 'discard' || event.data.selection) return null;
  const card = obs.eventCards?.[event.data.card];
  return card ? { player: event.data.player, card } : null;
}
