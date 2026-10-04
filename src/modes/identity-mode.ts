import type { GameConfig, GameOutcome } from '../../contracts.ts';
import type { DeathContext, DeathWindow, ModeDefinition, ModeEffect, ModeSetup } from '../domain/mode.ts';
import type { DeepReadonly, ReadonlyGameState } from '../domain/state.ts';

export type IdentityRole = 'lord' | 'loyalist' | 'rebel' | 'renegade';
const DISTRIBUTIONS: Readonly<Record<number, readonly IdentityRole[]>> = {
  5: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'],
  8: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'renegade'],
};

/** Ordinary identity rules. Player count selects setup data, never a new engine. */
export class IdentityMode implements ModeDefinition {
  readonly id = 'identity';
  validateConfig(config: DeepReadonly<GameConfig>): void {
    const expected = DISTRIBUTIONS[config.players?.length ?? 0];
    if (!expected) throw new Error('普通身份模式目前支持 5 人或 8 人');
    if (config.roles && [...config.roles].sort().join(',') !== [...expected].sort().join(',')) {
      throw new Error('身份数量与人数配置不匹配');
    }
    if (config.roles && config.first !== undefined && config.roles[config.first] !== 'lord') {
      throw new Error('身份模式由主公先行动，first 必须对应主公');
    }
  }
  buildSetup(config: DeepReadonly<GameConfig>, random: () => number): ModeSetup {
    const roles: string[] = [...(config.roles ?? DISTRIBUTIONS[config.players!.length])];
    if (!config.roles) {
      for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
      }
      // Ordinary five-player games always put the lord in seat one. Explicit first is
      // retained for fixed scenarios; eight-player setup keeps its existing behavior.
      const lordSeat = config.first ?? (roles.length === 5 ? 0 : undefined);
      if (lordSeat !== undefined) {
        const lord = roles.indexOf('lord');
        [roles[lord], roles[lordSeat]] = [roles[lordSeat], roles[lord]];
      }
    }
    const first = roles.indexOf('lord');
    const ids = roles.map((_, id) => id);
    return {
      state: { id: this.id, roles: Object.fromEntries(roles.map((role, id) => [id, role])),
        knownTo: Object.fromEntries(ids.map(id => [id, id === first ? [...ids] : [id]])) },
      first, hpBonus: { [first]: 1 },
    };
  }
  onDeathWindow(state: ReadonlyGameState, context: DeepReadonly<DeathContext>, window: DeathWindow): readonly ModeEffect[] {
    if (window === 'reveal') return [{ kind: 'revealRoles', players: [context.target] }];
    const source = context.cause.source;
    if (source === null || !state.players.some(p => p.id === source && p.alive)) return [];
    const victimRole = state.mode.roles[context.target];
    if (victimRole === 'rebel') return [{ kind: 'draw', player: source, count: 3 }];
    if (victimRole === 'loyalist' && state.mode.roles[source] === 'lord') {
      return [{ kind: 'discardHandAndEquipment', player: source }];
    }
    return [];
  }
  evaluateOutcome(state: ReadonlyGameState): GameOutcome {
    const living = state.players.filter(p => p.alive);
    if (!living.length) return { status: 'draw', reason: 'no-survivors' };
    const role = (id: number) => state.mode.roles[id];
    const lordAlive = living.some(p => role(p.id) === 'lord');
    let winningRoles: readonly string[];
    let reason: string;
    if (!lordAlive) {
      const soleRenegade = living.length === 1 && role(living[0].id) === 'renegade';
      winningRoles = soleRenegade ? ['renegade'] : ['rebel'];
      reason = soleRenegade ? 'renegade-last-survivor' : 'lord-dead';
    } else {
      if (living.some(p => ['rebel', 'renegade'].includes(role(p.id)))) return { status: 'ongoing' };
      winningRoles = ['lord', 'loyalist'];
      reason = 'opposition-eliminated';
    }
    // Team members may win after dying; alive is not equivalent to victorious.
    return { status: 'finished', reason,
      winners: state.players.filter(p => winningRoles.includes(role(p.id))).map(p => p.id),
      losers: state.players.filter(p => !winningRoles.includes(role(p.id))).map(p => p.id) };
  }
  onFinish(state: ReadonlyGameState): readonly ModeEffect[] {
    return [{ kind: 'revealRoles', players: state.players.map(p => p.id) }];
  }
}
