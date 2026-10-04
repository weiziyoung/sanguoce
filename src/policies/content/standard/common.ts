import type { Decision, VisiblePlayer } from '../../../../contracts.ts';
import { cardTypeOf, equipSlotOf, WEAPON_RANGE } from '../../../../catalog.ts';
import type { ScoredAction, SkillEvaluator } from '../../evaluation-registry.ts';
import type { EvaluationContext } from '../../evaluation-context.ts';

export const selected = (decision: Decision): number[] => {
  const ids = (decision.context as { selectedIds?: unknown } | undefined)?.selectedIds;
  return Array.isArray(ids) && ids.every(Number.isInteger) ? ids : [];
};
export const targetOf = (action: ScoredAction) => action.targets?.[0];
export const missingHp = (ctx: EvaluationContext, target: number) => {
  const player = ctx.player(target);
  return player ? Math.max(0, player.maxHp - player.hp) : 0;
};
export const usefulOptionalSkill: SkillEvaluator = (_ctx, decision, _choice, action) => {
  if (decision.kind === 'phaseStartChoice' || decision.kind === 'phaseEndChoice' ||
      decision.kind === 'triggerConfirm') return action.type === 'yes' ? 3 : 0;
  return undefined;
};

export const costsOf = (action: ScoredAction): number[] => action.ids ??
  (action.cid === undefined ? [] : [action.cid]);
export const effectiveName = (ctx: EvaluationContext, action: ScoredAction): string | undefined =>
  action.type === 'virtualSha' ? 'sha' : action.cname ?? ctx.card(action.cid)?.name;
export const hasCrossbow = (ctx: EvaluationContext): boolean => ctx.self.equip.weapon?.name === 'zhuge';

/** Public-seat estimate for future attacks; the engine still owns action legality. */
export function visibleDistance(ctx: EvaluationContext, target: VisiblePlayer): number {
  const seats = [ctx.self, ...ctx.observation.others].filter(player => player.alive).sort((a, b) => a.id - b.id);
  const apart = Math.abs(seats.findIndex(player => player.id === ctx.self.id) -
    seats.findIndex(player => player.id === target.id));
  return Math.max(1, Math.min(apart, seats.length - apart) +
    (target.equip.plusHorse ? 1 : 0) - (ctx.self.equip.minusHorse ? 1 : 0));
}
export function inAttackReach(ctx: EvaluationContext, target: VisiblePlayer): boolean {
  return visibleDistance(ctx, target) <= (WEAPON_RANGE[ctx.self.equip.weapon?.name ?? ''] ?? 1) &&
    !(target.general === 'standard.zhugeliang' && target.handCount === 0);
}

/** Shared acquisition plan for the generals that wait for Crossbow bursts. */
export function crossbowSetup(ctx: EvaluationContext, decision: Decision, action: ScoredAction,
  score: number): number {
  const card = ctx.card(action.cid);
  if (decision.kind === 'play' && action.type === 'play' && card && cardTypeOf(card) === 'equip') {
    if (card.name === 'zhuge') return hasCrossbow(ctx) ? -3 : 16;
    if (equipSlotOf(card) === 'weapon' && hasCrossbow(ctx)) return -5;
  }
  if (hasCrossbow(ctx)) return score;
  if (decision.kind === 'wugu' && card?.name === 'zhuge') return 15;
  if (decision.kind === 'play' && effectiveName(ctx, action) === 'shunshou') {
    const target = ctx.player(action.targets?.[0] ?? -1);
    if (target?.equip.weapon?.name === 'zhuge' && ctx.relation(target.id) < 0) return score + 10;
  }
  const prompt = decision.context as { cname?: string; target?: number } | undefined;
  if (decision.kind === 'zone' && prompt?.cname === 'shunshou' && card?.name === 'zhuge' &&
    prompt.target !== undefined && ctx.relation(prompt.target) < 0) return 15;
  return score;
}
