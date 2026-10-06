import { prepareAttack, launchAttack, chooseAttackPreparation } from '../rules/flows/attack-use-flow.ts';
import { handleDamagePropagationTask } from '../rules/flows/damage-flow.ts';
import { chooseFireReveal, offerFirePayment, chooseFirePayment } from '../content/junzheng/effects.ts';
import { type TransitionSink } from "../../contracts.ts";
import { handleAttackDamageTask, handleCixiongChoice, handleCixiongCostChoice, handleGuanshiChoice, handleHanbingChoice, handleHanbingPickChoice, handleHanbingPickTask, handleQilinChoice, handleQinglongChoice, handleShaHitTask, handleShaMissTask, handleShaRespondTask, handleShaStartTask } from "../content/standard/equipment-flow.ts";
import { handleCardUseStartTask, handleFinishCardTask, handlePlayChoice, handleResolveCardUseTask, handleResolveVirtualTrickTask } from "../content/standard/flows/card-use-flow.ts";
import { beginDying, handleDyingChoice, promptDying } from "../content/standard/flows/dying-flow.ts";
import { handleDamageApplyTask } from "../content/standard/flows/damage-flow.ts";
import { handleApplyDelayedJudgementTask, handleCancelJudgeTask, handleJudgeCardTask, handleResolveJudgeTask } from "../content/standard/flows/judgement-flow.ts";
import { handleNullifyChoice, promptNullify } from "../content/standard/flows/nullification-flow.ts";
import { handleApplyBaguaJudgementTask, handleResponsePollTask, handleRespondChoice } from "../content/standard/flows/response-flow.ts";
import { handleJiedaoChoice, handleResolveTrickTask, handleTrickTargetTask, handleWuguChoice, handleWuguCleanupTask, handleZoneChoice } from "../content/standard/flows/trick-flow.ts";
import { handleDiscardChoice, handlePhaseDiscardChoice, handlePhaseDiscardNormalTask, handlePhaseDiscardTask, handlePhaseDrawChoice, handlePhaseDrawTask, handlePhaseEndAdvanceTask, handlePhaseEndTask, handlePhaseJudgeTask, handlePhasePlayTask, handlePhaseStartTask } from "../content/standard/flows/turn-flow.ts";
import { ChoiceExecutor } from "../core/choice-executor.ts";
import { ResolutionScheduler } from "../core/resolution-scheduler.ts";
import { type GameState } from "../domain/state.ts";
import { resolutionStack } from '../domain/resolution-stack.ts';

import { DeathFlow } from '../rules/flows/death-flow.ts';
import { ModeRegistry } from '../rules/mode-registry.ts';
import { standardModes } from './standard-modes.ts';

import { TriggerResolver } from '../rules/trigger-resolver.ts';
import { TriggerRegistry } from '../rules/trigger-registry.ts';
import { standardTriggers } from './standard-triggers.ts';
import { ContentRuntime } from '../rules/content-runtime.ts';
import { standardContent } from '../content/standard/content.ts';
import { SkillFlow } from '../rules/flows/skill-flow.ts';
import { JudgementFlow } from '../rules/flows/judgement-flow.ts';
import { DistributionFlow } from '../rules/flows/distribution-flow.ts';
import { DeckReorderFlow } from '../rules/flows/deck-reorder-flow.ts';
import { ProxyResponseFlow } from '../content/standard/flows/proxy-response-flow.ts';
import { responseSuccess } from '../content/standard/flows/response-flow.ts';
import { AttackRedirectFlow } from '../rules/flows/attack-redirect-flow.ts';

