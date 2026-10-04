import type { ModeDefinition } from '../domain/mode.ts';

/** Assembly injects definitions; rules resolve a serializable mode ID. */
export class ModeRegistry {
  readonly #definitions = new Map<string, ModeDefinition>();
  constructor(definitions: readonly ModeDefinition[]) {
    for (const definition of definitions) {
      if (this.#definitions.has(definition.id)) throw new Error(`重复的模式：${definition.id}`);
      this.#definitions.set(definition.id, definition);
    }
  }
  get(id: string): ModeDefinition {
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error(`未知模式：${id}`);
    return definition;
  }
}
