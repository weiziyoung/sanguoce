import { cancelTriggerWindow } from '../../rules/trigger-resolver.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { cardText } from "../../../catalog.ts";
import { leaf, setPrompt } from "../../core/decision-manager.ts";
import { card, handAndEquip, name, person, push } from "../../domain/state-access.ts";
import type { ActionMap, AttackContext, PromptOf, TaskOf } from "../../domain/state.ts";
import { type GameState, type InternalOption } from "../../domain/state.ts";
import { discardOwned, draw, takeHandAt } from "../../rules/operations/cards.ts";
import { damage } from "./flows/damage-flow.ts";
import { promptResponse } from "./flows/response-flow.ts";
import { chooseZoneOptions } from "./flows/trick-flow.ts";
import { shaCosts, spendSha, transformationAction, transformationCostLabel, transformationKey } from "./transforms.ts";
import type { ContentRuntime } from '../../rules/content-runtime.ts';
import { getStandardRuntime } from './runtime.ts';

export function promptCixiong(s: GameState, task: AttackContext): void {
  setPrompt(s, task.source, "cixiong",
    `是否发动【雌雄双股剑】针对${person(s, task.target).label}？`,
    [leaf("cixiong:yes", "发动", { type: "yes" }), leaf("cixiong:no", "不发动", { type: "no" })], task);
}

export function promptQinglong(s: GameState, task: AttackContext, runtime: ContentRuntime = getStandardRuntime()): void {
  const options = shaCosts(s, task.source, runtime).map(cost =>
    leaf(`qinglong:${cost.virtual && cost.transformation !== 'standard.zhangba' ? transformationKey(cost.transformation) + ':' : ''}${cost.ids.join(':')}`,
      `使用${cost.virtual ? transformationCostLabel(s, cost.ids) + '当【杀】' : cardText(card(s, cost.ids[0]))}`,
      { type: 'qinglong', ids: cost.ids, ...transformationAction(cost.transformation) }));
  options.push(leaf('qinglong:pass', '不追击', { type: 'pass' }));
  setPrompt(s, task.source, 'qinglong', '【青龙偃月刀】：是否再出【杀】？', options, task);
}

export function promptGuanshi(s: GameState, task: AttackContext): void {
  const p = person(s, task.source);
  const available = [...p.hand, ...Object.values(p.equip).filter((id): id is number => id !== null && name(s, id) !== 'guanshi')];
  const options: InternalOption[] = [];
  for (let i = 0; i < available.length; i++) for (let j = i + 1; j < available.length; j++) {
    const ids = [available[i], available[j]];
    options.push(leaf(`guanshi:${ids.join(':')}`, `弃置${ids.map(id => cardText(card(s, id))).join('＋')}，令【杀】命中`, { type: 'guanshi', ids }));
  }
  if (options.length) {
    options.push(leaf('guanshi:pass', '不发动', { type: 'pass' }));
    setPrompt(s, task.source, 'guanshi', '【贯石斧】：弃两张牌令【杀】命中？', options, task);
  }
}

export function promptHanbing(s: GameState, task: AttackContext): void {
  setPrompt(s, task.source, 'hanbing', '【寒冰剑】：防止伤害并弃置目标至多两张牌？', [
    leaf('hanbing:yes', '发动【寒冰剑】', { type: 'yes' }), leaf('hanbing:no', '正常造成伤害', { type: 'no' }),
  ], task);
}

export function promptQilin(s: GameState, task: AttackContext): void {
  const p = person(s, task.target);
  const options = [p.equip.plusHorse, p.equip.minusHorse].filter((id): id is number => id !== null).map(cid =>
    leaf(`qilin:${cid}`, `弃置${cardText(card(s, cid))}`, { type: 'qilin', cid }));
  options.push(leaf('qilin:pass', '不发动', { type: 'pass' }));
  setPrompt(s, task.source, 'qilin', '【麒麟弓】：弃置目标的一张坐骑牌？', options, task);
}

export function handleShaStartTask(s: GameState, task: TaskOf<'shaStart'>): void {
  if (!person(s, task.target).alive) return;
  emitEvent(s, 'attackDeclared', { source: task.source, target: task.target,
    ...(task.redirectedBy === undefined ? {} : { redirectedBy: task.redirectedBy }),
    ...(task.forcedBy === undefined ? {} : { forcedBy: task.forcedBy }) });
  push(s, { kind: 'openTriggers', signal: { kind: 'attackTargeted', data: task }, then: [{ ...task, kind: 'shaRespond' }] });
}

export function handleShaRespondTask(s: GameState, task: TaskOf<'shaRespond'>): void {
  promptResponse(s, { mode: 'sha', actor: task.target, source: task.source, sha: task.sha, baguaTried: false });
}

