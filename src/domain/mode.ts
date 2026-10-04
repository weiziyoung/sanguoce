import type { GameConfig, GameOutcome, PlayerId } from '../../contracts.ts';
import type { DamageCause, DeepReadonly, ReadonlyGameState } from './state.ts';

/** Serializable mode data; knowledge is per subject and per viewer. */
export interface ModeState {
  id: string;
  roles: Record<PlayerId, string>;
  knownTo: Record<PlayerId, PlayerId[]>;
}
export interface ModeSetup {
  state: ModeState;
  first: PlayerId;
  hpBonus: Record<PlayerId, number>;
}
export type ModeEffect =
  | { kind: 'revealRoles'; players: readonly PlayerId[] }
  | { kind: 'draw'; player: PlayerId; count: number }
  | { kind: 'discardHandAndEquipment'; player: PlayerId };
export type DeathWindow = 'reveal' | 'afterCleanup';
export interface ModeDefinition {
  readonly id: string;
  validateConfig(config: DeepReadonly<GameConfig>): void;
  buildSetup(config: DeepReadonly<GameConfig>, random: () => number): ModeSetup;
  onDeathWindow(state: ReadonlyGameState, context: DeepReadonly<DeathContext>, window: DeathWindow): readonly ModeEffect[];
  evaluateOutcome(state: ReadonlyGameState): GameOutcome;
  onFinish(state: ReadonlyGameState): readonly ModeEffect[];
}
export interface DeathContext {
  frameId: number;
  parentFrameId: number | null;
  target: PlayerId;
  cause: DamageCause;
}
