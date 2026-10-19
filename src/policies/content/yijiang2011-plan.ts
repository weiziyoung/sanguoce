import { cardTypeOf, equipSlotOf, type Card } from '../../../catalog.ts';
import type { VisiblePlayer } from '../../../contracts.ts';
import { EvaluationContext } from '../evaluation-context.ts';
import { hasPublicAbility } from '../ability-view.ts';
import { attackReach, equipmentLeaveValue, handFee, living, victoryAfterDeath } from './mountain-plan.ts';

export function yijiangCardFee(ctx: EvaluationContext, id: number): number {
  const card = ctx.card(id);
  if (!card) return 100;
  // Wuyan keeps self-use and Wuxie useful; ordinary tricks aimed at others are discard resources.
  if (hasPublicAbility(ctx.self, 'yijiang2011.wuyan') && cardTypeOf(card) === 'trick' &&
    !['wuzhong', 'wuxie', 'taoyuan', 'wugu', 'tiesuo'].includes(card.name)) return 1;
  return handFee(ctx, id) - equipmentLeaveValue(ctx, ctx.self, card);
}

/** A colorless virtual Sha from a publicly known ally, valued from our own perspective. */
export function mingceAttackValue(ctx: EvaluationContext, source: VisiblePlayer, target: VisiblePlayer): number {
  const duel = source.skillState?.['yijiang2011.xianzhen'];
  const ignores = source.equip.weapon?.name === 'qinggang' || hasPublicAbility(source, 'yijiang2011.xianzhen') &&
    duel?.turn === ctx.observation.turn && duel.won && duel.target === target.id;
  if (hasPublicAbility(target, 'standard.kongcheng') && !target.handCount ||
    hasPublicAbility(target, 'yijiang2011.zhichi') && target.skillState?.['yijiang2011.zhichi']?.turn === ctx.observation.turn ||
    target.equip.armor?.name === 'tengjia' && !ignores) return 0;
  let amount = 1 + (source.drunk ?? 0) + (source.equip.weapon?.name === 'guding' && !target.handCount ? 1 : 0);
  if (!ignores && target.equip.armor?.name === 'baiyin' && !hasPublicAbility(source, 'yijiang2011.jueqing')) amount = Math.min(1, amount);
  let hit = Math.pow(1 - ctx.responseRates.shan, target.handCount);
  if (!ignores && (target.equip.armor?.name === 'bagua' || hasPublicAbility(target, 'fire.bazhen') && !target.equip.armor)) hit *= .5;
  const benefit = -ctx.relation(target.id) * (3.5 * amount + (target.hp <= amount ? 3 : 0));
  return hit * (benefit - (ctx.protectsLord(target.id) ? target.hp <= amount ? 80 : 12 : 0));
}

function xuanfengValue(ctx: EvaluationContext, owner: VisiblePlayer): number {
  if (!hasPublicAbility(owner, 'yijiang2011.xuanfeng')) return 0;
  const options = living(ctx).filter(p => p.id !== owner.id).map(p => {
    const sha = mingceAttackValue(ctx, owner, p);
    const damage = ctx.distance(owner.id, p.id) <= 1 ? -ctx.relation(p.id) * (3.5 + (p.hp <= 1 ? 3 : 0)) -
      (ctx.protectsLord(p.id) ? 80 : 0) : 0;
    // Other players choose for their own side; hostile losses can create retaliation.
    return ctx.relation(owner.id) > 0 ? Math.max(sha, damage) : -Math.max(0, -sha, -damage);
  });
  return ctx.relation(owner.id) > 0 ? Math.max(0, ...options) : Math.min(0, ...options);
}

export function equipmentExitValue(ctx: EvaluationContext, owner: VisiblePlayer, cards: readonly Card[]): number {
  return ctx.relation(owner.id) * cards.reduce((n, card) => n + equipmentLeaveValue(ctx, owner, card), 0) +
    (cards.length ? xuanfengValue(ctx, owner) : 0);
}

function loadoutValue(ctx: EvaluationContext, owner: VisiblePlayer, cards: readonly Card[]): number {
  return cards.reduce((n, card) => n + ctx.value(card.id) -
    (equipSlotOf(card) === 'armor' && hasPublicAbility(owner, 'yijiang2011.yizhong') ? 5 : 0), 0);
}
export function ganluValue(ctx: EvaluationContext, first: number, second: number): number {
  const a = ctx.player(first)!, b = ctx.player(second)!;
  const equipment = (p: VisiblePlayer) => Object.values(p.equip).filter((c): c is Card => !!c);
  const ac = equipment(a), bc = equipment(b);
  return ctx.relation(a.id) * (loadoutValue(ctx, a, bc) - loadoutValue(ctx, a, ac)) +
    ctx.relation(b.id) * (loadoutValue(ctx, b, ac) - loadoutValue(ctx, b, bc)) +
    equipmentExitValue(ctx, a, ac) + equipmentExitValue(ctx, b, bc);
}

