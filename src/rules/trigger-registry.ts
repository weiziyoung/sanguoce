import type { EventOf, TriggerKind } from '../domain/events.ts';
import type { DeepReadonly, GameState, ReadonlyGameState } from '../domain/state.ts';
import type { AbilityResolver } from './ability-resolver.ts';
import type { ContentRuntime } from './content-runtime.ts';

export interface TriggerDefinition<K extends TriggerKind = TriggerKind> {
  readonly id: string;
  readonly event: K;
  readonly priority: number;
  /** If set, the owner must currently possess this registered ability. */
  readonly grantedBy?: string;
  readonly optional?: boolean;
  readonly label?: string;
  repeats?(state: ReadonlyGameState, event: DeepReadonly<EventOf<K>>, owner: number): number;
  owners(state: ReadonlyGameState, event: DeepReadonly<EventOf<K>>): readonly number[];
  eligible(state: ReadonlyGameState, event: DeepReadonly<EventOf<K>>, owner: number, abilities?: AbilityResolver, runtime?: ContentRuntime): boolean;
  execute(state: GameState, event: DeepReadonly<EventOf<K>>, owner: number, runtime?: ContentRuntime): void;
}
export type AnyTriggerDefinition = { [K in TriggerKind]: TriggerDefinition<K> }[TriggerKind];
/** Immutable definitions only; pending instances belong to each game's frames. */
export class TriggerRegistry {
  readonly #definitions = new Map<string, AnyTriggerDefinition>();
  constructor(definitions: readonly AnyTriggerDefinition[]) {
    for (const definition of definitions) {
      if (this.#definitions.has(definition.id)) throw new Error(`重复的触发定义：${definition.id}`);
      if (!Number.isFinite(definition.priority)) throw new Error('触发优先级必须为有限数值');
      this.#definitions.set(definition.id, Object.freeze({ ...definition }));
    }
  }
  forEvent(kind: TriggerKind): readonly AnyTriggerDefinition[] {
    return [...this.#definitions.values()].filter(definition => definition.event === kind);
  }
  get(id: string): AnyTriggerDefinition {
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error(`未知触发定义：${id}`);
    return definition;
  }
}
