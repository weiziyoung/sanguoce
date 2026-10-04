import type { TransitionSink } from '../../contracts.ts';
import { copy } from '../domain/state-access.ts';
import { resolutionStack } from '../domain/resolution-stack.ts';
import type { GameState, Task, TaskData, TaskOf } from '../domain/state.ts';

export type TaskHandlers = { readonly [K in keyof TaskData]: (s: GameState, task: TaskOf<K>) => void };
export class ResolutionScheduler {
  readonly handlers: TaskHandlers;
  readonly afterStep: (state: GameState, beforeEventCount: number) => void;
  constructor(handlers: TaskHandlers, afterStep: (state: GameState, beforeEventCount: number) => void = () => {}) {
    this.handlers = Object.freeze({ ...handlers });
    this.afterStep = afterStep;
  }
  advance(s: GameState, trace?: TransitionSink<GameState>): void {
    let remaining = 10000;
    while (s.outcome.status === 'ongoing') {
      const frame = resolutionStack.current(s);
      if (!frame || frame.prompt) return;
      if (--remaining <= 0) throw new Error('结算队列超过安全步数');
      if (!frame.tasks.length) {
        if (frame.kind === 'root') return;
        const completed = resolutionStack.complete(s);
        trace?.({ type: 'frameEnd', frameId: completed.id, parentFrameId: completed.parentId! }, copy(s));
        continue;
      }
      const task = frame.tasks.pop()!;
      const handler = this.handlers[task.kind];
      if (!handler) throw new Error('未知结算任务：' + task.kind);
      // Dispatch preserves the key/payload relation enforced by TaskHandlers.
      const beforeEventCount = s.events.length;
      (handler as (state: GameState, task: Task) => void)(s, task);
      this.afterStep(s, beforeEventCount);
      trace?.(copy({ type: 'task' as const, frameId: frame.id, parentFrameId: frame.parentId, task }), copy(s));
    }
  }
}
