import type { SkillEvaluator } from '../../evaluation-registry.ts';
import { selected, targetOf } from './common.ts';

/** 仁德: transfer surplus to an ally; no speculative gifts to hidden roles. */
export const rendeEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  const friendly = ctx.observation.others.some(player => player.alive && ctx.relation(player.id) > 0.5);
  if (action.type === 'beginSkill') return friendly && ctx.self.hand.length > 1 &&
    ctx.self.hand.some(card => ctx.value(card.id) < 4.5) ? 2 : -4;
  if (decision.kind === 'skillCost') {
    const ids = selected(decision);
    if (action.type === 'cancel') return ids.length ? -10 : 0;
    if (action.type === 'confirm') return ids.length ? 0.5 : -10;
    if (action.type === 'toggle') return ids.includes(action.cid!) ? -10 : 4.5 - ctx.value(action.cid);
  }
  if (decision.kind === 'skillTarget' && targetOf(action) !== undefined) return ctx.relation(targetOf(action)!) * 5;
  return undefined;
};
