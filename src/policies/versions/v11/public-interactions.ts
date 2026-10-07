import type { VisibleEvent } from '../../../domain/events.ts';
import { nullificationProtectsTarget } from './action-intent.ts';

/** Public facts accumulated by source and target, without inferred roles or private cards. */
export interface PublicInteraction {
  source: number;
  target: number;
  damage: number;
  attacks: number;
  attackHits: number;
  recovery: number;
  gifts: number;
  disruption: number;
  protection: number;
}

export const PUBLIC_INTERACTION_KINDS: ReadonlySet<string> = new Set([
  'damaged', 'attackDeclared', 'recovered', 'gained', 'cardUsed', 'delayPlaced', 'nullificationUsed',
]);

/** Bounded by seat pairs even when the public event history becomes long. */
export function publicInteractions(events: Iterable<VisibleEvent>, cardName: (id: number) => string | undefined = () => undefined): PublicInteraction[] {
  const pairs = new Map<string, PublicInteraction>();
  const add = (source: number | null | undefined, target: number,
    field: keyof Omit<PublicInteraction, 'source' | 'target'>, amount: number) => {
    if (source === null || source === undefined || source === target || !amount) return;
    const key = `${source}:${target}`;
    let pair = pairs.get(key);
    if (!pair) {
      pair = { source, target, damage: 0, attacks: 0, attackHits: 0, recovery: 0, gifts: 0, disruption: 0, protection: 0 };
      pairs.set(key, pair);
    }
    pair[field] += amount;
  };
  for (const event of events) {
    switch (event.kind) {
      case 'damaged':
        // Forced, redirected, and propagated hits do not establish the original source's intent.
        if (event.data.forcedBy === undefined && event.data.redirectedBy === undefined && !event.data.propagated) {
          add(event.data.source, event.data.target, 'damage', event.data.amount);
          const name = typeof event.data.card === 'number' ? cardName(event.data.card) : event.data.card?.name;
          const pair = pairs.get(`${event.data.source}:${event.data.target}`);
          if (name === 'sha' && pair && pair.attacks > pair.attackHits)
            add(event.data.source, event.data.target, 'attackHits', 1);
        }
        break;
      case 'attackDeclared':
        if (event.data.forcedBy === undefined && event.data.redirectedBy === undefined)
          add(event.data.source, event.data.target, 'attacks', 1);
        break;
      case 'recovered': add(event.data.source, event.data.player, 'recovery', event.data.amount); break;
      case 'gained':
        if (event.data.cause === 'standard.rende' || event.data.cause === 'standard.yiji')
          add(event.data.from, event.data.to, 'gifts', 1);
        break;
      case 'cardUsed':
        if (['guohe', 'shunshou', 'jiedao'].includes(event.data.effectiveName ?? cardName(event.data.card) ?? ''))
          for (const target of event.data.targets) add(event.data.source, target, 'disruption', 1);
        break;
      case 'delayPlaced':
        if (['lebu', 'bingliang'].includes(event.data.effectiveName ?? cardName(event.data.card) ?? ''))
          add(event.data.source, event.data.target, 'disruption', 1);
        break;
      case 'nullificationUsed': {
        const protects = nullificationProtectsTarget(event.data.cname, event.data.parityBefore);
        if (protects !== null) add(event.data.player, event.data.target, 'protection', protects ? 1 : -1);
        break;
      }
    }
  }
  return [...pairs.values()].sort((a, b) => a.source - b.source || a.target - b.target);
}
