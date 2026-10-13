import { beginAttackUse } from '../../../rules/flows/attack-use-flow.ts';
import { leaf, setPrompt } from '../../../core/decision-manager.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { seatService } from '../../../domain/seat-service.ts';
import type { ActionMap, GameState, PromptOf } from '../../../domain/state.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { spendCard } from '../transforms.ts';
import { responseOptions } from './response-options.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import type { CardLike } from '../../../../catalog.ts';

/** A lord's response is supplied by the first willing living ally in seat order. */
export class ProxyResponseFlow {
  readonly runtime: ContentRuntime;
  constructor(runtime: ContentRuntime) { this.runtime = runtime; }
  begin(state: GameState, requester: number, ability: string, need: 'sha' | 'shan', target?: number): void {
    const skill = this.runtime.content.requireSkill(ability);
    emitEvent(state, 'skillActivated', { ability, label: skill.label ?? ability, owner: requester,
      targets: target === undefined ? [] : [target] });
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
    while (frame.data.current !== null || frame.data.cursor < candidates.length) {
      const actor = frame.data.current ?? candidates[frame.data.cursor++];
      if (!state.players[actor].alive || state.players[actor].group !== skill.proxyResponse.group) {
        frame.data.current = null; frame.data.baguaTried = false; continue;
      }
      const baguaAllowed = need === 'shan' && !frame.data.baguaTried && this.runtime.queries.autoShan(state, actor);
      const options = responseOptions(state, actor, need, baguaAllowed, this.runtime);
      if (options.length === 1) { frame.data.current = null; frame.data.baguaTried = false; continue; }
      frame.data.current = actor;
      setPrompt(state, actor, 'proxyResponse',
        `是否替${state.players[requester].label}打出【${need === 'sha' ? '杀' : '闪'}】？`,
        options.map(option => leaf(`proxy:${ability}:${actor}:${option.id}`, option.label,
          option.data as ActionMap['proxyResponse'])), { requester, ability, current: actor,
          ...(frame.data.target === undefined ? {} : { target: frame.data.target }) });
      return;
    }
    this.exhausted(state);
  }
  choice(state: GameState, prompt: PromptOf<'proxyResponse'>, action: ActionMap['proxyResponse']): void {
    const frame = resolutionStack.require(state, 'proxyResponse');
    if (frame.data.requester !== prompt.context.requester || frame.data.ability !== prompt.context.ability ||
      frame.data.current !== prompt.actor || prompt.actor !== prompt.context.current) throw new Error('代理响应已失效');
    if (action.type === 'pass') {
      frame.data.current = null; frame.data.baguaTried = false;
      resolutionStack.enqueue(state, { kind: 'proxyResponsePoll' }); return;
    }
    if (action.type === 'bagua') {
      if (frame.data.need !== 'shan' || frame.data.baguaTried || !this.runtime.queries.autoShan(state, prompt.actor)) throw new Error('代理八卦响应已失效');
      frame.data.baguaTried = true;
      const ability = this.runtime.abilities.instances(state, prompt.actor).find(instance => instance.definition.modifier?.autoShan?.(state, prompt.actor));
      if (ability && ability.source.kind !== 'equipment') emitEvent(state, 'skillActivated', { ability: ability.definition.id,
        label: ability.definition.label ?? ability.definition.id, owner: prompt.actor, targets: [] });
      new JudgementFlow(this.runtime).begin(state, prompt.actor, 'bagua', { kind: 'applyProxyBaguaJudgement' });
      return;
    }
    const effective = spendCard(state, prompt.actor, action.ids, frame.data.need, 'respond', this.runtime, action.transformation);
    if (action.transformation) emitEvent(state, 'transformationUsed', {
      ability: action.transformation,
      label: this.runtime.content.skillForTransformation(action.transformation).label ?? action.transformation,
      owner: prompt.actor, produces: frame.data.need,
    });
    this.provided(state, effective);
  }
  applyBagua(state: GameState): void {
    const judgement = resolutionStack.require(state, 'judgement').data;
    const proxy = resolutionStack.nearest(state, 'proxyResponse');
    const final = judgement.finalId === null ? null : state.cards[judgement.finalId];
    const suit = final ? this.runtime.queries.suit(state, judgement.owner, final) : null;
    if (proxy.data.current !== judgement.owner) throw new Error('代理八卦判定角色不匹配');
    if (suit === 'heart' || suit === 'diamond') {
      emitEvent(state, 'abilityActivated', { ability: 'bagua', owner: judgement.owner, effect: 'autoShan' });
      resolutionStack.enqueueParent(state, { kind: 'proxyResponseProvided' });
    } else resolutionStack.enqueueParent(state, { kind: 'proxyResponsePoll' });
  }
  provided(state: GameState, effective?: CardLike): void {
    const frame = resolutionStack.require(state, 'proxyResponse');
    const actor = frame.data.current!;
    if (state.failedProxyRequests) state.failedProxyRequests = state.failedProxyRequests.filter(item =>
      item.requester !== frame.data.requester || item.ability !== frame.data.ability);
    if (frame.data.target === undefined) resolutionStack.enqueueParent(state, { kind: 'proxyResponseSuccess' });
    else {
      state.shaUsed++;
      if (state.shaPlayedOrRespondedInPlay !== undefined) state.shaPlayedOrRespondedInPlay = true;
      // Proactive Jijiang only uses paid Sha; bagua can only satisfy a Shan request.
      if (!effective) throw new Error('代理出杀缺少有效牌');
      beginAttackUse(state, frame.data.requester, effective, [frame.data.target], this.runtime);
    }
    for (const skill of this.runtime.abilities.list(state, actor)) skill.responseUsed?.(state, actor, frame.data.need, this.runtime);
  }
  private exhausted(state: GameState): void {
    if (resolutionStack.current(state)?.kind !== 'proxyResponse') throw new Error('代理响应帧已失效');
    const request = resolutionStack.require(state, 'proxyResponse').data;
    const group = this.runtime.content.requireSkill(request.ability).proxyResponse!.group;
    const failure = { requester: request.requester, ability: request.ability, turn: state.turn,
      supporters: state.players.filter(p => p.id !== request.requester && p.alive && p.group === group)
        .map(p => ({ id: p.id, handCount: p.hand.length,
          equipmentIds: Object.values(p.equip).filter((id): id is number => id !== null).sort((a, b) => a - b) })) };
    state.failedProxyRequests = [...(state.failedProxyRequests ?? []).filter(item =>
      item.requester !== request.requester || item.ability !== request.ability), failure];
    if (state.resolution.stack.at(-2)?.kind === 'cardUse') return;
    const parent = resolutionStack.nearest(state, 'response');
    parent.data.context.proxyTried = true;
    resolutionStack.enqueueParent(state, { kind: 'responsePoll' });
  }
}
