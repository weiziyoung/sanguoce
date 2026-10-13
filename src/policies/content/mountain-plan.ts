import { cardTypeOf, equipSlotOf, WEAPON_RANGE, type Card } from '../../../catalog.ts';
import type { VisiblePlayer } from '../../../contracts.ts';
import type { EvaluationContext } from '../evaluation-context.ts';
import { hasPublicAbility, publicAbilities } from '../ability-view.ts';

export const living = (ctx: EvaluationContext) => [ctx.self, ...ctx.observation.others].filter(p => p.alive);

/** A projected death wins only when public roles establish it; unknown seats stay unknown. */
export function victoryAfterDeath(ctx: EvaluationContext, target: VisiblePlayer): boolean {
  const remaining = living(ctx).filter(p => p.id !== target.id);
  if (ctx.observation.mode.id !== 'identity') return remaining.length === 1 && remaining[0].id === ctx.self.id;
  if (ctx.self.role === 'rebel') return target.role === 'lord';
  if (ctx.self.role === 'renegade') return target.role === 'lord' && remaining.length === 1;
  return ['lord', 'loyalist'].includes(ctx.self.role ?? '') && remaining.every(p => p.role === 'lord' || p.role === 'loyalist');
}

/** Values the recipient's use, without asking for their hidden hand. */
export function receivedValue(ctx: EvaluationContext, card: Card, target: VisiblePlayer): number {
  if (card.name === 'tao') return target.hp <= 1 ? 15 : target.hp < target.maxHp ? 10 : 5;
  if (card.name === 'shan') return (target.hp <= 2 ? 9 : 5) + (target.handCount === 0 ? 2 : 0);
  if (cardTypeOf(card) === 'equip') return ctx.value(card.id) + (target.equip[equipSlotOf(card)] ? -2 : 2);
  return ctx.value(card.id);
}

export function handFee(ctx: EvaluationContext, id: number): number {
  const c = ctx.card(id); if (!c) return 100;
  const last = ctx.self.hand.filter(other => other.name === c.name).length <= 1;
  return ctx.value(id) + (last && c.name === 'tao' && ctx.self.hp <= 2 ? 8 : 0) +
    (last && c.name === 'shan' && ctx.self.hp <= 1 ? 3 : 0);
}

export function attackReach(ctx: EvaluationContext, target: VisiblePlayer): boolean {
  return target.id !== ctx.self.id && target.alive && ctx.distance(ctx.self.id, target.id) <= (WEAPON_RANGE[ctx.self.equip.weapon?.name ?? ''] ?? 1) &&
    !(hasPublicAbility(target, 'standard.kongcheng') && !target.handCount);
}

/** Opportunity cost of skipping play, counting only plausible uses and the normal Sha limit. */
export function playOpportunity(ctx: EvaluationContext): number {
  let total = 0;
  const attacks: number[] = [];
  for (const c of ctx.self.hand) {
    if (c.name === 'tao') { if (ctx.self.hp < ctx.self.maxHp) total += ctx.self.hp <= 2 ? 14 : 8; }
    else if (c.name === 'wuzhong') total += 7;
    else if (c.name === 'sha') attacks.push(Math.max(0, ...ctx.observation.others.filter(p => attackReach(ctx, p)).map(p => ctx.shaEffect(p.id, [c.id]))));
    else if (['juedou', 'guohe', 'shunshou', 'huogong', 'lebu', 'bingliang'].includes(c.name)) {
      const targets = ctx.observation.others.filter(p => p.alive && (c.name !== 'shunshou' || ctx.distance(ctx.self.id, p.id) <= 1));
      total += Math.max(0, ...targets.map(p => ctx.targetEffect(c.name, p.id))) * .6;
    } else if (cardTypeOf(c) === 'equip') {
      const old = ctx.self.equip[equipSlotOf(c)]; total += Math.max(0, ctx.value(c.id) - (old ? ctx.value(old.id) : 0));
    }
  }
  const repeat = ctx.self.equip.weapon?.name === 'zhuge' || hasPublicAbility(ctx.self, 'standard.paoxiao');
  return total + (repeat ? attacks.reduce((a, b) => a + b, 0) : Math.max(0, ...attacks));
}

export function extraTurnValue(target: VisiblePlayer): number {
  if (target.faceDown) return .7; // The inserted turn flips them back and is skipped.
  const abilities = publicAbilities(target);
  const skill = abilities.some(a => ['standard.zhiheng', 'standard.rende', 'standard.yingzi', 'forest.haoshi', 'mountain.jixi'].includes(a)) ? 1.5 : 0;
  return (4 + target.handCount * .7 + (target.equip.weapon ? 1 : 0) + skill) *
    (target.judge.some(c => c.name === 'lebu') ? .25 : 1) * (target.judge.some(c => c.name === 'bingliang') ? .7 : 1);
}

export function equipmentLeaveValue(ctx: EvaluationContext, target: VisiblePlayer, card: Card): number {
  if (!Object.values(target.equip).some(c => c?.id === card.id)) return 0;
  return (hasPublicAbility(target, 'standard.xiaoji') ? 3.2 : 0) +
    (card.name === 'baiyin' && target.hp < target.maxHp ? 4 : 0);
}

export function moveBenefit(ctx: EvaluationContext, from: number, to: number, id: number): number {
  const c = ctx.card(id), source = ctx.player(from), target = ctx.player(to);
  if (!c || !source || !target) return -100;
  if (cardTypeOf(c) !== 'equip') {
    const threat = c.name === 'lebu' ? 6 : c.name === 'bingliang' ? 3 : 2;
    return (ctx.relation(from) - ctx.relation(to)) * threat;
  }
  return ctx.relation(to) * receivedValue(ctx, c, target) + ctx.relation(from) *
    (equipmentLeaveValue(ctx, source, c) - ctx.value(id));
}

/** Expected public benefit of a loss on somebody else's turn. Hearts do not become fields. */
export function fieldBenefit(ctx: EvaluationContext, target: VisiblePlayer): number {
  if (!hasPublicAbility(target, 'mountain.tuntian') || target.id === ctx.observation.active) return 0;
  const count = target.piles?.['mountain.tuntian']?.length ?? 0;
  const chance = ctx.deck.filter(c => c.suit !== 'heart').length / ctx.deck.length;
  return chance * (hasPublicAbility(target, 'mountain.jixi') ? 2.5 : count === 2 ? 3 : 1.2);
}

/** Preserve a last field when consuming it removes otherwise reachable theft targets. */
export function fieldSpendCost(ctx: EvaluationContext, spent: readonly number[]): number {
  const fields = ctx.self.piles?.['mountain.tuntian'] ?? [];
  const consumed = fields.filter(c => spent.includes(c.id)).length;
  if (!consumed) return 0;
  const after = ctx.afterSpending(spent);
  const distanceLoss = ctx.observation.others.filter(p => p.alive && ctx.relation(p.id) < 0 &&
    (p.handCount || Object.values(p.equip).some(Boolean)) && ctx.distance(ctx.self.id, p.id) <= 1 && after.distance(ctx.self.id, p.id) > 1).length;
  return .7 * consumed + Math.min(2, distanceLoss) * .8;
}
