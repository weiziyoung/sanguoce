import type { CardLike, CardName } from '../../catalog.ts';
import type { ActionMap, DyingState, ResponseContext, InternalPrompt, NullificationState, Task } from './state.ts';

/** Every frame and continuation is plain data, safe to clone and serialize. */
export interface FrameData {
  root: {};
  triggerWindow: { eventId: number; candidates: { definition: string; owner: number }[];
    cursor: number; cancelled: boolean; redirected?: boolean; then: Task[] };
  trigger: { eventId: number; definition: string; owner: number };
  cardUse: { source: number; action: Exclude<ActionMap['play'], { type: 'endPlay' }> };
  skill: { owner: number; ability: string; ids: number[]; targets: number[] };
  distribution: { owner: number; ability: string; cards: number[] };
  deckReorder: { owner: number; ability: string; cards: number[]; top: number[]; bottom: number[] };
  judgement: { owner: number; reason: CardName; label: string; currentId: number | null; finalId: number | null;
    candidates: { owner: number; ability: string }[] | null; cursor: number };
  response: { context: ResponseContext };
  proxyResponse: { requester: number; ability: string; need: 'sha' | 'shan'; target?: number;
    candidates: number[]; cursor: number; current: number | null };
  trick: { source: number; cname: CardName; cid: number; targets: number[]; pool: number[] };
  nullification: NullificationState;
  damage: { target: number; source: number | null; amount: number; card: number | CardLike | null;
    redirectedBy?: number; forcedBy?: number };
  dying: DyingState;
}
export type FrameKind = keyof FrameData;
export type FrameOf<K extends FrameKind> = {
  id: number; parentId: number | null; kind: K; data: FrameData[K];
  tasks: Task[]; prompt: InternalPrompt | null;
};
export type ResolutionFrame = { [K in FrameKind]: FrameOf<K> }[FrameKind];
export interface ResolutionState { nextId: number; stack: ResolutionFrame[]; }
