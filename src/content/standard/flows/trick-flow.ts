import { beginAttackUse } from '../../../rules/flows/attack-use-flow.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from "../../../domain/resolution-stack.ts";
import { cardText, type CardName } from "../../../../catalog.ts";
import { leaf, setPrompt } from "../../../core/decision-manager.ts";
import { alive, card, person, push, stealable } from "../../../domain/state-access.ts";
import type { ActionMap, PromptOf, TaskOf, TrickContext, ZoneContext } from "../../../domain/state.ts";
import { type GameState, type InternalOption, type Task } from "../../../domain/state.ts";
import { displayName } from "../../../presentation/card-label.ts";
import { cardMovement } from "../../../rules/operations/card-movement-service.ts";
import { discardOwned, draw, removeOne, takeHandAt, takeOwned } from "../../../rules/operations/cards.ts";
import { deckService } from "../../../rules/operations/deck-service.ts";
import { vitals } from "../../../rules/operations/vitals-service.ts";
import { shaCosts, spendSha, transformationAction, transformationCostLabel, transformationKey } from "../transforms.ts";
import { beginNullify } from "./nullification-flow.ts";
import { promptResponse } from "./response-flow.ts";
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { getStandardRuntime } from '../runtime.ts';

export function beginTrick(s: GameState, source: number, cname: CardName, targets: number[], cid: number,
  second: number | null = null, runtime: ContentRuntime = getStandardRuntime()): void {
  const frame = resolutionStack.open(s, 'trick', { source, cname, cid, targets, pool: [] });
  const harvest = runtime.content.card(cname).effect === 'harvest';
  if (harvest) {
    const pool = deckService.takeTop(s, alive(s).length, { kind: 'table' });
    frame.data.pool.push(...pool);
    emitEvent(s, 'harvestRevealed', { cards: pool });
  }
  // Target order is snapshotted for this use. Each target owns a separate response window.
  push(s, ...frame.data.targets.map(target => ({ kind: 'trickTarget' as const,
    trickFrameId: frame.id, cname, source, target, cid, second })),
    ...(harvest ? [{ kind: 'wuguCleanup' as const }] : []));
}

export function chooseZoneOptions(s: GameState, target: number, mode: ZoneContext): void {
  const p = person(s, target);
  const options: InternalOption[] = [];
  for (let slot = 0; slot < p.hand.length; slot++) options.push(leaf(`zone:hand:${slot}`,
    `选择对手第${slot + 1}张手牌`, { type: "zone", zone: "hand", slot }));
  for (const [, cid] of Object.entries(p.equip)) {
    if (cid) options.push(leaf(`zone:equip:${cid}`, `选择装备区${cardText(card(s, cid))}`, { type: "zone", zone: "equip", cid }));
  }
  if (!mode.handAndEquipOnly) for (const cid of p.judge) {
    options.push(leaf(`zone:judge:${cid}`, `选择判定区${cardText(card(s, cid))}`, { type: "zone", zone: "judge", cid }));
  }
  if (mode.hanbingRemaining !== undefined) {
    setPrompt(s, mode.source, 'hanbingPick', '【寒冰剑】：弃置目标一张牌', options,
      { ...mode, hanbingRemaining: mode.hanbingRemaining });
  } else {
    setPrompt(s, mode.source, 'zone', `【${mode.label ?? (mode.cname ? displayName(mode.cname, s.cards) : '技能')}】：选择${p.label}的一张牌`, options, mode);
  }
}

