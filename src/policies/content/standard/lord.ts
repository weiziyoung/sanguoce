import type { Observation } from '../../../../contracts.ts';
import type { SkillEvaluator } from '../../evaluation-registry.ts';

/** A failed request is retryable after public supporter resources or the turn change. */
export function canRetryLordRequest(obs: Observation, ability: string, group: string): boolean {
  const failure = obs.failedProxyRequests?.find(item => item.ability === ability && item.turn === obs.turn);
  if (!failure) return true;
  const supporters = obs.others.filter(p => p.alive && p.group === group)
    .map(p => ({ id: p.id, handCount: p.handCount,
      equipmentIds: Object.values(p.equip).filter(card => card !== null).map(card => card!.id).sort((a, b) => a - b) }));
  return JSON.stringify(supporters) !== JSON.stringify(failure.supporters);
}

export const lordProxyEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'play' || action.type !== 'proxySha') return undefined;
  const ability = action.ability!;
  if (!canRetryLordRequest(ctx.observation, ability, 'shu')) return -3;
  const supporters = ctx.observation.others.filter(p => p.alive && p.group === 'shu' &&
    p.handCount > 0 && ctx.relation(p.id) >= 0);
  if (!supporters.length) return -3;
  const effect = (action.targets ?? []).reduce((sum, id) => sum + ctx.shaEffect(id, []), 0);
  if (effect <= 0) return -3;
  // Estimate willingness/availability from public counts; never inspect a teammate's hand.
  const chance = Math.min(0.85, supporters.reduce((sum, p) => sum + p.handCount, 0) * 0.2);
  return 3 + effect * chance;
};
