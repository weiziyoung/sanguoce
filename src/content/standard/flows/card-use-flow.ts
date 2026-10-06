import { beginAttackUse } from '../../../rules/flows/attack-use-flow.ts';
import { discardOwned, draw } from '../../../rules/operations/cards.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from "../../../domain/resolution-stack.ts";
import { name, person, push, seatOrder } from "../../../domain/state-access.ts";
import type { ActionMap, PromptOf, TaskOf } from "../../../domain/state.ts";
import { type GameState } from "../../../domain/state.ts";
import { cardMovement } from "../../../rules/operations/card-movement-service.ts";
import { equip } from "../../../rules/operations/cards.ts";
import { vitals } from "../../../rules/operations/vitals-service.ts";
import { effectiveCard, spendCard, spendSha } from "../transforms.ts";
import { beginTrick } from "./trick-flow.ts";
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { getStandardRuntime } from '../runtime.ts';
import { SkillFlow } from '../../../rules/flows/skill-flow.ts';
import { ProxyResponseFlow } from './proxy-response-flow.ts';

function playCard(s: GameState, source: number, data: Extract<ActionMap["play"], { type: "play" }>, runtime: ContentRuntime): void {
  const { cid, targets } = data;
  const cname = name(s, cid);
  const definition = runtime.content.card(cname);
  if (definition.effect === 'equip') {
    equip(s, source, cid, runtime.content);
    return;
  }
  if (definition.effect === 'delay') {
    const target = definition.play.scope === 'self' ? source : targets[0];
    cardMovement.move(s, [cid], { kind: "judge", owner: target }, source);
    emitEvent(s, 'delayPlaced', { source, target, card: cid });
    return;
  }
  cardMovement.move(s, [cid], { kind: "table" }, source);
  push(s, { kind: "finishCard", cid });
  if (!runtime.triggers.forEvent('cardUsed').length) {
    emitEvent(s, 'cardUsed', { source, card: cid, targets });
    handleResolveCardUseTask(s, { kind: 'resolveCardUse', source, cid, targets }, runtime);
  } else {
    push(s, { kind: 'openTriggers', signal: { kind: 'cardUsed', data: { source, card: cid, targets } },
      then: [{ kind: 'resolveCardUse', source, cid, targets }] });
  }
}

export function handleResolveCardUseTask(s: GameState, task: TaskOf<'resolveCardUse'>,
  runtime: ContentRuntime = getStandardRuntime()): void {
  const { source, cid, targets } = task;
  const cname = name(s, cid);
  const definition = runtime.content.card(cname);
  if (definition.effect === 'attack') {
    if (source === s.active) s.shaUsed++;
    if (source === s.active && s.phase === 'play' && s.shaPlayedOrRespondedInPlay !== undefined) {
      s.shaPlayedOrRespondedInPlay = true;
    }
    beginAttackUse(s, source, cid, targets, runtime, { ignoreDistance: false });
  } else if (definition.useEffect) {
    definition.useEffect(s, source, cid, runtime);
  } else if (definition.effect === 'recover') {
    vitals.recover(s, source);
  } else {
    const applied = definition.play.scope === 'all' ? seatOrder(s, source)
      : definition.play.scope === 'others' ? seatOrder(s, source).filter(id => id !== source)
        : definition.play.scope === 'self' ? [source] : definition.play.targeting === 'multiple' ? targets : [targets[0]];
    beginTrick(s, source, cname, applied, cid, targets[1], runtime);
  }
}

export function handleResolveVirtualTrickTask(s: GameState, task: TaskOf<'resolveVirtualTrick'>,
  runtime: ContentRuntime = getStandardRuntime()): void {
  beginTrick(s, task.source, task.cname, task.targets, task.cid, null, runtime);
}

export function handleFinishCardTask(s: GameState, task: TaskOf<"finishCard">): void {
  if (s.table.includes(task.cid)) cardMovement.move(s, [task.cid], { kind: "discard" });

}

/** Internal rule entry: the caller validates permission; this scope owns costs and cleanup. */
export function beginCardUse(s: GameState, source: number, action: Exclude<ActionMap['play'], { type: 'endPlay' }>): void {
  resolutionStack.open(s, 'cardUse', { source, action }, [{ kind: 'cardUseStart' }]);
}

