import type { GameState, ReadonlyGameState } from '../../domain/state.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { vitals } from '../../rules/operations/vitals-service.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import { cardMovement } from '../../rules/operations/card-movement-service.ts';
export const awakened = (s: ReadonlyGameState, owner: number, id: string) => !!s.players[owner].skillFlags?.[`${id}.awakened`];
export function grant(s: GameState, owner: number, abilities: string[]) {
  const p = s.players[owner]; p.gainedAbilities = [...new Set([...(p.gainedAbilities ?? []), ...abilities])];
  emitEvent(s, 'skillsChanged', { player: owner, gained: abilities, disabled: false });
}
export function awaken(s: GameState, owner: number, id: string) {
  const p = s.players[owner]; p.skillFlags ??= {}; p.skillFlags[`${id}.awakened`] = true;
  vitals.loseMaxHp(s, owner, 1); emitEvent(s, 'awakened', { player: owner, ability: id });
}
export function reoffer(s: GameState) { resolutionStack.enqueue(s, { kind: 'contentChoiceOffer' }); }
export function gainPublic(s: GameState, owner: number, ids: readonly number[], cause: string) {
  const cards = ids.filter(id => s.discard.includes(id));
  cardMovement.move(s, cards, { kind: 'hand', owner });
  for (const card of cards) emitEvent(s, 'gained', { from: owner, to: owner, card, hidden: false, cause });
}
