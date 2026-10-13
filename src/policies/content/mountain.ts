import { cardColor, cardTypeOf, equipSlotOf } from '../../../catalog.ts';
import type { VisiblePlayer } from '../../../contracts.ts';
import type { EvaluationContext } from '../evaluation-context.ts';
import type { EvaluationRegistry, SkillEvaluator } from '../evaluation-registry.ts';
import { hasPublicAbility, publicAbilities } from '../ability-view.ts';
import { attackReach, equipmentLeaveValue, extraTurnValue, fieldSpendCost, handFee, moveBenefit, playOpportunity, receivedValue, victoryAfterDeath } from './mountain-plan.ts';
import type { AttackContext } from '../../domain/state.ts';
const live = (ctx: EvaluationContext) => [ctx.self, ...ctx.observation.others].filter(p => p.alive);
const own = (ctx: EvaluationContext) => [...ctx.self.hand, ...Object.values(ctx.self.equip).filter(c => !!c)];
const fee = (ctx: EvaluationContext, id: number) => ctx.value(id) - equipmentLeaveValue(ctx, ctx.self, ctx.card(id)!);
const qiaobian: SkillEvaluator = (ctx, d, _c, a) => {
  if (a.type === 'pass') return 0;
  const context = d.context as { timing: string; mode: string };
  if (context.timing === 'draw') return a.targets?.length ? -ctx.relation(a.targets[0]) * 3 + 1 : -10;
  if (context.timing === 'move') return moveBenefit(ctx, a.targets![0], a.targets![1], a.ids![0]);
  const cost = handFee(ctx, a.ids![0]) * .65;
  if (context.mode === 'judge') return ctx.self.judge.reduce((n, c) => n + (c.name === 'lebu' ? 7 : c.name === 'bingliang' ? 4 : c.name === 'shandian' ? ctx.self.hp <= 3 ? 5 : 2 : 0), 0) - cost;
  if (context.mode === 'draw') {
    const targets = ctx.observation.others.filter(p => p.alive && p.handCount).map(p => -ctx.relation(p.id) * 3 + 1).sort((a, b) => b - a);
    return targets.slice(0, 2).reduce((n, v) => n + Math.max(0, v), 0) - 4 - cost;
  }
  if (context.mode === 'discard') return Math.max(0, ctx.self.handCount - Math.max(0, ctx.self.hp) - 1) * 3 - cost;
  const gain = live(ctx).flatMap(p => [...Object.values(p.equip).filter(c => !!c), ...p.judge].flatMap(c => live(ctx).filter(t => t.id !== p.id &&
    (cardTypeOf(c!) === 'equip' ? !t.equip[equipSlotOf(c!)] : !t.judge.some(other => other.name === c!.name)))
      .map(t => moveBenefit(ctx, p.id, t.id, c!.id))));
  return Math.max(0, ...gain) - playOpportunity(ctx) - cost;
};
const tiaoxin: SkillEvaluator = (ctx, d, _c, a) => {
  const context = d.context as { target?: number };
  if (d.kind === 'play') {
    const p = ctx.player(a.targets![0])!;
    if (ctx.relation(p.id) >= 0 || ctx.protectsLord(p.id) || !(p.handCount + Object.values(p.equip).filter(Boolean).length)) return -3;
    const retaliation = (1 - Math.pow(1 - ctx.responseRates.sha, p.handCount)) * (ctx.self.hand.some(c => c.name === 'shan') || ctx.self.equip.armor?.name === 'bagua' ? 1 : ctx.self.hp <= 2 ? 9 : 4);
    return -ctx.relation(p.id) * 4 - retaliation;
  }
  if (a.type === 'pass') return -Math.min(4, ...own(ctx).map(c => fee(ctx, c!.id)));
  return ctx.shaEffect(a.targets![0], a.ids ?? []) - (a.ids ?? []).reduce((n, id) => n + ctx.value(id) * .4, 0) + (context.target === ctx.self.id ? 1 : 0);
};
function avatarValue(ctx: EvaluationContext, ability: string) {
  const count = (name: string) => ctx.self.hand.filter(c => c.name === name).length;
  const wounded = ctx.self.maxHp - ctx.self.hp;
  const ending = ctx.observation.phase === 'end';
  const base: Record<string, number> = {
    'standard.yingzi': ending ? 2 : 7, 'standard.biyue': ending ? 6 : 2, 'standard.jizhi': 3 + ctx.self.hand.filter(c => cardTypeOf(c) === 'trick').length * 2,
    'standard.qingguo': (ending ? 5 : 3) + ctx.self.hand.filter(c => cardColor(c) === 'black').length * (ctx.self.hp <= 2 ? 2 : 1),
    'standard.longdan': 4 + (count('sha') + count('shan')) * (ending ? 1 : 1.5),
    'standard.wusheng': ending ? 2 : 2 + ctx.self.hand.filter(c => cardColor(c) === 'red' && c.name !== 'tao').length * 1.5,
    'standard.qixi': ending ? 2 : 2 + ctx.self.hand.filter(c => cardColor(c) === 'black').length * 1.5,
    'standard.zhiheng': ending ? 2 : 3 + ctx.self.handCount, 'standard.qingnang': wounded ? 5 + wounded : 1,
    'standard.jijiu': ctx.self.hp <= 2 ? 7 : ending ? 5 : 3, 'standard.lianying': ctx.self.handCount <= 2 ? 6 : 3,
    'standard.xiaoji': 2 + Object.values(ctx.self.equip).filter(Boolean).length * 2,
    'standard.guanxing': ending ? 3 : 7, 'standard.yiji': ctx.self.hp > 1 ? 5 : 2,
    'wind.buqu': ctx.self.hp <= 2 ? 10 : 4, 'wind.tianxiang': ctx.self.hand.some(c => c.suit === 'heart') ? 8 : 1,
    'wind.leiji': count('shan') || ctx.self.equip.armor?.name === 'bagua' ? 8 : 2,
    'wind.shensu': ending ? 2 : 6, 'forest.fangzhu': ctx.self.hp > 1 ? 6 : 2,
    'forest.yinghun': wounded && !ending ? 5 + wounded : 2,
    'forest.haoshi': !ending && ctx.self.handCount <= 1 ? 7 : 3,
    'forest.dimeng': ending ? 1 : 6, 'mountain.qiaobian': ctx.self.judge.length ? 9 : 5,
    'mountain.guzheng': ending ? 7 : 4, 'mountain.tiaoxin': ending ? 1 : 4,
    'mountain.zhijian': ending ? 1 : 2 + ctx.self.hand.filter(c => cardTypeOf(c) === 'equip').length * 2,
    'mountain.beige': 5, 'mountain.jiang': 3 + ctx.self.hand.filter(c => c.name === 'juedou' || c.name === 'sha' && cardColor(c) === 'red').length * 2,
  };
  let score = base[ability] ?? 3;
  if (!ending && ['standard.wusheng', 'standard.longdan'].includes(ability)) {
    const costs = ctx.self.hand.filter(c => ability === 'standard.wusheng' ? cardColor(c) === 'red' && c.name !== 'tao' : c.name === 'shan');
    const gain = Math.max(0, ...costs.flatMap(c => ctx.observation.others.filter(p => attackReach(ctx, p)).map(p => {
      const effect = ctx.shaEffect(p.id, [c.id], 'normal');
      return effect > 0 ? effect + (p.hp <= 1 && victoryAfterDeath(ctx, p) ? 20 : 0) - handFee(ctx, c.id) * .3 : 0;
    })));
    score += gain;
  }
  if (!ending && ability === 'standard.qingnang' && wounded) score += ctx.self.hp <= 2 ? 7 : 3;
  if (ending && ['standard.qingguo', 'standard.longdan', 'wind.tianxiang', 'wind.leiji'].includes(ability) && ctx.self.hp <= 2) score += 2;
  return score;
}
const huashen: SkillEvaluator = (ctx, d, _c, a) => {
  const current = ctx.self.huashen?.ability;
  if (d.kind === 'phaseStartChoice' || d.kind === 'phaseEndChoice') return a.type === 'no' ? 0 : 2;
  if (a.type === 'pass') return current ? avatarValue(ctx, current) + .4 : 0;
  const [, general, ability] = a.choice!.split(':');
  return avatarValue(ctx.asAvatar(general, ability), ability) + (ability === current ? .2 : 0);
};
const fangquan: SkillEvaluator = (ctx, d, _c, a) => {
  const context = d.context as { timing?: string };
  const best = Math.max(-1, ...ctx.observation.others.filter(p => p.alive).map(p => ctx.relation(p.id) * extraTurnValue(p)));
  const cheapest = Math.min(...ctx.self.hand.map(c => handFee(ctx, c.id)));
  if (d.kind === 'phaseEndChoice') return a.type === 'no' ? 0 : best - cheapest * .55 - 1;
  if (a.type === 'pass') return 0;
  if (context.timing === 'skip') return ctx.self.hp > 0 && ctx.self.handCount && best > 0 ? best - playOpportunity(ctx) - cheapest * .55 - .7 : -3;
  if (context.timing === 'cost') return -handFee(ctx, a.ids![0]);
  return a.targets?.length ? ctx.relation(a.targets[0]) * extraTurnValue(ctx.player(a.targets[0])!) : -3;
};
const zhiba: SkillEvaluator = (ctx, d, _c, a) => {
  const context = d.context as { source?: number; target?: number; timing?: string };
  if (d.kind === 'play') {
    const lord = ctx.player(a.targets![0])!;
    if (ctx.relation(lord.id) <= 0 || ctx.self.handCount <= Math.max(1, ctx.self.hp) || !lord.handCount) return -3;
    // Estimate the lord's largest point from hand count, without reading a hidden card.
    return Math.max(-3, ...ctx.self.hand.map(c => {
      const loseChance = 1 - Math.pow((c.rank - 1) / 13, lord.handCount);
      return loseChance * (2.5 + receivedValue(ctx, c, lord) * .4) - (1 - loseChance) * 4 - handFee(ctx, c.id) * .5;
    }));
  }
  if (d.kind === 'pindian') {
    const card = ctx.card(a.cid)!;
    const friend = ctx.relation(context.source === ctx.self.id ? context.target! : context.source!) > 0;
    return (friend && context.source === ctx.self.id ? -card.rank : card.rank) - handFee(ctx, card.id) * .25;
  }
  if (context.timing === 'loot') return a.type === 'pass' ? 0 : 10;
  if (a.type === 'pass') return 0;
  return ctx.self.hand.length && ctx.relation(d.actor === context.target ? context.source ?? -1 : d.actor) >= 0 ? 3 : ctx.self.hand.some(c => c.rank >= 11) ? 2 : -1;
};
const beige: SkillEvaluator = (ctx, d, _c, a) => {
  if (a.type === 'pass') return 0;
  const context = d.context as { target: number; source: number | null; timing: string };
  if (context.timing === 'discard') return -fee(ctx, a.ids![0]);
  const target = ctx.player(context.target)!, source = context.source === null ? undefined : ctx.player(context.source);
  const help = ctx.relation(target.id) * ((target.hp < target.maxHp ? 4 : 0) + 3) / 4;
  const hinder = source ? -ctx.relation(source.id) * (Math.min(2, source.handCount + Object.values(source.equip).filter(Boolean).length) * 2 + (source.faceDown ? -6 : 6)) / 4 : 0;
  return help + hinder - fee(ctx, a.ids![0]) * .65;
};
export function mountainAttackAdjustment(ctx: EvaluationContext, target: VisiblePlayer, hit: number, costs: readonly number[], xianglePaid = false): number {
  let score = 0;
  if (!xianglePaid && hasPublicAbility(target, 'mountain.xiangle')) {
    const basics = ctx.self.hand.filter(c => !costs.includes(c.id) && cardTypeOf(c) === 'basic');
    if (!basics.length) return -100;
    score -= Math.min(...basics.map(c => handFee(ctx, c.id))) * .55;
  }
  if (hasPublicAbility(target, 'mountain.duanchang') && target.hp <= 1 && !victoryAfterDeath(ctx, target) && !ctx.self.generalSkillsDisabled) {
    const count = publicAbilities(ctx.self).length;
    const valuable = publicAbilities(ctx.self).some(a => ['standard.paoxiao', 'standard.zhiheng', 'standard.rende', 'mountain.jixi', 'mountain.huashen'].includes(a));
    score -= hit * Math.min(10, count * 2 + (valuable ? 3 : 0));
  }
  const card = costs.length === 1 ? ctx.card(costs[0]) : undefined;
  if (card && cardColor(card) === 'red' && hasPublicAbility(target, 'mountain.jiang')) score += ctx.relation(target.id) * 2;
  if (card && cardColor(card) === 'red' && hasPublicAbility(ctx.self, 'mountain.jiang')) score += 2;
  return score;
}
const xiangle: SkillEvaluator = (ctx, d, _c, a) => {
  if (a.type === 'pass') return 0;
  const context = d.context as { owner: number; attack?: AttackContext };
  const attack = context.attack;
  const ids = !attack ? [] : typeof attack.sha === 'number' ? [attack.sha] : 'id' in attack.sha ? [attack.sha.id] : [...(attack.sha.subcards ?? [])];
  const target = ctx.player(context.owner)!;
  const effect = ctx.shaEffect(target.id, ids, attack?.nature, { xianglePaid: true, extraWine: attack?.damageBonus ?? 0, ignoreArmor: attack?.ignoreArmor });
  return effect > 0 ? effect + (target.hp <= 1 && victoryAfterDeath(ctx, target) ? 20 : 0) - handFee(ctx, a.ids![0]) * .55 : -10;
};
export function registerMountainEvaluations(r: EvaluationRegistry): void {
  r.registerGeneral('mountain.dengai', (ctx, d, _c, a, score) => d.kind === 'play' && a.transformation === 'mountain.jixi' ? score - fieldSpendCost(ctx, a.ids ?? []) : score);
  r.register('mountain.qiaobian', qiaobian).register('mountain.tiaoxin', tiaoxin).register('mountain.fangquan', fangquan).register('mountain.huashen', huashen)
    .register('mountain.zhiba.offer', zhiba).register('mountain.beige', beige)
    .register('mountain.xiangle', xiangle)
    .register('mountain.tuntian', (_ctx, _d, _c, a) => a.type === 'no' ? 0 : 4)
    .register('mountain.xinsheng', (_ctx, _d, _c, a) => a.type === 'no' ? 0 : 4)
    .register('mountain.jiang', (_ctx, _d, _c, a) => a.type === 'no' ? 0 : 4)
    .register('mountain.jiang.duel', (_ctx, _d, _c, a) => a.type === 'no' ? 0 : 4)
    .register('mountain.jiang.sha', (_ctx, _d, _c, a) => a.type === 'no' ? 0 : 4)
    .register('mountain.zhiji', (ctx, _d, _c, a) => a.choice === 'recover' ? ctx.self.hp <= 2 ? 10 : 2 : 5)
    .register('mountain.zhijian', (ctx, _d, _c, a) => { const target = ctx.player(a.targets![0])!, card = ctx.card(a.ids![0])!;
      const slot = equipSlotOf(card), old = ctx.self.equip[slot];
      const selfUse = Math.max(0, ctx.value(card.id) - (old ? ctx.value(old.id) : 0));
      return ctx.relation(target.id) <= 0 ? -3 : 3 + ctx.relation(target.id) * receivedValue(ctx, card, target) - selfUse - ctx.value(card.id) * .4; })
    .register('mountain.guzheng', (ctx, d, _c, a) => { if (a.type === 'pass') return 0;
      const remaining = (d.context as { remaining: number[] }).remaining, chosen = a.ids![0], target = a.targets![0];
      return remaining.filter(id => id !== chosen).reduce((n, id) => n + ctx.value(id), 0) + ctx.relation(target) * receivedValue(ctx, ctx.card(chosen)!, ctx.player(target)!) - .5; });
}
