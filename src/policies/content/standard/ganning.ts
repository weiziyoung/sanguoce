import { cardTypeOf, equipSlotOf, type Card } from '../../../../catalog.ts';
import type { VisiblePlayer } from '../../../../contracts.ts';
import type { EvaluationContext } from '../../evaluation-context.ts';
import type { GeneralEvaluator } from '../../evaluation-registry.ts';
import { effectiveName } from './common.ts';

function equipmentPriority(card: Card, owner: VisiblePlayer): number {
  if (cardTypeOf(card) === 'equip') {
    const slot = equipSlotOf(card);
    if (slot === 'plusHorse') return 13;
    if (slot === 'armor') return card.name === 'bagua' || card.name === 'renwang' ? 12 : 11;
    if (slot === 'minusHorse') return 11;
    if (card.name === 'zhuge') return owner.handCount >= 2 ? 10 : 7;
    return card.name === 'qinggang' ? 7 : 6;
  }
  return 0;
}

function bestPublicTarget(ctx: EvaluationContext, targetId: number | undefined): number {
  const target = targetId === undefined ? undefined : ctx.player(targetId);
  if (!target?.alive) return 0;
  if (ctx.relation(target.id) < 0) {
    return Math.max(0, ...Object.values(target.equip).filter((card): card is Card => !!card)
      .map(card => equipmentPriority(card, target)));
  }
  return target.judge.some(card => card.name === 'lebu' || card.name === 'shandian') ? 8 : 0;
}

function qixiCost(ctx: EvaluationContext, id: number | undefined): number {
  const card = ctx.card(id);
  if (!card) return 100;
  if (Object.values(ctx.self.equip).some(equipped => equipped?.id === id)) return 25;
  let cost = 0.6 * ctx.value(id);
  if (card.name === 'shan' && ctx.self.hand.filter(other => other.name === 'shan').length <= 1) cost += 7;
  if (card.name === 'wuxie' && ctx.self.hand.filter(other => other.name === 'wuxie').length <= 1) cost += 5;
  if (cardTypeOf(card) === 'equip' && !ctx.self.equip[equipSlotOf(card)]) cost += 8;
  return cost;
}

/** Save black cards until a visible key card makes Qixi worth spending. */
export const ganningEvaluation: GeneralEvaluator = (ctx, decision, _choice, action, score) => {
  if (decision.kind === 'play' && effectiveName(ctx, action) === 'guohe') {
    const priority = bestPublicTarget(ctx, action.targets?.[0]);
    if (!priority) return -2;
    if (action.type === 'virtualTrick' && action.transformation === 'standard.qixi') {
      return 8 + priority - qixiCost(ctx, action.ids?.[0]);
    }
    return Math.max(score, 8 + priority);
  }
  if (decision.kind === 'zone' && action.type === 'zone' &&
      (decision.context as { cname?: string } | undefined)?.cname === 'guohe') {
    const targetId = (decision.context as { target?: number }).target;
    const target = targetId === undefined ? undefined : ctx.player(targetId);
    if (!target || ctx.relation(target.id) >= 0) return score;
    if (action.zone === 'hand') return 1;
    const card = ctx.card(action.cid);
    return card && action.zone === 'equip' ? 5 + equipmentPriority(card, target) : score;
  }
  return score;
};
