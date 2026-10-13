import { hasPublicAbility } from '../ability-view.ts';
import type { VisiblePlayer } from '../../../contracts.ts';
import type { EvaluationContext } from '../evaluation-context.ts';
import type { EvaluationRegistry, SkillEvaluator } from '../evaluation-registry.ts';
const living = (ctx: EvaluationContext) => [ctx.self, ...ctx.observation.others].filter(p => p.alive);
const lost = (p: VisiblePlayer) => Math.max(0, p.maxHp - p.hp);
const ownCards = (ctx: EvaluationContext) => [...ctx.self.hand, ...Object.values(ctx.self.equip).filter(Boolean)].map(c => c!.id);
const discardCost = (ctx: EvaluationContext, id: number) => ctx.value(id) -
  (ctx.self.equip.armor?.id === id && ctx.self.equip.armor.name === 'baiyin' && lost(ctx.self) > 0 ? 4 : 0) -
  (hasPublicAbility(ctx.self, 'standard.xiaoji') && Object.values(ctx.self.equip).some(c => c?.id === id) ? 3.2 : 0);
const feeValue = (ctx: EvaluationContext, count: number) => ownCards(ctx).map(id => discardCost(ctx, id)).sort((a, b) => a - b).slice(0, count).reduce((a, b) => a + b, 0);
function exchange(ctx: EvaluationContext, a: VisiblePlayer, b: VisiblePlayer) {
  const count = Math.abs(a.handCount - b.handCount);
  return { a: a.id, b: b.id, count,
    gain: (ctx.relation(a.id) - ctx.relation(b.id)) * (b.handCount - a.handCount) * 1.6 - feeValue(ctx, count) * 0.65 };
}
function bestExchange(ctx: EvaluationContext) {
  const others = living(ctx).filter(p => p.id !== ctx.self.id);
  return others.flatMap((a, i) => others.slice(i + 1).map(b => exchange(ctx, a, b)))
    .filter(p => p.count <= ownCards(ctx).length).sort((a, b) => b.gain - a.gain)[0];
}
const dimeng: SkillEvaluator = (ctx, d, _choice, a) => {
  const best = bestExchange(ctx);
  if (!best) return a.type === 'cancel' ? 0 : -100;
  if (d.kind === 'play') return best.gain > 0 ? 6 + best.gain : -4;
  if (d.kind === 'skillCost') {
    const selected = (d.context as { selectedIds: number[] }).selectedIds;
    if (a.type === 'cancel') return best.gain <= 0 ? 1 : -100;
    if (a.type === 'confirm') return selected.length === best.count ? 50 : -50;
    return selected.includes(a.cid!) || selected.length >= best.count ? -100 : 10 - discardCost(ctx, a.cid!);
  }
  if (d.kind === 'skillTarget') {
    const [first, second] = a.targets ?? [];
    return first === undefined || second === undefined ? -100 : exchange(ctx, ctx.player(first)!, ctx.player(second)!).gain;
  }
  return undefined;
};
const haoshi: SkillEvaluator = (ctx, d, _choice, a) => {
  if (d.kind === 'phaseDrawChoice') {
    const total = ctx.self.handCount + 4;
    if (total <= 5) return 5;
    const others = ctx.observation.others.filter(p => p.alive);
    const minimum = Math.min(...others.map(p => p.handCount));
    const relation = Math.max(...others.filter(p => p.handCount === minimum).map(p => ctx.relation(p.id)));
    const donated = Math.floor(total / 2);
    return 3 + relation * donated * 1.5 - donated;
  }
  if (d.kind === 'contentChoice') return a.ids?.length ? -ctx.value(a.ids[0]) : ctx.relation(a.targets?.[0] ?? ctx.self.id) * 5;
  return undefined;
};
// A skipped turn matters more when it is near and the player has usable resources.
function turnValue(ctx: EvaluationContext, target: VisiblePlayer): number {
  const seats = living(ctx).sort((a, b) => a.id - b.id);
  const active = seats.findIndex(p => p.id === ctx.observation.active);
  const index = seats.findIndex(p => p.id === target.id);
  const steps = ((index - active + seats.length) % seats.length) || seats.length;
  const urgency = 1 + (seats.length - steps) / seats.length * 0.5;
  const resources = Math.min(3, target.handCount * 0.5) + (target.equip.weapon ? 1 : 0);
  const restricted = target.judge.some(c => c.name === 'lebu') ? 0.55 : 1;
  return (5 + resources) * urgency * restricted;
}
const exileGain = (ctx: EvaluationContext, target: VisiblePlayer, draws = lost(ctx.self)) => ctx.relation(target.id) *
  (draws * 1.4 + (target.faceDown ? turnValue(ctx, target) : -turnValue(ctx, target)));
