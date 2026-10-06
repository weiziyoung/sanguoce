import type { Choice, Decision } from '../../../../../contracts.ts';
import type { EvaluationContext } from '../evaluation-context.ts';
import type { ScoredAction, SkillEvaluator } from '../evaluation-registry.ts';

/** A small usable expansion policy, based only on public states and own costs. */
export function militaryPlayScore(ctx: EvaluationContext, action: ScoredAction, candidates: readonly Choice[]): number | undefined {
  const card = ctx.card(action.cid);
  if (action.type === 'recast') return 1.2;
  if (!card || action.type !== 'play') return undefined;
  const targets = action.targets ?? [];
  if (card.name === 'jiu') {
    const attacks = candidates.map(choice => choice.data as ScoredAction).filter(option =>
      option.type === 'virtualSha' || option.type === 'play' && ctx.card(option.cid)?.name === 'sha');
    const best = Math.max(0, ...attacks.map(option => (option.targets ?? []).reduce((sum, id) =>
      sum + ctx.shaEffect(id, option.ids ?? (option.cid ? [option.cid] : []), option.type === 'virtualSha' ? 'normal' : undefined), 0)));
    return best > 0 ? 8 + best : -3;
  }
  if (card.name === 'huogong') {
    const target = targets[0];
    const suits = new Set(ctx.self.hand.filter(item => item.id !== card.id).map(item => item.suit));
    const chance = target === ctx.self.id ? (suits.size ? 1 : 0) : suits.size / 4;
    const benefit = target === undefined ? 0 : ctx.elementalUtility(target, 1, 'fire') * chance;
    return benefit > 0 ? 4 + benefit - 0.4 * ctx.value(card.id) : -3;
  }
  if (card.name === 'tiesuo') {
    const benefit = targets.reduce((sum, id) => sum + ctx.chainUtility(id), 0);
    return benefit > 0 ? 2 + benefit : -3;
  }
  return undefined;
}

export const fanPreparationEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'attackPrepare') return undefined;
  const data = decision.context as { targets: number[]; damageBonus?: number };
  const delta = data.targets.reduce((sum, id) => sum +
    ctx.elementalUtility(id, 1 + (data.damageBonus ?? 0), 'fire') - ctx.elementalUtility(id, 1 + (data.damageBonus ?? 0), 'normal'), 0);
  return action.type === 'yes' ? delta : 0;
};

export function militaryChoiceScore(ctx: EvaluationContext, decision: Decision, action: ScoredAction): number | undefined {
  if (decision.kind === 'fireAttackReveal') {
    const suit = ctx.card(action.cid)?.suit;
    return suit ? ctx.self.hand.filter(card => card.suit === suit).length : 0;
  }
  if (decision.kind === 'fireAttackPay') {
    if (action.type === 'pass') return 0;
    const { target } = decision.context as { target: number };
    return ctx.elementalUtility(target, 1, 'fire') - 0.4 * ctx.value(action.cid);
  }
  return undefined;
}
