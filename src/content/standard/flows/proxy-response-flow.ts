import { leaf, setPrompt } from '../../../core/decision-manager.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { seatService } from '../../../domain/seat-service.ts';
import type { ActionMap, GameState, PromptOf } from '../../../domain/state.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { spendCard } from '../transforms.ts';
import { responseOptions } from './response-options.ts';

/** A lord's response is supplied by the first willing living ally in seat order. */
export class ProxyResponseFlow {
  readonly runtime: ContentRuntime;
  constructor(runtime: ContentRuntime) { this.runtime = runtime; }
  begin(state: GameState, requester: number, ability: string, need: 'sha' | 'shan', target?: number): void {
    const candidates = seatService.livingOrder(state, requester, false).filter(id => id !== requester);
    resolutionStack.open(state, 'proxyResponse', { requester, ability, need, ...(target === undefined ? {} : { target }), candidates,
      cursor: 0, current: null }, [{ kind: 'proxyResponsePoll' }]);
  }
  poll(state: GameState): void {
    const frame = resolutionStack.require(state, 'proxyResponse');
    const { requester, ability, need, candidates } = frame.data;
    const skill = this.runtime.content.requireSkill(ability);
    if (state.mode.id !== 'identity' || state.mode.roles[requester] !== 'lord' ||
      !this.runtime.abilities.has(state, requester, ability) || skill.proxyResponse?.produces !== need) {
      this.exhausted(state); return;
    }
    while (frame.data.cursor < candidates.length) {
      const actor = candidates[frame.data.cursor++];
      if (!state.players[actor].alive || state.players[actor].group !== skill.proxyResponse.group) continue;
      const options = responseOptions(state, actor, need, false, this.runtime);
      if (options.length === 1) continue;
      frame.data.current = actor;
      setPrompt(state, actor, 'proxyResponse',
        `是否替${state.players[requester].label}打出【${need === 'sha' ? '杀' : '闪'}】？`,
        options.map(option => leaf(`proxy:${ability}:${actor}:${option.id}`, option.label,
          option.data as ActionMap['proxyResponse'])), { requester, ability, current: actor });
      return;
    }
    this.exhausted(state);
  }
  choice(state: GameState, prompt: PromptOf<'proxyResponse'>, action: ActionMap['proxyResponse']): void {
    const frame = resolutionStack.require(state, 'proxyResponse');
    if (frame.data.requester !== prompt.context.requester || frame.data.ability !== prompt.context.ability ||
      frame.data.current !== prompt.actor || prompt.actor !== prompt.context.current) throw new Error('代理响应已失效');
    if (action.type === 'pass') { resolutionStack.enqueue(state, { kind: 'proxyResponsePoll' }); return; }
    const effective = spendCard(state, prompt.actor, action.ids, frame.data.need, 'respond', this.runtime, action.transformation);
    if (action.transformation) emitEvent(state, 'transformationUsed', {
      ability: action.transformation,
      label: this.runtime.content.skillForTransformation(action.transformation).label ?? action.transformation,
      owner: prompt.actor, produces: frame.data.need,
    });
    if (frame.data.target === undefined) resolutionStack.enqueueParent(state, { kind: 'proxyResponseSuccess' });
    else {
      state.shaUsed++;
      if (state.shaPlayedOrRespondedInPlay !== undefined) state.shaPlayedOrRespondedInPlay = true;
      emitEvent(state, 'skillActivated', { ability: frame.data.ability,
        label: this.runtime.content.requireSkill(frame.data.ability).label ?? frame.data.ability,
        owner: frame.data.requester, targets: [frame.data.target] });
      resolutionStack.enqueueParent(state, { kind: 'shaStart', source: frame.data.requester,
        target: frame.data.target, sha: effective });
    }
  }
  private exhausted(state: GameState): void {
    if (resolutionStack.current(state)?.kind !== 'proxyResponse') throw new Error('代理响应帧已失效');
    if (state.resolution.stack.at(-2)?.kind === 'cardUse') return;
    const parent = resolutionStack.nearest(state, 'response');
    parent.data.context.proxyTried = true;
    resolutionStack.enqueueParent(state, { kind: 'responsePoll' });
  }
}
