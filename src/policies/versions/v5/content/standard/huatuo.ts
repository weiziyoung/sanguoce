import type { SkillEvaluator } from '../../evaluation-registry.ts';
import { missingHp, targetOf } from './common.ts';

export const qingnangEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'play' || action.type !== 'activeSkill' || targetOf(action) === undefined) return undefined;
  const target = targetOf(action)!;
  return missingHp(ctx, target) ? 3 + 5 * ctx.relation(target) - 0.45 * ctx.value(action.ids?.[0]) : -10;
};
