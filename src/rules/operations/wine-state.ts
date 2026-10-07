import type { GameState } from '../../domain/state.ts';
import { emitEvent } from '../../domain/event-journal.ts';

/** Move the pending boost into one attack use, or expire it without affecting damage. */
export function clearWine(s: GameState, player: number, reason: 'attack' | 'turnEnd' | 'death'): number {
  const bonus = s.players[player].drunk ?? 0;
  delete s.players[player].drunk;
  if (bonus > 0) emitEvent(s, 'wineCleared', { player, reason });
  return bonus;
}
