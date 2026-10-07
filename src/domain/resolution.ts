import type { CardLike, CardName, DamageNature } from '../../catalog.ts';
import type { ActionMap, DyingState, ResponseContext, InternalPrompt, NullificationState, Task } from './state.ts';

/** Every frame and continuation is plain data, safe to clone and serialize. */
export interface FrameData {
  root: {};
  triggerWindow: { eventId: number; candidates: { definition: string; owner: number }[];
    cursor: number; cancelled: boolean; redirected?: boolean; then: Task[] };
  trigger: { eventId: number; definition: string; owner: number };
  attackUse: { source: number; sha: number | CardLike; targets: number[]; nature: DamageNature; damageBonus: number;
    ignoreDistance?: boolean; forcedBy?: number; preparations: string[]; cursor: number };
  cardUse: { source: number; action: Exclude<ActionMap['play'], { type: 'endPlay' }> };
  skill: { owner: number; ability: string; ids: number[]; targets: number[] };
  pindian: { owner: number; target: number; ability: string; sourceCard: number | null; targetCard: number | null };
  contentChoice: { owner: number; ability: string; context: import('./state.ts').ContentChoiceContext };
  distribution: { owner: number; ability: string; cards: number[] };
  deckReorder: { owner: number; ability: string; cards: number[]; top: number[]; bottom: number[] };
  judgement: { owner: number; reason: CardName; label: string; currentId: number | null; finalId: number | null;
    candidates: { owner: number; ability: string }[] | null; cursor: number };
  response: { context: ResponseContext };
  proxyResponse: { requester: number; ability: string; need: 'sha' | 'shan'; target?: number;
    candidates: number[]; cursor: number; current: number | null };
  trick: { source: number; cname: CardName; cid: number; targets: number[]; pool: number[]; card?: CardLike };
  nullification: NullificationState;
  damage: { target: number; source: number | null; amount: number; card: number | CardLike | null;
    redirectedBy?: number; forcedBy?: number; nature?: DamageNature; ignoreArmor?: boolean; propagated?: boolean; sourceModified?: boolean; cancelled?: boolean };
  dying: DyingState;
}
export type FrameKind = keyof FrameData;
export type FrameOf<K extends FrameKind> = {
  id: number; parentId: number | null; kind: K; data: FrameData[K];
  tasks: Task[]; prompt: InternalPrompt | null;
};
export type ResolutionFrame = { [K in FrameKind]: FrameOf<K> }[FrameKind];
export interface ResolutionState { nextId: number; stack: ResolutionFrame[]; }
