/** Compatibility entry; damage and chain propagation are shared mechanisms. */
import type { GameState } from '../../../domain/state.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { getStandardRuntime } from '../runtime.ts';
import { handleDamageApplyTask as apply } from '../../../rules/flows/damage-flow.ts';
export { damage } from '../../../rules/flows/damage-flow.ts';
export const handleDamageApplyTask = (s: GameState, runtime: ContentRuntime = getStandardRuntime()) => apply(s, runtime);
