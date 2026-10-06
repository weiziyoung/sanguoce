import type { DecisionPolicy } from '../../contracts.ts';
import type { GameEngine } from '../core/game-engine.ts';
import type { GameState } from '../domain/state.ts';
import type { WebGameRecord } from './web-game-record.ts';

/** Preserve synchronous rule decisions; asynchronous models commit after the pause gate. */
export function browserComputerStep(game: GameEngine<GameState>, record: WebGameRecord,
  humanSeat: number, policy: DecisionPolicy, beforeCommit?: () => Promise<void>): void | Promise<void> {
  const decision = game.getDecision();
  if (!decision || decision.actor === humanSeat) throw new Error('当前不是电脑决策');
  const selected = policy.choose(game.getObservation(decision.actor), decision);
  const commit = (optionId: string) => {
    game.choose({ decisionId: decision.id!, optionId });
    record.select(decision, optionId);
  };
  if (typeof selected === 'string' && !beforeCommit) return commit(selected);
  return Promise.resolve(selected).then(async optionId => {
    await beforeCommit?.();
    commit(optionId);
  });
}
