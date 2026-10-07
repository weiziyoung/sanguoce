import { cardTypeOf, equipSlotOf, type Card } from '../../../../../../catalog.ts';
import type { VisiblePlayer } from '../../../../../../contracts.ts';
import type { EvaluationContext } from '../../evaluation-context.ts';
import type { SkillEvaluator } from '../../evaluation-registry.ts';
import { publicRelationships } from '../../public-relationships.ts';
import { hasCrossbow, inAttackReach, selected, targetOf } from './common.ts';

function retention(ctx: EvaluationContext, card: Card): number {
  const copies = ctx.self.hand.filter(other => other.name === card.name).sort((a, b) => a.id - b.id);
  const first = copies[0].id === card.id;
  // Keep a basic defense and a usable wine attack; the remaining cards can still support allies.
  if (card.name === 'shan') return first ? Infinity : ctx.self.hp <= 2 && copies[1]?.id === card.id ? 9 : 2;
  if (card.name === 'tao' && first && ctx.self.hp < ctx.self.maxHp) return Infinity;
  if (card.name === 'wuxie') return first ? 7 : 2;
  if (card.name === 'sha') {
    const repeat = hasCrossbow(ctx) || ctx.self.general === 'standard.zhangfei';
    const usable = (ctx.observation.shaUsed === 0 || repeat) && ctx.observation.others.some(player =>
      player.alive && ctx.relation(player.id) < 0 && inAttackReach(ctx, player) &&
      ctx.shaEffect(player.id, [card.id], card.nature) > 0);
    if (usable && (first || repeat)) return ctx.self.drunk ? Infinity : 10;
    return 2;
  }
  return ctx.value(card.id);
}
function benefit(player: VisiblePlayer, card: Card): number {
  if (card.name === 'tao') return player.hp < player.maxHp ? player.hp <= 1 ? 7 : 4 : 1;
  if (card.name === 'shan') return player.hp <= 2 ? 4 : 2;
  if (card.name === 'sha') return player.judge.some(item => item.name === 'lebu') ? 0 : 2;
  if (cardTypeOf(card) === 'equip') return player.equip[equipSlotOf(card)!] ? 1 : 3;
  return 1.5;
}
function recipients(ctx: EvaluationContext) {
  if (ctx.observation.mode.id !== 'identity') return [];
  return publicRelationships(ctx.observation).filter(row => row.player.id !== ctx.self.id &&
    row.player.alive && row.hate < 0 &&
    // Keep publicly known opposing roles out even if a short-term favor lowered their hate.
    (!row.player.role || ctx.relation(row.player.id) > 0))
    .map(row => ({ player: row.player, trust: Math.min(1, -row.hate) }));
}
function giftUtility(player: VisiblePlayer, trust: number, cards: readonly Card[]): number {
  // Adding a card removes Kongcheng protection. Avoid gratuitous gifts to an empty Zhuge Liang.
  if (player.general === 'standard.zhugeliang' && player.handCount === 0) return -Infinity;
  return cards.reduce((sum, card, index) => sum + trust * (1.6 + benefit(player, card)) -
    0.6 * Math.max(0, player.handCount + index + 1 - player.hp), 0);
}
function plan(ctx: EvaluationContext): { ids: number[]; score: number } | undefined {
  const values = new Map(ctx.self.hand.map(card => [card.id, retention(ctx, card)]));
  const count = ctx.observation.skillProgress?.find(item => item.ability === 'standard.rende')?.count ?? 0;
  const needed = ctx.self.hp < ctx.self.maxHp && count < 2 ? 2 - count : Infinity;
  let best: { ids: number[]; score: number } | undefined;
  for (const { player, trust } of recipients(ctx)) {
    const cards = ctx.self.hand.filter(card => Number.isFinite(values.get(card.id)!))
      .sort((a, b) => values.get(a.id)! - trust * benefit(player, a) -
        (values.get(b.id)! - trust * benefit(player, b)) || a.id - b.id);
    for (let size = 1; size <= cards.length; size++) {
      const batch = cards.slice(0, size);
      const heals = size >= needed;
      // The heal also increases the hand limit, so don't count that card as forced discard.
      const overflow = Math.max(0, ctx.self.hand.length - ctx.self.hp - (heals ? 1 : 0));
      const loss = batch.reduce((sum, card, index) => sum + values.get(card.id)! *
        (index < overflow ? 0.1 : 0.7), 0);
      const score = giftUtility(player, trust, batch) - loss + (heals ? ctx.self.hp <= 1 ? 8 : 5 : 0) - 0.6;
      if (score > 0 && (!best || score > best.score)) best = { ids: batch.map(card => card.id), score };
    }
  }
  return best;
}

/** Transfer useful surplus before discarding; a two-card heal is part of the same plan. */
export const rendeEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind === 'skillTarget') {
    const target = recipients(ctx).find(row => row.player.id === targetOf(action));
    if (!target) return -100;
    return giftUtility(target.player, target.trust, selected(decision).flatMap(id => {
      const card = ctx.card(id); return card ? [card] : [];
    }));
  }
  const gifts = plan(ctx);
  if (action.type === 'beginSkill') return gifts ? Math.min(ctx.self.hp <= 1 ? 11 : 7.5, 1 + gifts.score) : -4;
  if (decision.kind === 'skillCost') {
    const ids = selected(decision);
    if (action.type === 'cancel') return ids.length ? -10 : 0;
    if (action.type === 'confirm') return ids.length && (!gifts || gifts.ids.every(id => ids.includes(id))) ? 2 : -1;
    if (action.type === 'toggle') return ids.includes(action.cid!) ? -10 :
      gifts?.ids.includes(action.cid!) ? 3 + (gifts.ids.length - gifts.ids.indexOf(action.cid!)) / 100 : -5;
  }
  return undefined;
};