export function handleCardUseStartTask(s: GameState, runtime: ContentRuntime = getStandardRuntime()): void {
  const { source, action } = resolutionStack.require(s, 'cardUse').data;
  if (!person(s, source).alive) return;
  if (action.type === 'recast') {
    if (!runtime.content.card(name(s, action.cid)).play.recast) throw new Error('此牌不能重铸');
    discardOwned(s, source, action.cid);
    emitEvent(s, 'cardRecast', { player: source, card: action.cid });
    draw(s, source, 1);
  } else if (action.type === 'virtualSha') {
    const used = spendSha(s, source, action.ids, 'convertToSha', runtime, action.transformation);
    if (source === s.active) s.shaUsed++;
    if (!action.transformation || action.transformation === 'standard.zhangba') {
      emitEvent(s, 'abilityActivated', { ability: 'zhangba', owner: source, effect: 'virtualSha' });
    } else {
      emitEvent(s, 'transformationUsed', { ability: action.transformation,
        label: runtime.content.skillForTransformation(action.transformation).label ?? action.transformation, owner: source });
    }
    beginAttackUse(s, source, used, action.targets, runtime);
  } else if (action.type === 'proxySha') {
    const skill = runtime.content.requireSkill(action.ability);
    const proxy = skill.proxyResponse;
    if (s.mode.id !== 'identity' || s.mode.roles[source] !== 'lord' || proxy?.produces !== 'sha' ||
      !runtime.abilities.has(s, source, action.ability) || s.shaUsed >= runtime.queries.shaLimit(s, source) ||
      action.targets.length !== 1 || !runtime.queries.canSha(s, source, action.targets[0])) {
      throw new Error('激将目标或能力已失效');
    }
    new ProxyResponseFlow(runtime).begin(s, source, action.ability, 'sha', action.targets[0]);
  } else if (action.type === 'virtualDelay') {
    const definition = runtime.content.card(action.cname);
    const target = action.targets[0];
    if (definition.kind !== 'delay' || definition.play.targeting !== 'single' || action.ids.length !== 1 ||
      action.targets.length !== 1 || !runtime.queries.canTarget(s, source, target, action.cname) ||
      s.players[target].judge.some(id => name(s, id) === action.cname)) throw new Error('转化延时锦囊目标已失效');
    effectiveCard(s, source, action.ids, action.cname, runtime, action.transformation);
    const cid = action.ids[0];
    cardMovement.move(s, [cid], { kind: 'judge', owner: target }, source);
    s.virtualJudgeNames ??= [];
    s.virtualJudgeNames.push({ card: cid, name: action.cname });
    emitEvent(s, 'transformationUsed', { ability: action.transformation,
      label: runtime.content.skillForTransformation(action.transformation).label ?? action.transformation,
      owner: source, produces: action.cname });
    emitEvent(s, 'delayPlaced', { source, target, card: cid, effectiveName: action.cname });
  } else if (action.type === 'virtualTrick') {
    const definition = runtime.content.card(action.cname);
    if (definition.kind !== 'trick' || definition.play.targeting !== 'single' || action.ids.length !== 1 ||
      action.targets.length !== 1 ||
      !runtime.queries.canTarget(s, source, action.targets[0], action.cname)) throw new Error('转化锦囊目标已失效');
    spendCard(s, source, action.ids, action.cname, 'use', runtime, action.transformation);
    const cid = action.ids[0];
    emitEvent(s, 'transformationUsed', { ability: action.transformation,
      label: runtime.content.skillForTransformation(action.transformation).label ?? action.transformation,
      owner: source, produces: action.cname });
    const signal = { kind: 'cardUsed' as const,
      data: { source, card: cid, targets: action.targets, effectiveName: action.cname } };
    if (!runtime.triggers.forEvent('cardUsed').length) {
      emitEvent(s, signal.kind, signal.data);
      handleResolveVirtualTrickTask(s, { kind: 'resolveVirtualTrick', source, cid,
        cname: action.cname, targets: action.targets }, runtime);
    } else push(s, { kind: 'openTriggers', signal,
      then: [{ kind: 'resolveVirtualTrick', source, cid, cname: action.cname, targets: action.targets }] });
  } else if (action.type === 'play') playCard(s, source, action, runtime);
  else throw new Error('主动技能不能作为卡牌使用');
}

export function handlePlayChoice(s: GameState, prompt: PromptOf<'play'>, data: ActionMap['play'],
  runtime: ContentRuntime = getStandardRuntime()): void {
  if (data.type === 'endPlay') return;
  push(s, { kind: 'phasePlay' });
  if (data.type === 'activeSkill') new SkillFlow(runtime).open(s, prompt.actor, data.ability, data.ids, data.targets);
  else if (data.type === 'beginSkill') new SkillFlow(runtime).openSelection(s, prompt.actor, data.ability);
  else beginCardUse(s, prompt.actor, data);
}
