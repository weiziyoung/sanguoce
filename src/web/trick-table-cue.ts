import { TRICKS, type Card, type CardName } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';

export type TrickTableCue =
  | { kind: 'start' | 'append'; player: number; card: Card; cname: CardName; targets: number[]; parityBefore?: number }
  | { kind: 'end' }
  | { kind: 'clear' };

/** Classify only public play facts; the current prompt may belong to a later frame. */
export function trickTableCue(event: VisibleEvent, obs: Observation): TrickTableCue | null {
  if (event.kind === 'duelEnded' ||
    (event.kind === 'trickCancelled' && event.data.cname === 'juedou')) return { kind: 'end' };
  if (event.kind === 'cardUsed') {
    const card = obs.eventCards?.[event.data.card];
    const cname = event.data.effectiveName ?? card?.name;
    if (!card || !cname || !TRICKS.has(cname) || cname === 'wuxie') return { kind: 'clear' };
    return { kind: 'start', player: event.data.source, cname, targets: event.data.targets,
      card: { ...card, name: cname, label: undefined } };
  }
  if (event.kind === 'nullificationUsed') {
    const card = obs.eventCards?.[event.data.card];
    return card ? { kind: 'append', player: event.data.player,
      card: card.name === 'wuxie' ? card : { ...card, name: 'wuxie', nature: undefined, label: undefined }, cname: event.data.cname,
      targets: [event.data.target], parityBefore: event.data.parityBefore } : null;
  }
  if (event.kind === 'turnStarted' || event.kind === 'equipped' || event.kind === 'delayPlaced')
    return { kind: 'clear' };
  return null;
}