export function createStandardResolution(modes: ModeRegistry, triggers: TriggerRegistry = standardTriggers,
  runtime: ContentRuntime = new ContentRuntime(standardContent, triggers)) {
  const resolver = new TriggerResolver(triggers, runtime.abilities, runtime);
  const deaths = new DeathFlow(modes);
  const skills = new SkillFlow(runtime);
  const judgements = new JudgementFlow(runtime);
  const distributions = new DistributionFlow();
  const deckReorders = new DeckReorderFlow();
  const proxies = new ProxyResponseFlow(runtime);
  const redirects = new AttackRedirectFlow(runtime);
  const scheduler = new ResolutionScheduler({
    openTriggers: (s, task) => resolver.open(s, task),
    triggerCollect: s => resolver.collect(s),
    triggerNext: s => resolver.next(s),
    triggerExecute: s => resolver.execute(s),
    attackDamage: handleAttackDamageTask,
    attackPrepare: s => prepareAttack(s, runtime),
    attackLaunch: s => launchAttack(s, runtime),
    damagePropagate: handleDamagePropagationTask,
    fireAttackPay: offerFirePayment,
    equipmentLeft: (s, task) => runtime.content.card(s.cards[task.cid].name).leaveEquipment?.(s, task.owner, task.cid),
    cardUseStart: s => handleCardUseStartTask(s, runtime),
    resolveCardUse: (s, task) => handleResolveCardUseTask(s, task, runtime),
    resolveVirtualTrick: (s, task) => handleResolveVirtualTrickTask(s, task, runtime),
    skillExecute: s => skills.execute(s),
    skillEffect: s => skills.effect(s),
    skillDying: s => {
      const owner = resolutionStack.require(s, 'skill').data.owner;
      if (s.players[owner].alive && s.players[owner].hp <= 0) beginDying(s, owner);
    },
    phaseStartOffer: (s, task) => skills.startOffer(s, task),
    phaseEndOffer: (s, task) => skills.endOffer(s, task),
    phaseEndAdvance: handlePhaseEndAdvanceTask,
    applyStartSkillJudgement: (s, task) => skills.applyStartSkillJudgement(s, task),
    skillSelectCost: s => skills.selectCost(s),
    skillSelectTarget: s => skills.selectTarget(s),
    judgementDraw: s => judgements.draw(s),
    judgementOffer: s => judgements.offer(s),
    judgementFinalize: s => judgements.finalize(s),
    judgementTriggers: s => judgements.after(s),
    distributionPoll: s => distributions.poll(s),
    deckReorderPoll: s => deckReorders.poll(s),
    applyDelayedJudgement: (s, task) => handleApplyDelayedJudgementTask(s, task, runtime),
    applyBaguaJudgement: handleApplyBaguaJudgementTask,
    applyAttackJudgement: (s, task) => skills.applyAttackJudgement(s, task),
    applySkillJudgement: (s, task) => skills.applySkillJudgement(s, task),
    responsePoll: s => handleResponsePollTask(s, runtime),
    proxyResponsePoll: s => proxies.poll(s),
    proxyResponseSuccess: s => responseSuccess(s, resolutionStack.require(s, 'response').data.context),
    damageApply: s => handleDamageApplyTask(s, runtime),
    dyingPoll: s => promptDying(s, runtime),
    nullifyPoll: promptNullify,
    death: (state, task) => deaths.resolve(state, task),
    phaseStart: (s, task) => handlePhaseStartTask(s, task, runtime),
    phaseJudge: handlePhaseJudgeTask,
    phaseDraw: (s, task) => handlePhaseDrawTask(s, task, runtime),
    phasePlay: (s, task) => handlePhasePlayTask(s, task, runtime),
    phaseDiscard: (s, task) => handlePhaseDiscardTask(s, task, runtime),
    phaseDiscardNormal: s => handlePhaseDiscardNormalTask(s, runtime),
    phaseEnd: (s, task) => handlePhaseEndTask(s, task, runtime),
    judgeCard: handleJudgeCardTask,
    resolveJudge: (s, task) => handleResolveJudgeTask(s, task, runtime),
    cancelJudge: handleCancelJudgeTask,
    finishCard: handleFinishCardTask,
    trickTarget: (s, task) => handleTrickTargetTask(s, task, runtime),
    resolveTrick: (s, task) => handleResolveTrickTask(s, task, runtime),
    wuguCleanup: handleWuguCleanupTask,
    shaStart: handleShaStartTask,
    shaRespond: (s, task) => handleShaRespondTask(s, task, runtime),
    shaMiss: handleShaMissTask,
    shaHit: (s, task) => handleShaHitTask(s, task, runtime),
    hanbingPick: handleHanbingPickTask,
  }, (state, beforeEventCount) => {
    if (state.outcome.status !== 'ongoing' || !state.resolution.stack.length) return;
    const hasLossTriggers = runtime.triggers.forEvent('cardsLost').length > 0;
    const movements = state.events.slice(beforeEventCount).filter(event => event.kind === 'cardsMoved').reverse();
    for (const event of movements) {
      if (event.kind !== 'cardsMoved') continue;
      const departures: import('../domain/state.ts').Task[] = [];
      for (const move of event.data.moves) if (move.from.kind === 'equip' &&
        state.players[move.from.owner].alive && runtime.content.card(state.cards[move.card].name).leaveEquipment) {
        departures.push({ kind: 'equipmentLeft', owner: move.from.owner, cid: move.card });
      }
      const losses = new Map<number, { hand: number[]; equip: number[] }>();
      for (const move of event.data.moves) {
        if (move.from.kind !== 'hand' && move.from.kind !== 'equip') continue;
        const owner = move.from.owner;
        const entry = losses.get(owner) ?? { hand: [], equip: [] };
        entry[move.from.kind].push(move.card);
        losses.set(owner, entry);
      }
      for (const [player, loss] of losses) {
        if (!hasLossTriggers || !runtime.abilities.list(state, player).some(skill => skill.trigger?.event === 'cardsLost')) continue;
        resolutionStack.enqueue(state, { kind: 'openTriggers', signal: {
          kind: 'cardsLost', data: { player, ...loss },
        }, then: [] });
      }
      if (departures.length) resolutionStack.enqueue(state, ...departures);
    }
  });
  const choices = new ChoiceExecutor({
    attackPrepare: (s, prompt, data) => chooseAttackPreparation(s, prompt, data, runtime),
    fireAttackReveal: chooseFireReveal,
    fireAttackPay: chooseFirePayment,
    play: (s, prompt, data) => handlePlayChoice(s, prompt, data, runtime),
    skillCost: (s, prompt, data) => skills.costChoice(s, prompt, data),
    skillTarget: (s, prompt, data) => skills.targetChoice(s, prompt, data),
    skillFollowup: (s, prompt, data) => skills.followupChoice(s, prompt, data),
    skillJudgementChoice: (s, prompt, data) => skills.skillJudgementChoice(s, prompt, data),
    phaseStartChoice: (s, prompt, data) => skills.startChoice(s, prompt, data),
    phaseEndChoice: (s, prompt, data) => skills.endChoice(s, prompt, data),
    phaseDiscardChoice: handlePhaseDiscardChoice,
    phaseDrawChoice: (s, prompt, data) => handlePhaseDrawChoice(s, prompt, data, runtime),
    judgeReplace: (s, prompt, data) => judgements.choice(s, prompt, data),
    distribution: (s, prompt, data) => distributions.choice(s, prompt, data),
    deckReorder: (s, prompt, data) => deckReorders.choice(s, prompt, data),
    triggerConfirm: (s, prompt, data) => resolver.confirm(s, prompt, data),
    discard: handleDiscardChoice,
    nullify: handleNullifyChoice,
    dying: (s, prompt, data) => handleDyingChoice(s, prompt, data, runtime),
    respond: (s, prompt, data) => handleRespondChoice(s, prompt, data, runtime),
    proxyResponse: (s, prompt, data) => proxies.choice(s, prompt, data),
    attackRedirect: (s, prompt, data) => redirects.choice(s, prompt, data),
    zone: (s, prompt, data) => handleZoneChoice(s, prompt, data, runtime),
    wugu: (s, prompt, data) => handleWuguChoice(s, prompt, data, runtime),
    jiedao: (s, prompt, data) => handleJiedaoChoice(s, prompt, data, runtime),
    cixiong: handleCixiongChoice,
    cixiongCost: handleCixiongCostChoice,
    qinglong: (s, prompt, data) => handleQinglongChoice(s, prompt, data, runtime),
    guanshi: handleGuanshiChoice,
    hanbing: handleHanbingChoice,
    hanbingPick: handleHanbingPickChoice,
    qilin: handleQilinChoice,
  }, scheduler);
  return { scheduler, choices };
}
export const { scheduler, choices } = createStandardResolution(standardModes);
export const advance = (s: GameState, trace?: TransitionSink<GameState>) => scheduler.advance(s, trace);
export const apply = (s: GameState, id: string, trace?: TransitionSink<GameState>) => choices.apply(s, id, trace);
