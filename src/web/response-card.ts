import type { Card } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';

export interface ResponseCard { player: number; card: Card; }

/** A response is public even when it came from another player's hidden hand. */
export function responseCard(event: VisibleEvent, obs: Observation): ResponseCard | null {
  if (event.kind === 'discarded' && event.data.reason === 'respond') {
    if (event.data.responseMode === 'juedou') return null;
    // A conversion announces its effective card just after its physical costs.
    const converted = obs.events.some(next => next.id > event.id && next.id - event.id <= 4 &&
      next.kind === 'transformationUsed' && next.data.owner === event.data.player);
    return converted ? null : fromCard(event.data.player, event.data.card, obs);
  }
  if (event.kind !== 'transformationUsed') return null;
  if (event.data.responseMode === 'juedou') return null;
  const costs = obs.events.filter(previous => previous.id < event.id && event.id - previous.id <= 4 &&
    previous.kind === 'discarded' && previous.data.player === event.data.owner);
  const last = costs.at(-1);
  if (last?.kind !== 'discarded' || last.data.reason !== 'respond') return null;
  const physical = obs.eventCards?.[last.data.card];
  return physical ? { player: event.data.owner,
    card: { ...physical, name: event.data.produces ?? 'sha', label: undefined } } : null;
}

function fromCard(player: number, id: number, obs: Observation): ResponseCard | null {
  const card = obs.eventCards?.[id];
  return card ? { player, card } : null;
}
