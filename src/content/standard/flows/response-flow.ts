import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from "../../../domain/resolution-stack.ts";
import { NAMES, cardColor } from "../../../../catalog.ts";
import { leaf, setPrompt } from "../../../core/decision-manager.ts";
import { person, push } from "../../../domain/state-access.ts";
import type { ActionMap, PromptOf, ResponseContext, Task } from "../../../domain/state.ts";
import { type GameState } from "../../../domain/state.ts";
import { displayName } from "../../../presentation/card-label.ts";
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import { spendCard } from "../transforms.ts";
import { damage } from "./damage-flow.ts";
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { getStandardRuntime } from '../runtime.ts';
import { ProxyResponseFlow } from './proxy-response-flow.ts';
import { responseOptions } from './response-options.ts';

export function promptResponse(s: GameState, context: ResponseContext): void {
  resolutionStack.open(s, 'response', { context }, [{ kind: 'responsePoll' }]);
}

export function handleResponsePollTask(s: GameState, runtime: ContentRuntime = getStandardRuntime()): void {
  const frame = resolutionStack.require(s, 'response');
  const { context } = frame.data;
  const { actor, mode } = context;
  if (!person(s, actor).alive) return;
  if ((mode === 'sha' || mode === 'juedou') && context.remaining === undefined) {
    context.remaining = runtime.queries.responseCount(s, context.source, actor, mode);
  }
  const need = ["sha", "wanjian"].includes(mode) ? "shan" : "sha";
  const baguaAllowed = need === "shan" && !context.baguaTried &&
    runtime.abilities.has(s, actor, 'standard.bagua') &&
    !(mode === "sha" && runtime.abilities.has(s, context.source, 'standard.qinggang'));
  const options = responseOptions(s, actor, need, baguaAllowed, runtime);
  if ((mode === 'sha' || mode === 'juedou' || mode === 'nanman') && !context.proxyTried &&
    s.mode.id === 'identity' && s.mode.roles[actor] === 'lord') {
    for (const skill of runtime.abilities.list(s, actor)) {
      const proxy = skill.proxyResponse;
      if (proxy?.produces !== need ||
        !s.players.some(player => player.alive && player.id !== actor && player.group === proxy.group)) continue;
      options.splice(options.length - 1, 0, leaf(`respond:proxy:${skill.id}`,
        `发动【${skill.label ?? skill.id}】请求同势力角色打出【${NAMES[need]}】`,
        { type: 'proxy', ability: skill.id }));
    }
  }
  setPrompt(s, actor, "respond",
    `${person(s, actor).label}需打出【${NAMES[need]}】响应【${displayName('cardName' in context ? context.cardName ?? mode : mode, s.cards)}】`,
    options, context);
}

export function responseSuccess(s: GameState, context: ResponseContext): void {
  const { mode, actor, source } = context;
  const response = resolutionStack.nearest(s, 'response');
  const resume = (task: Task) => {
    if (resolutionStack.active(s).id === response.id) resolutionStack.enqueue(s, task);
    else if (resolutionStack.active(s).parentId === response.id) resolutionStack.enqueueParent(s, task);
    else throw new Error('响应结算帧父子关系损坏');
  };
  if ((mode === 'sha' || mode === 'juedou') && (context.remaining ?? 1) > 1) {
    response.data.context = { ...context, remaining: context.remaining! - 1,
      baguaTried: false, proxyTried: false };
    resume({ kind: 'responsePoll' });
    return;
  }
  if (mode === "sha") {
    resume({ kind: "shaMiss", source, target: actor, sha: context.sha });
  } else if (mode === "juedou") {
    response.data.context = { ...context, actor: source, source: actor,
      remaining: undefined };
    resume({ kind: 'responsePoll' });
  }
}

export function responseFailure(s: GameState, context: ResponseContext): void {
  const { mode, actor, source } = context;
  if (mode === "sha") {
    push(s, { kind: "shaHit", source, target: actor, sha: context.sha });
  } else {
    if (mode === 'juedou') emitEvent(s, 'duelEnded', { loser: actor });
    damage(s, actor, source, 1, null, context.cardId ?? null);
  }
}

export function handleRespondChoice(s: GameState, prompt: PromptOf<"respond">, data: ActionMap["respond"], runtime: ContentRuntime = getStandardRuntime()): void {
  const actor = prompt.actor;

  const context = prompt.context;
  if (data.type === "bagua") {
    new JudgementFlow(runtime).begin(s, actor, 'bagua', { kind: 'applyBaguaJudgement' });
  } else if (data.type === 'proxy') {
    const need = ['sha', 'wanjian'].includes(context.mode) ? 'shan' : 'sha';
    const skill = runtime.content.requireSkill(data.ability);
    if (s.mode.id !== 'identity' || s.mode.roles[actor] !== 'lord' || context.proxyTried ||
      !runtime.abilities.has(s, actor, data.ability) || skill.proxyResponse?.produces !== need) {
      throw new Error('阵营代理响应已失效');
    }
    new ProxyResponseFlow(runtime).begin(s, actor, data.ability, need);
  } else if (data.type === "respond") {
    const need = ["sha", "wanjian"].includes(context.mode) ? 'shan' : 'sha';
    const responseMode = context.mode === 'juedou' ? 'juedou' : undefined;
    const effective = spendCard(s, actor, data.ids, need, 'respond', runtime, data.transformation, responseMode);
    if (data.transformation) emitEvent(s, 'transformationUsed', {
      ability: data.transformation, label: runtime.content.skillForTransformation(data.transformation).label ?? data.transformation,
      owner: actor, produces: need, ...(responseMode ? { responseMode } : {}),
    });
    if (context.mode === 'juedou') emitEvent(s, 'duelResponded', {
      player: actor, card: data.ids[0], effectiveName: effective.name,
    });
    responseSuccess(s, context);
  } else responseFailure(s, context);

}

export function handleApplyBaguaJudgementTask(s: GameState): void {
  const frame = resolutionStack.require(s, 'judgement');
  const parent = resolutionStack.get(s, frame.parentId!, 'response');
  const context = parent.data.context;
  const final = frame.data.finalId === null ? null : s.cards[frame.data.finalId];
  if (final && cardColor(final) === 'red') {
    emitEvent(s, 'abilityActivated', { ability: 'bagua', owner: null, effect: 'autoShan' });
    responseSuccess(s, context);
  } else {
    parent.data.context = { ...context, baguaTried: true };
    resolutionStack.enqueueParent(s, { kind: 'responsePoll' });
  }
}
