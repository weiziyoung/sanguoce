import { emitEvent } from '../../domain/event-journal.ts';
import type { DiscardReason, ZoneSelection } from '../../domain/events.ts';
import { equipSlot } from '../../../catalog.ts';
import { name, person } from '../../domain/state-access.ts';
import type { GameState } from '../../domain/state.ts';
import { cardMovement } from './card-movement-service.ts';
import type { ContentRegistry } from '../content-registry.ts';
import { deckService } from './deck-service.ts';
import { random } from './random.ts';

export function draw(s: GameState, id: number, count: number): void {
  const actual = deckService.takeTop(s, count, { kind: 'hand', owner: id }).length;
  if (actual) emitEvent(s, 'drawn', { player: id, count: actual });
}
/** Removes a reference from effect-local lists, never a physical zone. */
export function removeOne(list: number[], id: number): void {
  const index = list.indexOf(id);
  if (index < 0) throw new Error('牌不在指定区域');
  list.splice(index, 1);
}
export function discardOwned(s: GameState, owner: number, id: number, reason: DiscardReason = 'discard',
  selection?: ZoneSelection, responseMode?: 'juedou'): void {
  cardMovement.move(s, [id], { kind: 'discard' }, owner);
  emitEvent(s, 'discarded', { player: owner, reason, card: id,
    ...(selection ? { selection } : {}), ...(responseMode ? { responseMode } : {}) });
}
export function takeOwned(s: GameState, from: number, to: number, id: number,
  selection?: ZoneSelection): void {
  const hidden = cardMovement.locate(s, id).kind === 'hand';
  cardMovement.move(s, [id], { kind: 'hand', owner: to }, from);
  emitEvent(s, 'gained', { from, to, card: id, hidden, ...(selection ? { selection } : {}) });
}
export function takeRandomHand(s: GameState, from: number, to: number, mode: 'gain' | 'discard'): void {
  const hand = person(s, from).hand;
  if (!hand.length) throw new Error('目标没有手牌');
  const id = hand[Math.floor(random(s) * hand.length)];
  if (mode === 'gain') takeOwned(s, from, to, id);
  else discardOwned(s, from, id);
}
/** Resolve a publicly selected card-back position without exposing its card id in the choice. */
export function takeHandAt(s: GameState, from: number, to: number, mode: 'gain' | 'discard', slot: number,
  selection?: ZoneSelection): void {
  const hand = person(s, from).hand;
  if (!Number.isInteger(slot) || slot < 0 || slot >= hand.length) throw new Error('所选手牌位置已失效');
  const id = hand[slot];
  if (mode === 'gain') takeOwned(s, from, to, id, selection);
  else discardOwned(s, from, id, 'discard', selection);
}
export function equip(s: GameState, owner: number, cid: number, content?: ContentRegistry): void {
  const p = person(s, owner);
  if (!p.hand.includes(cid)) throw new Error('装备牌不在手牌中');
  const slot = content ? content.card(name(s, cid)).slot : equipSlot(name(s, cid));
  if (!slot) throw new Error('不是装备牌');
  const old = p.equip[slot];
  if (old !== null) {
    cardMovement.move(s, [old], { kind: 'discard' }, owner);
    emitEvent(s, 'equipped', { player: owner, card: old, replaced: true });
  }
  cardMovement.move(s, [cid], { kind: 'equip', owner, slot }, owner);
  emitEvent(s, 'equipped', { player: owner, card: cid, replaced: false });
}
