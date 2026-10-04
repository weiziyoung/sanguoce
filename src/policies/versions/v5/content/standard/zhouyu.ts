import type { SkillEvaluator } from '../../evaluation-registry.ts';

export const fanjianEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'play' || action.type !== 'activeSkill' || action.targets?.[0] === undefined) return undefined;
  return -3.5 * ctx.relation(action.targets[0]);
};