export function resolveTrick(s: GameState, task: TrickContext, runtime: ContentRuntime = getStandardRuntime()): void {
  const { cname, source, target, cid } = task;
  if (!person(s, target).alive) return;
  const definition = runtime.content.card(cname);
  if (!runtime.queries.trickEffective(s, target, cname)) return;
  if (definition.trickEffect) { definition.trickEffect(s, task, runtime); return; }
  const effect = definition.effect;
  if (effect === 'drawTwo') draw(s, target, 2);
  else if (effect === 'recoverOne') {
    const p = person(s, target);
    if (p.hp < p.maxHp) {
      vitals.recover(s, target, 1, source);
    }
  } else if (effect === 'requireSha' || effect === 'requireShan') {
    const mode = effect === 'requireSha' ? 'nanman' : 'wanjian';
    promptResponse(s, { mode, actor: target, source, cardId: cid,
      ...(cname === mode ? {} : { cardName: cname }) });
  } else if (effect === 'duel') {
    promptResponse(s, { mode: 'juedou', actor: target, source, cardId: cid,
      ...(cname === 'juedou' ? {} : { cardName: cname }) });
  } else if (effect === 'gainZone' || effect === 'discardZone') {
    if (stealable(s, target).length) chooseZoneOptions(s, target, { cname, source, target });
  } else if (effect === 'borrowed') {
    const second = task.second;
    const weapon = person(s, target).equip.weapon;
    if (!weapon || second == null || !runtime.queries.canSha(s, target, second)) return;
    const options = shaCosts(s, target, runtime).map(cost => leaf(
      `jiedao:${cost.virtual && cost.transformation !== 'standard.zhangba' ? transformationKey(cost.transformation) + ':' : ''}${cost.ids.join(":")}`,
      `对${person(s, second).label}使用${cost.virtual ?
        cost.transformation === 'standard.zhangba' ? '两张手牌当【杀】' : `${transformationCostLabel(s, cost.ids)}当【杀】` :
        cardText(card(s, cost.ids[0]))}`,
      { type: "jiedaoSha", ids: cost.ids, ...transformationAction(cost.transformation) }));
    options.push(leaf("jiedao:give", `不出【杀】，交出${cardText(card(s, weapon))}`, { type: "pass" }));
    setPrompt(s, target, "jiedao", "【借刀杀人】：使用【杀】或交出武器", options, { source, target: second });
  } else if (effect === 'harvest') {
    const pool = resolutionStack.get(s, task.trickFrameId, 'trick').data.pool;
    const options = pool.map(id => leaf(`wugu:${id}`, `获得${cardText(card(s, id))}`, { type: "wugu", cid: id }));
    if (options.length) setPrompt(s, target, "wugu", "【五谷丰登】：选择一张亮出的牌", options);
  } else {
    throw new Error(`锦囊尚未实现：${cname}`);
  }
}

export function handleTrickTargetTask(s: GameState, task: TaskOf<"trickTarget">,
  runtime: ContentRuntime = getStandardRuntime()): void {
  if ((runtime.queries.canTarget(s, task.source, task.target, task.cname) || task.source === task.target) &&
    runtime.queries.trickEffective(s, task.target, task.cname)) {
    const effect: Task = { ...task, kind: "resolveTrick" };
    beginNullify(s, effect, null, task.source, task.target, task.cname);
  }

}

export function handleResolveTrickTask(s: GameState, task: TaskOf<"resolveTrick">, runtime: ContentRuntime = getStandardRuntime()): void {
  resolveTrick(s, task, runtime);

}

export function handleWuguCleanupTask(s: GameState, task: TaskOf<"wuguCleanup">): void {
  const pool = resolutionStack.require(s, 'trick').data.pool;
  for (const id of pool.splice(0)) {
    if (s.table.includes(id)) {
      cardMovement.move(s, [id], { kind: "discard" });
      emitEvent(s, 'harvestLeftover', { card: id });
    }
  }

}

export function handleZoneChoice(s: GameState, prompt: PromptOf<"zone">, data: ActionMap["zone"], runtime: ContentRuntime = getStandardRuntime()): void {

  const { cname, source, target } = prompt.context;
  const gain = prompt.context.gain ?? (cname ? runtime.content.card(cname).effect === 'gainZone' : false);
  const selection = cname ? { cause: cname, fromZone: data.zone } : undefined;
  if (data.zone === "hand") takeHandAt(s, target, source, gain ? "gain" : "discard", data.slot, selection);
  else if (gain) takeOwned(s, target, source, data.cid, selection);
  else discardOwned(s, target, data.cid, 'discard', selection);

}

export function handleWuguChoice(s: GameState, prompt: PromptOf<"wugu">, data: ActionMap["wugu"], runtime: ContentRuntime = getStandardRuntime()): void {
  const actor = prompt.actor;
  const frame = resolutionStack.nearest(s, 'trick');
  if (runtime.content.card(frame.data.cname).effect !== 'harvest') throw new Error('五谷选择不属于五谷结算帧');
  removeOne(frame.data.pool, data.cid);
  cardMovement.move(s, [data.cid], { kind: "hand", owner: actor });
  emitEvent(s, 'harvestTaken', { player: actor, card: data.cid });

}

export function handleJiedaoChoice(s: GameState, prompt: PromptOf<"jiedao">, data: ActionMap["jiedao"], runtime: ContentRuntime = getStandardRuntime()): void {
  const actor = prompt.actor;
  if (data.type === "jiedaoSha") {
    const used = spendSha(s, actor, data.ids, 'respond', runtime, data.transformation);
    emitEvent(s, 'borrowedAttack', { player: actor });
    beginAttackUse(s, actor, used, [prompt.context.target], runtime, { ignoreDistance: false, forcedBy: prompt.context.source });
  } else {
    const weapon = person(s, actor).equip.weapon;
    if (weapon) takeOwned(s, actor, prompt.context.source, weapon);
  }

}
