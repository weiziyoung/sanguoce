import type { ReadonlyGameState, GameState } from '../../domain/state.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import { vitals } from '../../rules/operations/vitals-service.ts';
import { beginDying } from '../../rules/flows/dying-flow.ts';
export const owned = (s: ReadonlyGameState, owner: number) => [...s.players[owner].hand, ...Object.values(s.players[owner].equip).filter((id): id is number => id !== null)];
export const pass = { id: 'pass', label: '不发动', pass: true };
export function flip(s: GameState, owner: number) { const p = s.players[owner]; p.faceDown = !p.faceDown; emitEvent(s, 'turnedOver', { player: owner, faceDown: p.faceDown }); }
export function loseHp(s: GameState, owner: number, amount = 1) { vitals.loseHp(s, owner, amount); emitEvent(s, 'hpLost', { player: owner, amount }); if (s.players[owner].hp <= 0) beginDying(s, owner); }
export function reoffer(s: GameState) { resolutionStack.enqueue(s, { kind: 'contentChoiceOffer' }); }
export function gain(s: GameState, owner: number, ids: number[], cause: string) {
  for (const card of ids) emitEvent(s, 'gained', { from: owner, to: owner, card, hidden: false, cause });
}
