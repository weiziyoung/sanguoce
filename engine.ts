import { contentForCards } from './src/app/game-content.ts';
/** Compatibility exports. Application assembly lives outside the generic engine. */
import { GameEngine as Engine, type TraceRecorder } from './src/core/game-engine.ts';
import { StandardRuleset } from './src/app/standard-game.ts';
import type { GameState } from './src/domain/state.ts';
import type { GameConfig } from './contracts.ts';
export { StandardRuleset, createGame, preparePlayScenario } from './src/app/standard-game.ts';
export { apply } from './src/app/standard-resolution.ts';
export { decision, legalActions } from './src/core/decision-manager.ts';
export { observe } from './src/core/observation-projector.ts';
export type { GameState } from './src/domain/state.ts';
export class GameEngine<State> extends Engine<State> {
  static junzheng(config: GameConfig = {}, trace: TraceRecorder<GameState> | null = null): GameEngine<GameState> {
    return GameEngine.standard({ ...config, cards: 'junzheng' }, trace);
  }
  static standard(config: GameConfig = {}, trace: TraceRecorder<GameState> | null = null): GameEngine<GameState> {
    return new GameEngine(new StandardRuleset(undefined, undefined, contentForCards(config.cards)), config, trace);
  }
}