export function handleShaMissTask(s: GameState, task: TaskOf<'shaMiss'>): void {
  push(s, { kind: 'openTriggers', signal: { kind: 'attackMissed', data: task }, then: [] });
}

export function handleShaHitTask(s: GameState, task: TaskOf<'shaHit'>): void {
  push(s, { kind: 'openTriggers', signal: { kind: 'beforeAttackDamage', data: task }, then: [{ ...task, kind: 'attackDamage' }] });
}

export function handleAttackDamageTask(s: GameState, task: TaskOf<'attackDamage'>): void {
  damage(s, task.target, task.source, 1, null, task.sha,
    { ...(task.redirectedBy === undefined ? {} : { redirectedBy: task.redirectedBy }),
      ...(task.forcedBy === undefined ? {} : { forcedBy: task.forcedBy }) });
}

export function handleHanbingPickTask(s: GameState, task: TaskOf<"hanbingPick">): void {
  if (handAndEquip(s, task.target).length) {
    chooseZoneOptions(s, task.target, {
      cname: "guohe", source: task.source, target: task.target,
      hanbingRemaining: task.remaining, handAndEquipOnly: true,
    });
  }
}

export function handleCixiongChoice(s: GameState, prompt: PromptOf<"cixiong">, data: ActionMap["cixiong"]): void {
  const actor = prompt.actor;
  if (data.type === "yes") {
    const target = prompt.context.target;
    if (!person(s, target).hand.length) draw(s, actor, 1);
    else {
      setPrompt(s, target, "cixiongCost",
        "【雌雄双股剑】：弃置一张手牌，或令对手摸一张牌",
        [...person(s, target).hand.map(cid => leaf(`cixiong:discard:${cid}`,
          `弃置${cardText(card(s, cid))}`, { type: "discard", cid })),
        leaf("cixiong:draw", "令对手摸一张牌", { type: "draw" })], prompt.context);
      return;
    }
  }
}

export function handleCixiongCostChoice(s: GameState, prompt: PromptOf<"cixiongCost">, data: ActionMap["cixiongCost"]): void {
  const actor = prompt.actor;
  if (data.type === "discard") discardOwned(s, actor, data.cid);
  else draw(s, prompt.context.source, 1);
}

export function handleQinglongChoice(s: GameState, prompt: PromptOf<"qinglong">, data: ActionMap["qinglong"], runtime: ContentRuntime = getStandardRuntime()): void {
  const actor = prompt.actor;
  if (data.type === "qinglong") {
    const used = spendSha(s, actor, data.ids, 'respond', runtime, data.transformation);
    emitEvent(s, 'abilityActivated', { ability: 'qinglong', owner: actor, effect: 'followUp' });
    push(s, { kind: "shaStart", source: actor, target: prompt.context.target, sha: used, ignoreDistance: true });
  }
}

export function handleGuanshiChoice(s: GameState, prompt: PromptOf<"guanshi">, data: ActionMap["guanshi"]): void {
  const actor = prompt.actor;
  if (data.type === "guanshi") {
    for (const cid of data.ids) discardOwned(s, actor, cid);
    emitEvent(s, 'abilityActivated', { ability: 'guanshi', owner: actor, effect: 'forceHit' });
    push(s, { ...prompt.context, kind: "shaHit" });
  }
}

export function handleHanbingChoice(s: GameState, prompt: PromptOf<"hanbing">, data: ActionMap["hanbing"]): void {
  const actor = prompt.actor;
  if (data.type === "yes") {
    cancelTriggerWindow(s);
    emitEvent(s, 'abilityActivated', { ability: 'hanbing', owner: actor, effect: 'preventDamage' });
    push(s, { kind: "hanbingPick", source: actor, target: prompt.context.target, remaining: 2 });
  }
}

export function handleHanbingPickChoice(s: GameState, prompt: PromptOf<"hanbingPick">, data: ActionMap["hanbingPick"]): void {
  const context = prompt.context;
  if (data.zone === "hand") takeHandAt(s, context.target, context.source, "discard", data.slot);
  else discardOwned(s, context.target, data.cid);
  if (context.hanbingRemaining > 1 && handAndEquip(s, context.target).length) {
    push(s, { kind: "hanbingPick", source: context.source, target: context.target, remaining: context.hanbingRemaining - 1 });
  }
}

export function handleQilinChoice(s: GameState, prompt: PromptOf<"qilin">, data: ActionMap["qilin"]): void {
  if (data.type === "qilin") discardOwned(s, prompt.context.target, data.cid);
}
