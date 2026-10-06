/** Compatibility entry; rescue is shared by all card packs. */
import type { GameState, ActionMap, PromptOf } from '../../../domain/state.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { getStandardRuntime } from '../runtime.ts';
import { promptDying as prompt, handleDyingChoice as choose } from '../../../rules/flows/dying-flow.ts';
export { beginDying } from '../../../rules/flows/dying-flow.ts';
export const promptDying = (s: GameState, runtime: ContentRuntime = getStandardRuntime()) => prompt(s, runtime);
export const handleDyingChoice = (s: GameState, p: PromptOf<'dying'>, a: ActionMap['dying'],
  runtime: ContentRuntime = getStandardRuntime()) => choose(s, p, a, runtime);