/** Evaluate each actual bid together with the Sha left after paying it. */
export function xianzhenBidValue(ctx: EvaluationContext, target: VisiblePlayer, bid: Card): number {
  const chance = Math.pow(ctx.deck.filter(c => c.rank < bid.rank).length / ctx.deck.length, Math.max(1, target.handCount));
  const after = ctx.afterSpending([bid.id]);
  const projected = new EvaluationContext({ ...after.observation,
    others: after.observation.others.map(p => p.id === target.id ? { ...p, handCount: Math.max(0, p.handCount - 1) } : p),
    self: { ...after.self, skillState: { ...after.self.skillState,
      'yijiang2011.xianzhen': { turn: ctx.observation.turn, won: true, target: target.id } } } }, ctx.deck);
  const attacks = after.self.hand.filter(c => c.name === 'sha' || c.name === 'jiu' && hasPublicAbility(ctx.self, 'yijiang2011.jinjiu'));
  if (!attacks.length) return -4 - yijiangCardFee(ctx, bid.id) * .4;
  const attackValues = attacks.map(c => Math.max(0, projected.shaEffect(target.id, [c.id])));
  const gained = attackValues.reduce((n, value) => n + value, 0);
  if (!gained) return -4;
  const lostAttack = Math.max(0, ...attacks.flatMap(c => ctx.observation.others.filter(p => attackReach(ctx, p)).map(p => ctx.shaEffect(p.id, [c.id]))));
  // Pindian itself takes an opposing hand card. Failed bids also forfeit ordinary Sha this turn.
  const gain = chance * (gained + 2) - (1 - chance) * (lostAttack + 2) - yijiangCardFee(ctx, bid.id) * .45;
  return gain > 0 ? 6 + gain : gain;
}

/** Consequences of damaging these generals that the basic hit estimate cannot express. */
export function yijiangAttackAdjustment(ctx: EvaluationContext, target: VisiblePlayer, hit: number,
  costs: readonly number[], amount: number, ignoresArmor: boolean): number {
  const absolute = hasPublicAbility(ctx.self, 'yijiang2011.jueqing');
  const actual = !absolute && !ignoresArmor && target.equip.armor?.name === 'baiyin' ? Math.min(1, amount) : amount;
  let score = 0;
  if (hasPublicAbility(target, 'yijiang2011.huilei') && target.hp <= actual && !victoryAfterDeath(ctx, target)) {
    const left = ctx.afterSpending(costs);
    const resources = [...left.self.hand, ...Object.values(left.self.equip).filter((c): c is Card => !!c)];
    score -= hit * Math.min(14, resources.reduce((n, c) => n + left.value(c.id) * .45, 0));
  }
  if (!absolute && hasPublicAbility(target, 'yijiang2011.enyuan') && target.hp > actual) {
    const hearts = ctx.self.hand.filter(c => !costs.includes(c.id) && c.suit === 'heart');
    const hp = ctx.self.hp <= 1 ? 16 : ctx.self.hp <= 2 ? 7 : 4;
    const fee = Math.min(hp, ...hearts.map(c => yijiangCardFee(ctx, c.id) * .6 - ctx.relation(target.id) * 2));
    score -= hit * Math.max(0, fee);
  }
  if (!absolute && hasPublicAbility(target, 'yijiang2011.jiushi') && target.faceDown && target.hp > actual)
    score += hit * ctx.relation(target.id) * 4;
  if (hasPublicAbility(target, 'yijiang2011.shangshi') && target.hp > actual) {
    const before = Math.max(0, target.maxHp - target.hp - target.handCount);
    const after = Math.max(0, target.maxHp - target.hp + actual - target.handCount);
    score += hit * ctx.relation(target.id) * (after - before) * 2;
  }
  return score;
}

const jujianPlans = new WeakMap<EvaluationContext, { ids: number[]; score: number }>();
/** Pick a complete one-to-three-card plan so selection does not greedily consume defenses. */
export function jujianPlan(ctx: EvaluationContext): { ids: number[]; score: number } {
  const cached = jujianPlans.get(ctx);
  if (cached) return cached;
  const friend = Math.max(0, ...ctx.observation.others.filter(p => p.alive).map(p => ctx.relation(p.id)));
  let best = { ids: [] as number[], score: 0 };
  const cards = [...ctx.self.hand, ...Object.values(ctx.self.equip).filter((c): c is Card => !!c)];
  const broadType = (c: Card) => cardTypeOf(c) === 'delay' ? 'trick' : cardTypeOf(c);
  const fees = new Map(cards.map(c => [c.id, yijiangCardFee(ctx, c.id)]));
  const utility = (selected: Card[]) => {
    const heal = ctx.self.hp < ctx.self.maxHp && selected.length === 3 && new Set(selected.map(broadType)).size === 1 ? ctx.self.hp <= 1 ? 12 : 6 : 0;
    const excess = Math.max(0, ctx.self.handCount - ctx.self.hp);
    const overflow = Math.min(excess, selected.filter(c => ctx.self.hand.includes(c)).length);
    const score = friend * selected.length * 2.5 + heal + overflow * .7 - selected.reduce((n, c) => n + fees.get(c.id)! * .65, 0);
    if (score > best.score && friend > 0) best = { ids: selected.map(c => c.id), score };
  };
  for (let i = 0; i < cards.length; i++) {
    utility([cards[i]]);
    for (let j = i + 1; j < cards.length; j++) {
      utility([cards[i], cards[j]]);
      for (let k = j + 1; k < cards.length; k++) utility([cards[i], cards[j], cards[k]]);
    }
  }
  jujianPlans.set(ctx, best);
  return best;
}
