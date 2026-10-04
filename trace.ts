import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { GameConfig, Transition } from "./contracts.ts";
import { debugLog } from "./src/presentation/event-formatter.ts";
import type { GameState } from "./src/domain/state.ts";
import { NAMES } from "./catalog.ts";

function localized(value: unknown): unknown {
  if (typeof value === "string") return (NAMES as Record<string, string>)[value] ?? value;
  if (Array.isArray(value)) return value.map(localized);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localized(item)]));
  }
  return value;
}

export interface TraceFrame<State> {
  index: number;
  transition: Transition;
  state: State;
  newEvents: string[];
}

/** 调试用完整内部轨迹；与提供给玩家或模型的脱敏观察值分开。 */
function events<State>(state: State, after: State | null): string[] {
  if (state && typeof state === 'object' && 'events' in state && 'players' in state && 'cards' in state) {
    const previousCount = after && typeof after === 'object' && 'events' in after && Array.isArray(after.events) ? after.events.length : 0;
    const snapshot = state as unknown as GameState;
    return debugLog({ ...snapshot, events: snapshot.events.slice(previousCount) });
  }
  return [];
}

export class GameTrace<State> {
  readonly frames: TraceFrame<State>[] = [];
  readonly config: GameConfig;
  readonly policies: Record<string, string>;

  constructor(config: GameConfig, policies: Record<string, string> = {}) {
    this.config = structuredClone(config);
    this.policies = structuredClone(policies);
  }

  record(transition: Transition, state: State): void {
    const previous = this.frames.at(-1)?.state ?? null;
    this.frames.push({
      index: this.frames.length,
      transition: structuredClone(transition),
      state: structuredClone(state),
      newEvents: events(state, previous),
    });
  }

  document() {
    const frames = this.frames.map(frame => localized(frame)) as TraceFrame<unknown>[];
    const finalState = frames.at(-1)?.state ?? null;
    const complete = finalState !== null && typeof finalState === "object" &&
      "outcome" in finalState && finalState.outcome !== null &&
      typeof finalState.outcome === 'object' && 'status' in finalState.outcome &&
      ['finished', 'draw'].includes(String(finalState.outcome.status));
    return {
      format: "sanguosha-cli.full-trace.v4",
      config: localized(this.config),
      policies: this.policies,
      complete,
      frames,
      finalState,
    };
  }

  write(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.document(), null, 2) + "\n", "utf8");
  }
}
