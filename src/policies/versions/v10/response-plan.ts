import type { Choice, Decision } from '../../../../contracts.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import type { ScoredAction } from './evaluation-registry.ts';

/** Can this paid response finish the current window without reusing its costs? */
export function canCompleteResponse(ctx: EvaluationContext, decision: Decision,
  action: ScoredAction, candidates: readonly Choice[]): boolean {
  const remaining = (decision.context as { remaining?: number } | undefined)?.remaining ?? 1;
  if (decision.kind !== 'respond' || action.type !== 'respond' || remaining <= 1) return true;
  const responses = candidates.map(choice => choice.data as ScoredAction)
    .filter(option => option?.type === 'respond' && option.ids?.length);
  const weapon = ctx.self.equip.weapon;
  const finish = (paid: ScoredAction, used: Set<number>, count: number): boolean => {
    const ids = paid.ids ?? [];
    if (!ids.length || ids.some(id => used.has(id))) return false;
    // Spending the spear through Wusheng removes its later two-card conversion.
    if (ids.length > 1 && !paid.transformation && weapon?.name === 'zhangba' && used.has(weapon.id)) return false;
    const spent = new Set([...used, ...ids]);
    if (count === 1) return true;
    // Lianying draws after the last hand card is lost, before the next response.
    // It offers a real continuation; do not inspect or assume the hidden draw.
    if (ctx.self.general === 'standard.luxun' && ctx.self.hand.length > 0 &&
      ctx.self.hand.every(card => spent.has(card.id))) return true;
    return responses.some(next => finish(next, spent, count - 1));
  };
  return finish(action, new Set(), remaining);
}
