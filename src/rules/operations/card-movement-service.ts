import type { EquipSlot, GameState } from '../../domain/state.ts';

import type { CardZone } from '../../domain/zones.ts';
import { emitEvent } from '../../domain/event-journal.ts';
export type { CardZone } from '../../domain/zones.ts';

/** Owns every physical-card zone write. Validates an entire move before changing state. */
export class CardMovementService {
  locate(s: GameState, id: number): CardZone {
    if (!s.cards[id]) throw new Error('未知实体牌');
    const zones: CardZone[] = [];
    for (const kind of ['deck', 'discard', 'table'] as const) {
      for (const found of s[kind]) if (found === id) zones.push({ kind });
    }
    for (const p of s.players) {
      for (const kind of ['hand', 'judge'] as const) {
        for (const found of p[kind]) if (found === id) zones.push({ kind, owner: p.id });
      }
      for (const [ability, ids] of Object.entries(p.piles ?? {})) {
        for (const found of ids) if (found === id) zones.push({ kind: 'pile', owner: p.id, ability });
      }
      for (const slot of Object.keys(p.equip) as EquipSlot[]) {
        if (p.equip[slot] === id) zones.push({ kind: 'equip', owner: p.id, slot });
      }
    }
    if (zones.length !== 1) throw new Error('实体牌必须且只能属于一个区域');
    return zones[0];
  }
  move(s: GameState, ids: readonly number[], to: CardZone, expectedOwner?: number): void {
    if (new Set(ids).size !== ids.length) throw new Error('移动费用包含重复实体牌');
    const from = ids.map(id => this.locate(s, id));
    if (expectedOwner !== undefined && from.some(zone => !('owner' in zone) || zone.owner !== expectedOwner)) {
      throw new Error('牌不属于该角色');
    }
    if ('owner' in to && !s.players[to.owner]) throw new Error('区域角色不存在');
    if (to.kind === 'equip' && (ids.length !== 1 || s.players[to.owner].equip[to.slot] !== null)) {
      throw new Error('装备目标槽必须为空且只能放入一张牌');
    }
    const destination = to.kind === 'equip' ? null : this.array(s, to);
    for (let i = 0; i < ids.length; i++) {
      const zone = from[i];
      if (zone.kind === 'judge' && s.virtualJudgeNames) {
        s.virtualJudgeNames = s.virtualJudgeNames.filter(item => item.card !== ids[i]);
      }
      if (zone.kind === 'equip') s.players[zone.owner].equip[zone.slot] = null;
      else {
        const list = this.array(s, zone);
        list.splice(list.indexOf(ids[i]), 1);
      }
      if (to.kind === 'equip') s.players[to.owner].equip[to.slot] = ids[i];
      else destination!.push(ids[i]);
    }
    if (ids.length) emitEvent(s, 'cardsMoved', { moves: ids.map((card, i) => ({ card, from: from[i], to })) });
  }
  reorderDeck(s: GameState, ordered: readonly number[]): void {
    if (ordered.length !== s.deck.length || new Set(ordered).size !== ordered.length ||
      ordered.some(id => !s.deck.includes(id))) throw new Error('洗牌必须保持实体牌集合');
    s.deck = [...ordered];
  }
  private array(s: GameState, zone: Exclude<CardZone, { kind: 'equip' }>): number[] {
    if (zone.kind === 'pile') {
      const p = s.players[zone.owner]; p.piles ??= {}; return p.piles[zone.ability] ??= [];
    }
    return 'owner' in zone ? s.players[zone.owner][zone.kind] : s[zone.kind];
  }
}
export const cardMovement = new CardMovementService();
