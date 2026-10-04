import type { EventData, EventOf, RuleEvent } from './events.ts';
import type { GameState } from './state.ts';

/** Append facts only. Emitting an event never calls rules or opens a response window. */
export function emitEvent<K extends keyof EventData>(state: GameState, kind: K, data: EventData[K]): number {
  const frame = state.resolution.stack.at(-1);
  const window = [...state.resolution.stack].reverse().find(frame => frame.kind === 'triggerWindow');
  const id = state.events.length + 1;
  const event = { id, frameId: frame?.id ?? null, parentEventId: window?.data.eventId ?? null,
    kind, data: structuredClone(data) } as EventOf<K>;
  state.events.push(event as RuleEvent);
  return id;
}