const fangzhu: SkillEvaluator = (ctx, d, _choice, a) => {
  if (a.type === 'no') return 0;
  if (d.kind === 'triggerConfirm') {
    const gain = Math.max(-1, ...ctx.observation.others.filter(p => p.alive).map(p => exileGain(ctx, p)));
    return gain > 0 ? gain : -1;
  }
  return a.targets?.length ? exileGain(ctx, ctx.player(a.targets[0])!) : -100;
};
function soulGain(ctx: EvaluationContext, target: VisiblePlayer, amount: number, help: boolean): number {
  const held = target.handCount + Object.values(target.equip).filter(Boolean).length;
  // With one lost HP, an empty target only draws and returns the same card.
  const cycle = held > 0 ? 0.6 : 0;
  if (help) return ctx.relation(target.id) * ((amount - 1) * 2 + cycle);
  const discarded = Math.min(amount, held + 1);
  const forcedEquip = Math.max(0, discarded - target.handCount - 1);
  const compensation = forcedEquip && hasPublicAbility(target, 'standard.xiaoji') ? forcedEquip * 3.2 : 0;
  const healing = forcedEquip && target.equip.armor?.name === 'baiyin' && lost(target) > 0 ? 3 : 0;
  return ctx.relation(target.id) * (-(discarded - 1) * 2 + cycle + compensation + healing);
}
const yinghun: SkillEvaluator = (ctx, d, _choice, a) => {
  const context = d.context as { timing?: string; amount?: number };
  if (d.kind === 'phaseStartChoice') {
    if (a.type === 'no') return 0;
    const gain = Math.max(0, ...ctx.observation.others.filter(p => p.alive).flatMap(p =>
      [soulGain(ctx, p, lost(ctx.self), true), soulGain(ctx, p, lost(ctx.self), false)]));
    return gain > 0 ? gain : -1;
  }
  if (context.timing === 'discard') return -discardCost(ctx, a.ids![0]);
  const target = ctx.player(a.targets?.[0] ?? ctx.self.id)!;
  return soulGain(ctx, target, context.amount ?? lost(ctx.self), !!a.choice?.startsWith('help:'));
};
function huntGain(ctx: EvaluationContext, target: VisiblePlayer, id: number): number {
  const point = ctx.card(id)!;
  // Assume the opponent can choose their highest point; use only public hand count.
  const lower = ctx.deck.filter(c => c.rank < point.rank).length / ctx.deck.length;
  const win = Math.pow(lower, Math.max(1, target.handCount));
  const loot = Math.max(target.handCount > 1 ? 3 : 0, ...Object.values(target.equip).map(c => c ? ctx.value(c.id) : 0));
  const benefit = -ctx.relation(target.id) * (1.4 + win * (3 + loot));
  const reserve = point.name === 'shan' && ctx.self.hp <= 2 && ctx.self.hand.filter(c => c.name === 'shan').length === 1 ? 4 : 0;
  return benefit - ctx.value(id) * 0.65 - reserve;
}
const lieren: SkillEvaluator = (ctx, d, _choice, a) => {
  if (d.kind === 'pindian') {
    const { source, target: targetId } = d.context as { source: number; target: number };
    const card = ctx.card(a.cid);
    if (!card) return -100;
    if (source !== ctx.self.id) {
      if (ctx.relation(source) >= 0) return -card.rank - ctx.value(card.id) * 0.3;
      const safe = Math.pow(ctx.deck.filter(c => c.rank <= card.rank).length / ctx.deck.length,
        Math.max(1, ctx.player(source)?.handCount ?? 1));
      const loot = Math.max(ctx.self.handCount > 1 ? 3 : 0, ...Object.values(ctx.self.equip).map(c => c ? ctx.value(c.id) : 0));
      return safe * (loot + 3) - ctx.value(card.id) * 0.65;
    }
    const target = ctx.player(targetId);
    return target ? huntGain(ctx, target, card.id) : -100;
  }
  if (d.kind === 'triggerConfirm') {
    if (a.type === 'no') return 0;
    const damage = [...ctx.observation.events].reverse().find(e => e.kind === 'damaged' && e.data.source === ctx.self.id);
    const target = damage?.kind === 'damaged' ? ctx.player(damage.data.target) : undefined;
    if (!target || ctx.relation(target.id) >= 0) return -3;
    const gain = Math.max(-1, ...ctx.self.hand.map(c => huntGain(ctx, target, c.id)));
    return gain > 0 ? gain : -1;
  }
  return undefined;
};
const chaos: SkillEvaluator = (ctx, d, _choice, a) => {
  const harm = (p: VisiblePlayer) => -ctx.relation(p.id) * (p.hp <= 1 ? 8 : 3.5) - (ctx.protectsLord(p.id) ? 40 : 0);
  if (d.kind === 'play') {
    const gain = ctx.observation.others.filter(p => p.alive).reduce((sum, p) => {
      const nearby = living(ctx).filter(other => other.id !== p.id);
      const min = Math.min(...nearby.map(other => ctx.distance(p.id, other.id)));
      const worst = Math.min(...nearby.filter(other => ctx.distance(p.id, other.id) === min).map(harm));
      return sum + (p.handCount ? Math.min(harm(p), worst) : harm(p));
    }, 0);
    const finisher = ctx.observation.others.some(p => p.alive && p.hp <= 1 && p.handCount <= 2 && ctx.relation(p.id) < -0.3 && !ctx.protectsLord(p.id));
    const reserve = finisher ? 0 : 1.5 + ctx.observation.others.filter(p => p.alive).length * 0.4;
    return gain > reserve ? gain + (finisher ? 6 : 0.5) : -5;
  }
  if (a.choice === 'loseHp') return -(ctx.self.hp <= 1 ? 18 : ctx.self.hp <= 2 ? 7 : 3.5);
  const target = a.targets?.[0];
  return target === undefined ? -100 : ctx.shaEffect(target, a.ids ?? []) - (a.ids ?? []).reduce((sum, id) => sum + ctx.value(id) * 0.4, 0);
};
export function forestAttackAdjustment(ctx: EvaluationContext, target: VisiblePlayer, hit: number): number {
  if (hasPublicAbility(target, 'forest.fangzhu') && target.hp > 1) {
    const potential = Math.max(0, ...living(ctx).filter(p => p.id !== target.id).map(p =>
      -ctx.relation(p.id) * ((target.maxHp - target.hp + 1) * 1.4 + (p.faceDown ? turnValue(ctx, p) : -turnValue(ctx, p)))));
    return -hit * potential * 0.4;
  }
  if (hasPublicAbility(ctx.self, 'forest.lieren') && ctx.relation(target.id) < 0 && target.handCount && ctx.self.handCount > 1) return hit;
  return 0;
}
export function registerForestEvaluations(r: EvaluationRegistry): void {
  r.registerGeneral('forest.dongzhuo', (ctx, d, _c, a, score) =>
    d.kind === 'play' && a.type === 'virtualBasic' && a.transformation === 'forest.jiuchi' ?
      score - (a.ids ?? []).reduce((cost, id) => cost + ctx.value(id) * 0.5, 0) : score);
  r.register('forest.dimeng', dimeng).register('forest.haoshi', haoshi).register('forest.fangzhu', fangzhu)
    .register('forest.yinghun', yinghun).register('mountain.yinghun', yinghun).register('forest.lieren', lieren).register('forest.luanwu', chaos)
    .register('forest.xingshang', (_ctx, _d, _c, a) => a.type === 'pass' ? 0 : 10)
    .register('forest.zaiqi', (ctx, _d, _c, a) => a.type === 'normal' ? undefined :
      lost(ctx.self) >= 3 || lost(ctx.self) === 2 && ctx.self.handCount >= 2 ? 3 + lost(ctx.self) : -2)
    .register('forest.benghuai', (ctx, _d, _c, a) => a.choice === 'maxHp' ?
      lost(ctx.self) >= 2 || ctx.self.hp <= 2 && lost(ctx.self) > 0 ? 10 : -3 : ctx.self.hp <= 1 ? -20 : 1)
    .register('forest.songwei.offer', (ctx, _d, _c, a) => a.type === 'no' ? 0 :
      Math.max(-1, ...living(ctx).filter(p => p.general === 'forest.caopi' && p.role === 'lord').map(p => ctx.relation(p.id) * 3)))
    .register('forest.baonue.offer', (ctx, _d, _c, a) => a.type === 'no' ? 0 :
      Math.max(-1, ...living(ctx).filter(p => p.general === 'forest.dongzhuo' && p.role === 'lord').map(p => lost(p) ? ctx.relation(p.id) * 3 : -1)));
}
