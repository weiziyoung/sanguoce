import { cardColor, type CardLike, type CardName } from '../../catalog.ts';
import type { ReadonlyGameState } from '../domain/state.ts';
import type { AbilityResolver } from './ability-resolver.ts';

export interface CardTransformation {
  readonly id: string;
  readonly produces: CardName;
  readonly grantedBy?: string;
  readonly allowedZones?: readonly ('hand' | 'equip')[];
  costs(s: ReadonlyGameState, actor: number): readonly (readonly number[])[];
}
export interface CardCandidate { ids: number[]; virtual: boolean; effective: CardLike; transformation?: string; }

/** Resolves physical and transformed cards without spending costs or changing state. */
export class CardTransformResolver {
  readonly #transformations: readonly CardTransformation[];
  readonly #abilities: AbilityResolver | null;
  constructor(transformations: readonly CardTransformation[] = [], abilities: AbilityResolver | null = null) {
    const ids = transformations.map(t => t.id);
    if (new Set(ids).size !== ids.length) throw new Error('重复的转化能力标识');
    this.#transformations = transformations.map(t => Object.freeze({ ...t }));
    this.#abilities = abilities;
  }
  candidates(s: ReadonlyGameState, actor: number, need: CardName): CardCandidate[] {
    const hand = s.players[actor].hand;
    const direct: CardCandidate[] = hand.filter(id => s.cards[id].name === need)
      .map(id => ({ ids: [id], virtual: false, effective: structuredClone(s.cards[id]) }));
    for (const transformation of this.#transformations) {
      if (transformation.produces !== need) continue;
      if (transformation.grantedBy && !this.#abilities?.has(s, actor, transformation.grantedBy)) continue;
      const allowed = [...hand, ...(transformation.allowedZones?.includes('equip') ?
        Object.values(s.players[actor].equip).filter((id): id is number => id !== null) : [])];
      for (const cost of transformation.costs(s, actor)) {
        if (new Set(cost).size !== cost.length || cost.some(id => !allowed.includes(id))) {
          throw new Error('转化成本必须是互不重复的当前己方牌');
        }
        direct.push({
          ids: [...cost], virtual: true, transformation: transformation.id,
          effective: this.virtualCard(s, cost, need)
        });
      }
    }
    return direct;
  }
  virtualCard(s: ReadonlyGameState, ids: readonly number[], name: CardName): CardLike {
    return { name, suit: null, color: this.color(s, ids), virtual: true };
  }
  color(s: ReadonlyGameState, ids: readonly number[]): 'red' | 'black' | 'none' {
    const colors = ids.map(id => cardColor(s.cards[id]));
    return colors.every(color => color === colors[0]) ? colors[0] ?? 'none' : 'none';
  }
}
