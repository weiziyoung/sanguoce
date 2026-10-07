import { cardColor, cardTypeOf, equipSlotOf, type Card } from '../../../../../../catalog.ts';
import type { EvaluationContext } from '../../evaluation-context.ts';
import type { GeneralEvaluator, SkillEvaluator } from '../../evaluation-registry.ts';
import { costsOf, effectiveName, hasCrossbow, inAttackReach, usefulOptionalSkill, visibleDistance } from './common.ts';

/** Approximate spendability, using only visible cards and public targets. */
function spendValue(ctx: EvaluationContext, card: Card): number {
  if (card.name === 'shandian') return ctx.value(card.id);
  if (card.name === 'shan' || card.name === 'wuxie') return 0;
  if (card.name === 'tao') return ctx.self.hp < ctx.self.maxHp ? 9 : 0;
  if (cardTypeOf(card) === 'equip') return 7 + ctx.value(card.id) / 10;
  const enemies = ctx.observation.others.filter(player => player.alive && ctx.relation(player.id) < 0);
  if (card.name === 'sha') {
    if (!hasCrossbow(ctx) && ctx.observation.active === ctx.self.id &&
      ctx.observation.phase === 'play' && ctx.observation.shaUsed > 0) return 0;
    const held = ctx.self.hand.filter(other => other.name === 'sha');
    const earlier = ctx.observation.table.some(other => other.name === 'sha' && other.id < card.id);
    return enemies.some(enemy => inAttackReach(ctx, enemy) &&
      (enemy.equip.armor?.name !== 'renwang' || cardColor(card) !== 'black' ||
        ctx.self.equip.weapon?.name === 'qinggang')) &&
      (hasCrossbow(ctx) || (!held.length && !earlier)) ? 6 : 0;
  }
  if (card.name === 'juedou') return enemies.some(enemy =>
    enemy.general !== 'standard.zhugeliang' || enemy.handCount > 0) ? 7 : 0;
  if (card.name === 'lebu') return enemies.some(enemy => enemy.general !== 'standard.luxun' &&
    !enemy.judge.some(item => item.name === 'lebu')) ? 7 : 0;
  if (card.name === 'jiedao') return enemies.some(enemy => enemy.equip.weapon) ? 6 : 0;
  if (card.name === 'guohe' || card.name === 'shunshou') return enemies.some(enemy =>
    (card.name !== 'shunshou' || (visibleDistance(ctx, enemy) <= 1 && enemy.general !== 'standard.luxun')) &&
    (enemy.handCount || Object.values(enemy.equip).some(Boolean) || enemy.judge.length)) ? 7 : 0;
  if (card.name === 'taoyuan') return ctx.self.hp < ctx.self.maxHp ? 8 : 2;
  if (card.name === 'wugu') return 2;
  return Math.max(5, ctx.value(card.id));
}

export const guanxingEvaluation: SkillEvaluator = (ctx, decision, choice, action) => {
  if (decision.kind !== 'deckReorder') return usefulOptionalSkill(ctx, decision, choice, action);
  const card = ctx.card(action.card);
  if (!card) return -10;
  const value = spendValue(ctx, card);
  // Lower-value top cards go first; the last top placement is drawn first.
  return action.side === 'bottom' ? (value < 4 ? 10 - value : -5) : 3 - value / 10;
};

export const zhugeliangEvaluation: GeneralEvaluator = (ctx, decision, _choice, action, score) => {
  if (score <= -100) return score;
  if (action.type === 'recast') return score;
  const card = ctx.card(action.cid);
  if (decision.kind === 'wugu' && card) return spendValue(ctx, card);
  const spent = costsOf(action).filter(id => ctx.self.hand.some(item => item.id === id)).length;
  const empty = spent > 0 && spent === ctx.self.hand.length;
  if ((decision.kind === 'respond' || decision.kind === 'nullify') && empty && score > 0) return score + 6;
  if (decision.kind !== 'play' || !spent) return score;
  const name = effectiveName(ctx, action);
  // These plays can refill the hand, so do not count them as reaching Kongcheng.
  if (['wuzhong', 'wugu', 'shunshou', 'jiedao'].includes(name ?? '')) return score;
  if (card && cardTypeOf(card) === 'equip') {
    // Clear equipment during play; discard cannot later equip the retained card.
    // Preserve an active Crossbow until its remaining attacks have been spent.
    const replacingCrossbow = equipSlotOf(card) === 'weapon' && hasCrossbow(ctx) &&
      card.name !== 'zhuge' && ctx.self.hand.filter(item => item.name === 'sha').length > 1 &&
      ctx.observation.others.some(enemy => enemy.alive && ctx.relation(enemy.id) < 0 && inAttackReach(ctx, enemy));
    if (replacingCrossbow) return score;
    return Math.max(empty ? 3 : 0.5, score + (empty ? 6 : 1));
  }
  if (score > 0) return score + (empty ? 6 : 1);
  return score;
};
