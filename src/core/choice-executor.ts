import { type Transition, type TransitionSink } from "../../contracts.ts";
import { resolutionStack } from "../domain/resolution-stack.ts";
import { copy } from "../domain/state-access.ts";
import type { ActionMap, PromptOf } from "../domain/state.ts";
import { type GameState, type InternalOption, type InternalPrompt } from "../domain/state.ts";
import { legalActions } from "./decision-manager.ts";
import { ResolutionScheduler } from "./resolution-scheduler.ts";

export type ChoiceHandlers = { readonly [K in keyof ActionMap]: (s: GameState, prompt: PromptOf<K>, data: ActionMap[K]) => void };
export class ChoiceExecutor {
  readonly handlers: ChoiceHandlers;
  readonly scheduler: ResolutionScheduler;
  constructor(handlers: ChoiceHandlers, scheduler: ResolutionScheduler) {
    this.handlers = Object.freeze({ ...handlers }); this.scheduler = scheduler;
  }
  apply(s: GameState, choiceId: string, trace?: TransitionSink<GameState>): GameState {
    const option = legalActions(s).find(item => item.id === choiceId);
    if (!option?.data || !resolutionStack.current(s)?.prompt) throw new Error('所选行动不合法');
    const next = copy(s);
    const frame = resolutionStack.active(next);
    const prompt = frame.prompt!;
    if (prompt.frameId !== frame.id) throw new Error('选择不属于当前结算帧');
    const handler = this.handlers[prompt.kind];
    if (!handler) throw new Error('未知决策：' + prompt.kind);
    frame.prompt = null;
    const frames: { transition: Transition; state: GameState }[] = [];
    const record: TransitionSink<GameState> | undefined = trace
      ? (transition, state) => { frames.push({ transition: copy(transition), state: copy(state) }); }
      : undefined;
    // Option data originates from this prompt, never from the caller.
    const beforeEventCount = next.events.length;
    (handler as (s: GameState, prompt: InternalPrompt, data: NonNullable<InternalOption["data"]>) => void)(next, prompt, option.data);
    this.scheduler.afterStep(next, beforeEventCount);
    record?.({ type: 'choice', frameId: frame.id, actor: prompt.actor, promptKind: prompt.kind, choiceId, choiceLabel: option.label }, next);
    this.scheduler.advance(next, record);
    for (const frame of frames) trace?.(frame.transition, frame.state);
    return next;
  }
}
