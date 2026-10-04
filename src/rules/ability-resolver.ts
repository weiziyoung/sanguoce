import type { EquipSlot, ReadonlyGameState } from '../domain/state.ts';
import { ContentRegistry, type SkillDefinition } from './content-registry.ts';

export interface AbilityInstance {
  readonly definition: SkillDefinition;
  readonly source: { readonly kind: 'general'; readonly id: string } |
    { readonly kind: 'equipment'; readonly slot: EquipSlot; readonly cardId: number };
}
/** Current grants are derived from authoritative equipment and selected general. */
export class AbilityResolver {
  readonly #content: ContentRegistry;
  constructor(content: ContentRegistry) { this.#content = content; }
  instances(state: ReadonlyGameState, playerId: number): readonly AbilityInstance[] {
    const player = state.players[playerId];
    if (!player?.alive) return [];
    const instances: AbilityInstance[] = [];
    if (player.general) for (const id of this.#content.general(player.general).abilities) {
      instances.push({ definition: this.#content.requireSkill(id), source: { kind: 'general', id: player.general } });
    }
    for (const [slot, cardId] of Object.entries(player.equip)) {
      if (cardId === null) continue;
      const card = state.cards[cardId];
      const definition = this.#content.card(card.name);
      if (definition.slot !== slot) throw new Error(`装备槽中的牌不匹配：${card.name}`);
      for (const id of definition.abilities ?? []) instances.push({
        definition: this.#content.requireSkill(id),
        source: { kind: 'equipment', slot: slot as EquipSlot, cardId },
      });
    }
    return instances;
  }
  list(state: ReadonlyGameState, playerId: number): readonly SkillDefinition[] {
    return [...new Map(this.instances(state, playerId).map(instance =>
      [instance.definition.id, instance.definition])).values()];
  }
  has(state: ReadonlyGameState, playerId: number, abilityId: string): boolean {
    return this.list(state, playerId).some(skill => skill.id === abilityId);
  }
  equipped(state: ReadonlyGameState, playerId: number, slot: 'weapon' | 'armor' | 'plusHorse' | 'minusHorse') {
    const cardId = state.players[playerId]?.equip[slot];
    return cardId === null || cardId === undefined ? null : this.#content.card(state.cards[cardId].name);
  }
}
