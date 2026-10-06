import type { SkillEvaluator } from '../../evaluation-registry.ts';

export const luoyiEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'phaseDrawChoice' || action.type !== 'skill') return undefined;
  const attacks = ctx.self.hand.filter(card => card.name === 'sha' || card.name === 'juedou').length;
  const enemy = ctx.bestOpponent();
  return attacks && enemy && ctx.relation(enemy.id) < -0.3 ? 2.5 + Math.min(attacks, 2) : -1;
};
