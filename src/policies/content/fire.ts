import type { VisiblePlayer } from '../../../contracts.ts';
import type { EvaluationContext } from '../evaluation-context.ts';
import type { EvaluationRegistry, SkillEvaluator } from '../evaluation-registry.ts';
const players = (ctx: EvaluationContext) => [ctx.self, ...ctx.observation.others].filter(p => p.alive);
const hurt = (ctx: EvaluationContext, id: number, amount = 1) => {
  const p = ctx.player(id); return p ? -ctx.relation(id) * (3.5 * amount + (p.hp <= amount ? 4 : 0)) - (ctx.protectsLord(id) && p.hp <= amount ? 80 : 0) : 0;
};
const maxRank = (ctx: EvaluationContext) => Math.max(0, ...ctx.self.hand.map(card => card.rank));
const winChance = (ctx: EvaluationContext, target: number) => {
  const p = ctx.player(target); return ctx.relation(target) > 0 ? (maxRank(ctx) > 1 ? 0.9 : 0) :
    Math.pow(Math.max(0, maxRank(ctx) - 1) / 13, Math.max(1, p?.handCount ?? 1));
};
const pindian: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'pindian') return undefined;
  const card = ctx.card(action.cid); if (!card) return -100;
  const { source } = decision.context as { source: number };
  const help = source !== ctx.self.id && ctx.relation(source) > 0;
  return (help ? 14 - card.rank : card.rank) * 2 - ctx.value(card.id) * 0.25;
};
const quhu: SkillEvaluator = (ctx, decision, choice, action) => {
  const pick = pindian(ctx, decision, choice, action); if (pick !== undefined) return pick;
  const target = action.targets?.[0]; if (target === undefined) return -100;
  if (decision.kind === 'contentChoice') return hurt(ctx, target);
  const chance = winChance(ctx, target);
  const benefit = Math.max(0, ...players(ctx).filter(p => p.id !== target).map(p => hurt(ctx, p.id)));
  return chance * benefit - (1 - chance) * (ctx.self.hp <= 1 ? 16 : ctx.self.hp <= 2 ? 6 : 3) - 0.7;
};
const tianyi: SkillEvaluator = (ctx, decision, choice, action) => {
  const pick = pindian(ctx, decision, choice, action); if (pick !== undefined) return pick;
  const target = action.targets?.[0]; if (target === undefined) return -100;
  const attacks = ctx.self.hand.filter(card => card.name === 'sha' && card.rank < maxRank(ctx));
  if (!attacks.length) return -4;
  const useful = Math.max(0, ...ctx.observation.others.map(p => ctx.shaEffect(p.id, [attacks[0].id])));
  const gain = winChance(ctx, target) * (useful * Math.min(2, attacks.length) + 2) - (1 - winChance(ctx, target)) * useful - 1;
  return gain > 0 ? 6 + gain : gain;
};
const jieming: SkillEvaluator = (ctx, _decision, _choice, action) => {
  if (action.type === 'no') return 0;
  const benefit = (p: VisiblePlayer) => Math.max(0, Math.min(5, p.maxHp) - p.handCount) * ctx.relation(p.id) * 2;
  const target = action.targets?.[0];
  return target === undefined ? Math.max(0, ...players(ctx).map(benefit)) : benefit(ctx.player(target)!);
};
const qiangxi: SkillEvaluator = (ctx, _decision, _choice, action) => {
  const target = action.targets?.[0]; if (target === undefined) return -100;
  const fees = action.ids?.length ? ctx.value(action.ids[0]) * 0.65 : ctx.self.hp <= 1 ? 20 : ctx.self.hp <= 2 ? 5 : 2.3;
  return hurt(ctx, target) * 1.5 - fees;
};
const huoji: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'play') return undefined;
  const target = action.targets?.[0]; if (target === undefined) return -100;
  const fees = ctx.self.hand.filter(card => !action.ids?.includes(card.id));
  const suits = new Set(fees.map(card => card.suit));
  const gain = ctx.elementalUtility(target, 1, 'fire');
  const chance = Math.pow(suits.size / 4, ctx.player(target)?.handCount ?? 1);
  return chance * gain - (action.ids ?? []).reduce((sum, id) => sum + ctx.value(id) * 0.5, 0);
};
const lianhuan: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'play') return undefined;
  const fee = ctx.value(action.ids?.[0]);
  if (action.type === 'virtualRecast') return 2 - fee * 0.3;
  const benefit = (action.targets ?? []).reduce((sum, id) => sum + ctx.chainUtility(id), 0);
  return benefit > 0 ? 2 + benefit - fee * 0.3 : -3;
};
const luanji: SkillEvaluator = (ctx, _decision, _choice, action) => {
  const benefit = ctx.observation.others.filter(p => p.alive).reduce((sum, p) => sum + ctx.targetEffect('wanjian', p.id), 0);
  return benefit * 1.5 - (action.ids ?? []).reduce((sum, id) => sum + ctx.value(id) * 0.6, 0);
};
const shuangxiong: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'phaseDrawChoice') return undefined;
  const attacks = ctx.self.hand.filter(card => card.name === 'sha').length;
  const enemies = ctx.observation.others.some(p => p.alive && ctx.relation(p.id) < -0.3);
  return action.type === 'skill' && ctx.self.handCount >= 4 && attacks >= 2 && enemies ? 5 : -2;
};
export function fireAttackAdjustment(ctx: EvaluationContext, target: VisiblePlayer, hit: number): number {
  if (target.general === 'fire.xunyu' && ctx.relation(target.id) < 0 && target.hp > 1) {
    const need = Math.max(0, ...players(ctx).filter(p => ctx.relation(p.id) < 0).map(p => Math.min(5, p.maxHp) - p.handCount));
    return -hit * need;
  }
  if (ctx.self.general === 'fire.pangde' && ctx.relation(target.id) < 0 &&
    (target.handCount > 1 || Object.values(target.equip).some(Boolean))) return (1 - hit) * 2.5;
  return 0;
}
export function registerFireEvaluations(registry: EvaluationRegistry): void {
  registry.register('fire.quhu', quhu).register('fire.tianyi', tianyi).register('fire.jieming', jieming)
    .register('fire.qiangxi', qiangxi).register('fire.huoji', huoji).register('fire.lianhuan', lianhuan)
    .register('fire.luanji', luanji).register('fire.shuangxiong', shuangxiong)
    .register('fire.niepan', (_ctx, _d, _c, action) => action.type === 'pass' ? -100 : 100)
    .register('fire.mengjin', (ctx, d, _c, action) => {
      if (d.kind !== 'triggerConfirm') return undefined;
      const target = (d.context as { target?: number }).target;
      return action.type === 'no' ? 0 : target === undefined ? 2 : -ctx.relation(target) * 3;
    });
}
