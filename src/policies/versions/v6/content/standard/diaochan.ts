import type { SkillEvaluator } from '../../evaluation-registry.ts';

export const lijianEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'play' || action.type !== 'activeSkill' || !action.targets?.length) return undefined;
  return -1.5 * ctx.relation(action.targets[0]) - 2.5 * ctx.relation(action.targets[1]) -
    0.35 * ctx.value(action.ids?.[0]);
};
