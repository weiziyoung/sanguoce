import type { SkillEvaluator } from '../../evaluation-registry.ts';

export const tuxiEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'phaseDrawChoice' || action.type !== 'skill') return undefined;
  return (action.choice?.split(':') ?? []).reduce((total, id) => {
    const target = ctx.player(Number(id));
    return total + (target ? 1.4 - 1.5 * ctx.relation(target.id) : 0);
  }, 0);
};
