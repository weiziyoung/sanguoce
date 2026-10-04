import type { GameConfig, GameOutcome } from '../../contracts.ts';
import type { ModeDefinition, ModeSetup } from '../domain/mode.ts';
import type { DeepReadonly, ReadonlyGameState } from '../domain/state.ts';

/** Current simple duel, retaining the N-player last-survivor test harness. */
export class DuelMode implements ModeDefinition {
  readonly id: string = 'duel';
  validateConfig(config: DeepReadonly<GameConfig>): void {
    if (config.roles !== undefined) throw new Error('对决模式不接受身份配置');
  }
  buildSetup(config: DeepReadonly<GameConfig>): ModeSetup {
    return { state: { id: this.id, roles: {}, knownTo: {} }, first: config.first ?? 0, hpBonus: {} };
  }
  onDeathWindow() { return []; }
  onFinish() { return []; }
  evaluateOutcome(state: ReadonlyGameState): GameOutcome {
    const survivors = state.players.filter(p => p.alive);
    if (survivors.length > 1) return { status: 'ongoing' };
    if (!survivors.length) return { status: 'draw', reason: 'no-survivors' };
    return {
      status: 'finished', winners: [survivors[0].id],
      losers: state.players.filter(p => !p.alive).map(p => p.id), reason: 'last-survivor',
    };
  }
}
