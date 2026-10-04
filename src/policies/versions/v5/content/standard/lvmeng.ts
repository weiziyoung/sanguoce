import type { GeneralEvaluator } from '../../evaluation-registry.ts';
import { crossbowSetup, effectiveName, hasCrossbow } from './common.ts';

export const lvmengEvaluation: GeneralEvaluator = (ctx, decision, _choice, action, score) => {
  const setup = crossbowSetup(ctx, decision, action, score);
  if (decision.kind === 'play' && effectiveName(ctx, action) === 'sha' && !hasCrossbow(ctx)) {
    const finish = score > 0 && action.targets?.some(id =>
      ctx.relation(id) < 0 && ctx.player(id)?.hp === 1 && ctx.player(id)?.handCount === 0);
    return finish ? setup + 5 : -4;
  }
  // A Duel can force a Sha response in our play phase and lose Keji as well.
  if (decision.kind === 'play' && effectiveName(ctx, action) === 'juedou' && !hasCrossbow(ctx) &&
    ctx.self.hand.length > ctx.self.hp) return -3;
  return setup;
};
