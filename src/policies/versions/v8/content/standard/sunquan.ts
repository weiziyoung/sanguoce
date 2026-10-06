import { cardTypeOf, equipSlotOf, type Card } from '../../../../../../catalog.ts';
import type { EvaluationContext } from '../../evaluation-context.ts';
import type { GeneralEvaluator, SkillEvaluator } from '../../evaluation-registry.ts';
import { effectiveName, hasCrossbow, selected } from './common.ts';

const building = (ctx: EvaluationContext) => Object.values(ctx.self.equip).filter(Boolean).length < 3;

/** Retention for cycling: installed/new-slot equipment and useful tricks survive. */
function retention(ctx: EvaluationContext, card: Card): number {
  const earlier = ctx.self.hand.filter(other => other.name === card.name && other.id < card.id).length;
  if (cardTypeOf(card) === 'equip') {
    if (card.name === 'tengjia' && ctx.value(card.id) <= 0.5) return 1;
    if (Object.values(ctx.self.equip).some(equipped => equipped?.id === card.id)) return 12;
    const equipped = ctx.self.equip[equipSlotOf(card)];
    return !equipped || ctx.value(card.id) > ctx.value(equipped.id) + 0.5 ? 10 : 1;
  }
  if (card.name === 'shandian') return 0;
  if (card.name === 'sha') return hasCrossbow(ctx) ? 7 : 2;
  if (card.name === 'tao') return earlier && ctx.self.hp === ctx.self.maxHp && !building(ctx) ? 3 : 10;
  if (card.name === 'shan') return earlier < (ctx.self.hp <= 2 ? 2 : 1) ? 9 : 3;
  if (card.name === 'wuxie') return earlier ? 3 : 7;
  if (card.name === 'wugu') return 3;
  if (card.name === 'taoyuan') return ctx.self.hp < ctx.self.maxHp ? 8 : 2;
  if (card.name === 'jiedao') return ctx.observation.others.some(player =>
    player.alive && player.equip.weapon && ctx.relation(player.id) < 0) ? 6 : 2;
  return Math.max(6, ctx.value(card.id));
}

export const zhihengEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (action.type === 'beginSkill') {
    const cards = [...ctx.self.hand, ...Object.values(ctx.self.equip).filter((card): card is Card => !!card)];
    return cards.some(card => retention(ctx, card) < 4.6) ? (building(ctx) ? 7 : 3.5) : -3;
  }
  if (decision.kind !== 'skillCost') return undefined;
  const ids = selected(decision);
  if (action.type === 'cancel') return ids.length ? -10 : 0;
  if (action.type === 'confirm') return ids.length ? 0.4 : -10;
  if (action.type === 'toggle') {
    const card = ctx.card(action.cid);
    return !card || ids.includes(card.id) ? -10 : 5 - retention(ctx, card);
  }
  return undefined;
};

export const sunquanEvaluation: GeneralEvaluator = (ctx, decision, _choice, action, score) => {
  if (decision.kind !== 'play') return score;
  const card = ctx.card(action.cid);
  if (action.type === 'play' && card && cardTypeOf(card) === 'equip' && !ctx.self.equip[equipSlotOf(card)])
    return score + 8;
  if (building(ctx) && !hasCrossbow(ctx) && effectiveName(ctx, action) === 'sha' && score > 0) {
    const finish = action.targets?.some(id => ctx.player(id)?.hp === 1 && ctx.player(id)?.handCount === 0);
    return finish ? score + 5 : 1;
  }
  return score;
};
