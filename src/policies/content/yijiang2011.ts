import { cardTypeOf, equipSlotOf } from '../../../catalog.ts';
import type { ContentChoiceContext } from '../../domain/state.ts';
import type { EvaluationRegistry, SkillEvaluator } from '../evaluation-registry.ts';
import { hasPublicAbility } from '../ability-view.ts';
import { attackReach, equipmentLeaveValue, receivedValue, victoryAfterDeath } from './mountain-plan.ts';
import { equipmentExitValue, ganluValue, jujianPlan, mingceAttackValue, xianzhenBidValue, yijiangCardFee } from './yijiang2011-plan.ts';

const optional: SkillEvaluator = (_ctx, _d, _c, a) => a.type === 'pass' || a.type === 'no' ? 0 : 5;
const jiushi: SkillEvaluator = (ctx, d, _c, a) => {
  if (d.kind === 'dying') return a.type === 'pass' ? -100 : 100;
  if (d.kind !== 'play') return a.type === 'pass' || a.type === 'no' ? 0 : 8;
  const attacks = ctx.self.hand.filter(c => c.name === 'sha');
  if (ctx.self.hand.some(c => c.name === 'jiu') || ctx.self.equip.weapon?.name === 'zhuge' && attacks.length > 1 || ctx.self.drunk) return -3;
  const gains = attacks.flatMap(c => ctx.observation.others.filter(p => attackReach(ctx, p)).map(p => {
    const before = ctx.shaEffect(p.id, [c.id], c.nature);
    const after = ctx.shaEffect(p.id, [c.id], c.nature, { extraWine: 1 });
    const finish = p.hp === 2 && victoryAfterDeath(ctx, p) ? 6 : 0;
    return before > 0 ? after - before + finish : 0;
  }));
  const gain = Math.max(0, ...gains);
  return ctx.observation.shaUsed === 0 && gain > 3.5 ? 8 + gain : -3;
};
const jujian: SkillEvaluator = (ctx, d, _c, a) => {
  if (d.kind === 'skillTarget') return ctx.relation(a.targets![0]) * 6;
  const plan = jujianPlan(ctx);
  if (a.type === 'beginSkill') return plan.ids.length ? 5 + plan.score : -3;
  const selected = (d.context as { selectedIds?: number[] }).selectedIds ?? [];
  if (a.type === 'cancel') return plan.ids.length ? -10 : 0;
  if (a.type === 'confirm') return selected.length === plan.ids.length && selected.every(id => plan.ids.includes(id)) ? 10 : -5;
  if (selected.includes(a.cid!)) return plan.ids.includes(a.cid!) ? -20 : 12;
  return plan.ids.includes(a.cid!) ? 10 - yijiangCardFee(ctx, a.cid!) * .1 : -10;
};
const xuanhuo: SkillEvaluator = (ctx, d, _c, a) => {
  const c = d.context as ContentChoiceContext;
  if (d.kind === 'play') {
    const target = a.targets![0];
    const friend = Math.max(0, ...ctx.observation.others.filter(p => p.alive && p.id !== target).map(p => ctx.relation(p.id)));
    if (friend <= 0 || ctx.relation(target) >= 0) return -3;
    const victim = ctx.player(target)!;
    const exposed = Object.values(victim.equip).filter(card => !!card);
    const take = Math.max(2, ...exposed.map(card => ctx.value(card!.id) - equipmentLeaveValue(ctx, victim, card!)));
    return -ctx.relation(target) * take + friend * 2 - yijiangCardFee(ctx, a.ids![0]) * .65;
  }
  if (c.timing === 'give') {
    const p = ctx.player(a.targets![0])!;
    return ctx.relation(p.id) * receivedValue(ctx, ctx.card(c.selectedIds![0])!, p);
  }
  if (!a.ids?.length) return 3; // An unknown hand slot has no card-specific value.
  const victim = ctx.player(c.target!)!, card = ctx.card(a.ids[0])!;
  const help = Math.max(0, ...ctx.observation.others.filter(p => p.alive && p.id !== victim.id).map(p => ctx.relation(p.id) * receivedValue(ctx, card, p)));
  return -ctx.relation(victim.id) * (ctx.value(card.id) - equipmentLeaveValue(ctx, victim, card)) + help;
};
const xianzhen: SkillEvaluator = (ctx, d, _c, a) => {
  if (d.kind === 'pindian') {
    const c = d.context as { source: number; target: number };
    const card = ctx.card(a.cid)!;
    if (c.source !== ctx.self.id) return card.rank * 2 - yijiangCardFee(ctx, card.id) * .4;
    return xianzhenBidValue(ctx, ctx.player(c.target)!, card);
  }
  const target = ctx.player(a.targets![0])!;
  if (ctx.relation(target.id) >= 0) return -3;
  return Math.max(-4, ...ctx.self.hand.map(c => xianzhenBidValue(ctx, target, c)));
};

