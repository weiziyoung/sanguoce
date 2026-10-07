import type { Choice, Decision } from '../../../../../contracts.ts';
import type { EvaluationContext } from '../evaluation-context.ts';
import type { ScoredAction, SkillEvaluator } from '../evaluation-registry.ts';

const costs = (action: ScoredAction): number[] => action.ids ?? (action.cid === undefined ? [] : [action.cid]);
function attacks(ctx: EvaluationContext, candidates: readonly Choice[], spent: number,
  useful: (choice: Choice) => boolean): ScoredAction[] {
  return candidates.filter(choice => {
    const option = choice.data as ScoredAction;
    return option && (option.type === 'virtualSha' || option.type === 'play' && ctx.card(option.cid)?.name === 'sha') &&
      !costs(option).includes(spent) && useful(choice);
  }).map(choice => choice.data as ScoredAction);
}
function attackScore(ctx: EvaluationContext, attack: ScoredAction,
  plan: { extraWine?: number; linked?: readonly number[] } = {}): number {
  return (attack.targets ?? []).reduce((sum, id) => sum +
    ctx.shaEffect(id, costs(attack), attack.type === 'virtualSha' ? 'normal' : undefined, plan), 0);
}

/** A small usable expansion policy, based only on public states and own costs. */
export function militaryPlayScore(ctx: EvaluationContext, action: ScoredAction, candidates: readonly Choice[],
  usefulAttack: (choice: Choice) => boolean): number | undefined {
  const card = ctx.card(action.cid);
  if (action.type === 'recast') return 1.2;
  if (!card || action.type !== 'play') return undefined;
  const targets = action.targets ?? [];
  if (card.name === 'tengjia' && ctx.value(card.id) <= 0.5) return -100;
  if (card.name === 'jiu') {
    const gains = attacks(ctx, candidates, card.id, usefulAttack).map(attack => {
      const before = attackScore(ctx, attack);
      const after = attackScore(ctx, attack, { extraWine: 1 });
      return after > 0 ? after - before : 0;
    });
    const best = Math.max(0, ...gains);
    return best > 0.01 ? 8 + best : -3;
  }
  if (card.name === 'huogong') {
    const target = targets[0];
    if (target === undefined) return -3;
    const benefit = ctx.elementalUtility(target, 1, 'fire');
    const fees = ctx.self.hand.filter(item => item.id !== card.id && benefit - 0.4 * ctx.value(item.id) > 0);
    const suits = new Set(fees.map(item => item.suit));
    // The target chooses the reveal: one uncovered suit is enough to defeat us.
    const chance = target === ctx.self.id ? (suits.size ? 1 : 0) :
      Math.pow(suits.size / 4, ctx.player(target)?.handCount ?? 0);
    const worstFee = Math.max(0, ...[...suits].map(suit =>
      Math.min(...fees.filter(item => item.suit === suit).map(item => ctx.value(item.id)))));
    const gain = chance * (benefit - 0.4 * worstFee) - 0.4 * ctx.value(card.id);
    return gain > 0 ? ctx.order(card.name) + gain : -3;
  }
  if (card.name === 'tiesuo') {
    const linked = [ctx.self, ...ctx.observation.others].filter(player => player.alive &&
      (targets.includes(player.id) ? !player.chained : player.chained)).map(player => player.id);
    let benefit = targets.reduce((sum, id) => sum + ctx.chainUtility(id, linked), 0);
    const followups = attacks(ctx, candidates, card.id, usefulAttack);
    const before = Math.max(0, ...followups.map(attack => attackScore(ctx, attack)));
    const after = Math.max(0, ...followups.map(attack => attackScore(ctx, attack, { linked })));
    benefit += Math.max(0, after - before);
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
