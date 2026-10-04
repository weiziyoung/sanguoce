import type { GeneralEvaluator, SkillEvaluator } from '../../evaluation-registry.ts';
import { crossbowSetup, hasCrossbow, inAttackReach } from './common.ts';

export const kurouEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'play' || action.type !== 'activeSkill') return undefined;
  if (ctx.self.hp <= 1) return -20;
  const enemy = ctx.observation.others.some(player => player.alive &&
    ctx.relation(player.id) < -0.3 && inAttackReach(ctx, player));
  return hasCrossbow(ctx) && enemy ? 4.5 : -3;
};

export const huanggaiEvaluation: GeneralEvaluator = (ctx, decision, _choice, action, score) =>
  crossbowSetup(ctx, decision, action, score);