export function registerYijiang2011Evaluations(r: EvaluationRegistry): void {
  r.register('yijiang2011.luoying', optional).register('yijiang2011.shangshi', optional)
    .register('yijiang2011.jiushi', jiushi).register('yijiang2011.jujian', jujian)
    .register('yijiang2011.xuanhuo', xuanhuo).register('yijiang2011.xianzhen', xianzhen)
    .register('yijiang2011.enyuan', (ctx, _d, _c, a) => a.choice === 'lose' ? ctx.self.hp <= 1 ? -100 : ctx.self.hp <= 2 ? -8 : -4 : -yijiangCardFee(ctx, a.ids![0]) * .6)
    .register('yijiang2011.xinzhan', (ctx, _d, _c, a) => a.type === 'activeSkill' ? 11 : a.choice === 'order' ? 0 : a.choice?.startsWith('gain:') ? 10 + ctx.value(a.ids![0]) : ctx.value(a.ids![0]))
    .register('yijiang2011.pojun', (ctx, _d, _c, a) => {
      if (a.type === 'no') return 0;
      const hit = [...ctx.observation.events].reverse().find(e => e.kind === 'damaged' && e.data.source === ctx.self.id);
      if (hit?.kind !== 'damaged') return -1;
      const p = ctx.player(hit.data.target)!;
      return ctx.relation(p.id) * ((p.faceDown ? 6 : -4.5) + Math.max(0, Math.min(5, p.hp)) * 1.8) - .1;
    })
    .register('yijiang2011.xuanfeng', (ctx, _d, _c, a) => a.type === 'pass' ? 0 : a.choice?.startsWith('damage:') ?
      ctx.elementalUtility(a.targets![0], 1, 'normal', true) : ctx.shaEffect(a.targets![0], []))
    .register('yijiang2011.ganlu', (ctx, _d, _c, a) => {
      const gain = ganluValue(ctx, a.targets![0], a.targets![1]);
      return gain > 0 ? 2 + gain : -3;
    })
    .register('yijiang2011.buyi', (ctx, d, _c, a) => {
      if (a.type === 'pass') return 0;
      const target = (d.context as ContentChoiceContext).target!;
      return ctx.relation(target) <= 0 ? -10 : a.ids?.length ? cardTypeOf(ctx.card(a.ids[0])!) === 'basic' ? -1 : 100 - ctx.value(a.ids[0]) : 10;
    })
    .register('yijiang2011.mingce', (ctx, d, _c, a) => {
      const c = d.context as ContentChoiceContext;
      if (d.kind === 'play') {
        const p = ctx.player(a.targets![0])!, card = ctx.card(a.ids![0])!;
        if (ctx.relation(p.id) <= 0) return -4;
        return 2 + ctx.relation(p.id) * (2.5 + receivedValue(ctx, card, p) * .35) - yijiangCardFee(ctx, card.id) * .55;
      }
      if (a.choice === 'draw') return 2.5;
      if (c.timing === 'target') return mingceAttackValue(ctx, ctx.player(c.target!)!, ctx.player(a.targets![0])!);
      return ctx.shaEffect(a.targets![0], []);
    });

  r.registerGeneral('yijiang2011.gaoshun', (ctx, d, _c, a, score) => d.kind === 'play' && a.type === 'play' && ctx.card(a.cid)?.name === 'jiu' ?
    Math.max(-3, (a.targets ?? []).reduce((n, id) => n + ctx.shaEffect(id, [a.cid!]), 0)) : score);
  r.registerGeneral('yijiang2011.xushu', (ctx, d, _c, a, score) => d.kind === 'play' && a.targets?.some(id => id !== ctx.self.id) &&
    ctx.card(a.cid) && cardTypeOf(ctx.card(a.cid)!) === 'trick' && hasPublicAbility(ctx.self, 'yijiang2011.wuyan') ? -10 : score);
  r.registerGeneral('yijiang2011.yujin', (ctx, d, _c, a, score) => d.kind === 'play' && a.type === 'play' &&
    ctx.card(a.cid) && cardTypeOf(ctx.card(a.cid)!) === 'equip' && equipSlotOf(ctx.card(a.cid)!) === 'armor' &&
    !ctx.self.equip.armor ? -3 : score);
  r.registerGeneral('yijiang2011.lingtong', (ctx, d, _c, a, score) => {
    const card = ctx.card(a.cid);
    if (d.kind !== 'play' || a.type !== 'play' || !card || cardTypeOf(card) !== 'equip') return score;
    const old = ctx.self.equip[equipSlotOf(card)];
    if (!old) return score;
    const gain = ctx.value(card.id) - ctx.value(old.id) + equipmentExitValue(ctx, ctx.self, [old]);
    return gain > .5 ? ctx.order(card.name) + gain : score;
  });
  r.registerGeneral('yijiang2011.zhangchunhua', (ctx, d, _c, a, score) => {
    if (score <= 0 || d.kind === 'discard' || !hasPublicAbility(ctx.self, 'yijiang2011.shangshi')) return score;
    const ids = a.ids ?? (a.cid === undefined ? [] : [a.cid]);
    const count = ctx.self.hand.filter(c => ids.includes(c.id)).length;
    const missing = ctx.self.maxHp - Math.max(0, ctx.self.hp);
    const refill = Math.max(0, missing - ctx.self.handCount + count) - Math.max(0, missing - ctx.self.handCount);
    return score + refill * 2;
  });
}
