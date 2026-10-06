import type { SkillEvaluator } from '../../evaluation-registry.ts';
import { selected, targetOf } from './common.ts';

export const jieyinEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (action.type === 'beginSkill') return ctx.self.hp < ctx.self.maxHp && ctx.self.hand.length > 2 &&
    ctx.self.hand.filter(card => ctx.value(card.id) < 5).length >= 2 &&
    ctx.observation.others.some(player => player.alive && player.sex === 'male' &&
      player.hp < player.maxHp && ctx.relation(player.id) > 0.4) ? 3 : -5;
  if (decision.kind === 'skillCost') {
    const ids = selected(decision);
    if (action.type === 'cancel') return ids.length ? -10 : 0;
    if (action.type === 'confirm') return ids.length === 2 ? 1 : -10;
    if (action.type === 'toggle') return ids.includes(action.cid!) ? -10 : 5 - ctx.value(action.cid);
  }
  if (decision.kind === 'skillTarget' && targetOf(action) !== undefined) {
    return ctx.relation(targetOf(action)!) * 5 + (ctx.self.hp < ctx.self.maxHp ? 3 : 0);
  }
  return undefined;
};
