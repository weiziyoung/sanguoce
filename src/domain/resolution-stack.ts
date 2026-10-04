import type { FrameData, FrameKind, FrameOf, ResolutionFrame, ResolutionState } from './resolution.ts';
import type { GameState, Task } from './state.ts';

/** Owns frame structure only. Content owns local rule data and queues typed resume steps. */
export class ResolutionStack {
  initial(): ResolutionState {
    return { nextId: 1, stack: [{ id: 0, parentId: null, kind: 'root', data: {}, tasks: [], prompt: null }] };
  }
  current(state: GameState): ResolutionFrame | undefined { return state.resolution.stack.at(-1); }
  active(state: GameState): ResolutionFrame {
    const frame = this.current(state);
    if (!frame) throw new Error('没有可执行的结算帧');
    return frame;
  }
  get<K extends FrameKind>(state: GameState, id: number, kind: K): FrameOf<K> {
    const frame = state.resolution.stack.find(frame => frame.id === id);
    if (!frame || frame.kind !== kind) throw new Error(`结算帧不存在或类型不匹配：${id}/${kind}`);
    return frame as FrameOf<K>;
  }
  require<K extends FrameKind>(state: GameState, kind: K): FrameOf<K> {
    const frame = this.active(state);
    return this.get(state, frame.id, kind);
  }
  nearest<K extends FrameKind>(state: GameState, kind: K): FrameOf<K> {
    const frame = [...state.resolution.stack].reverse().find(frame => frame.kind === kind);
    if (!frame) throw new Error(`缺少父结算帧：${kind}`);
    return frame as FrameOf<K>;
  }
  open<K extends Exclude<FrameKind, 'root'>>(state: GameState, kind: K, data: FrameData[K], tasks: Task[] = []): FrameOf<K> {
    const parent = this.active(state);
    // Consume the parent's choice first. A stale prompt must never be restored after a child changes the board.
    if (parent.prompt) throw new Error('必须先提交当前选择，再启动子流程');
    if (state.outcome.status !== 'ongoing') throw new Error('对局已结束');
    if (state.resolution.stack.length >= 128) throw new Error('结算帧嵌套超过安全深度');
    const frame = { id: state.resolution.nextId++, parentId: parent.id, kind,
      data: structuredClone(data), tasks: structuredClone(tasks).reverse(), prompt: null } as FrameOf<K>;
    state.resolution.stack.push(frame as ResolutionFrame);
    return frame;
  }
  enqueue(state: GameState, ...tasks: Task[]): number {
    return this.active(state).tasks.push(...tasks.reverse());
  }
  enqueueParent(state: GameState, ...tasks: Task[]): number {
    const current = this.active(state);
    const parent = state.resolution.stack.at(-2);
    if (!parent || parent.id !== current.parentId || parent.prompt) throw new Error('不能恢复父结算帧');
    return parent.tasks.push(...tasks.reverse());
  }
  complete(state: GameState): ResolutionFrame {
    const frame = this.active(state);
    if (frame.kind === 'root' || frame.tasks.length || frame.prompt) throw new Error('结算帧尚不能结束');
    const parent = state.resolution.stack.at(-2);
    if (!parent || parent.id !== frame.parentId) throw new Error('结算帧父子关系损坏');
    state.resolution.stack.pop();
    return frame;
  }
  abortAll(state: GameState): void { state.resolution.stack = []; }
}
export const resolutionStack = new ResolutionStack();
