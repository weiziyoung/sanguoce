import type { GameOutcome } from '../../contracts.ts';

export function outcomeLabel(outcome: GameOutcome, players: readonly { id: number; label: string }[]): string {
  if (outcome.status === 'ongoing') return '未结束';
  if (outcome.status === 'draw') return '平局';
  return outcome.winners.map(id => players.find(p => p.id === id)?.label ?? `角色${id}`).join('、') + '获胜';
}
