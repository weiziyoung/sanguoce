import { cardColor, cardTypeOf } from '../../../catalog.ts';
import type { VisiblePlayer } from '../../../contracts.ts';
import type { EvaluationContext } from '../evaluation-context.ts';
import type { EvaluationRegistry, SkillEvaluator, GeneralEvaluator } from '../evaluation-registry.ts';

const suitFor = (player: VisiblePlayer, suit: string) => player.general === 'wind.xiaoqiao' && suit === 'spade' ? 'heart' : suit;
export function liegongAvailable(ctx: EvaluationContext, target: VisiblePlayer): boolean {
  const weapon = ctx.self.equip.weapon;
  const ranges: Record<string, number> = { zhuge: 1, cixiong: 2, qinggang: 2, qinglong: 3, zhangba: 3,
    guanshi: 3, fangtian: 4, qilin: 5, hanbing: 2, guding: 2, zhuque: 4 };
  const range = weapon ? ranges[weapon.name] ?? 1 : 1;
  return ctx.self.general === 'wind.huangzhong' && ctx.observation.active === ctx.self.id && ctx.observation.phase === 'play' &&
    (target.handCount >= ctx.self.hp || target.handCount <= range);
}
/** Counterattacks use only public hand counts/equipment; never inspect opponents' hands. */
export function leijiRisk(ctx: EvaluationContext, target: VisiblePlayer, dodgeChance: number): number {
  if (target.general !== 'wind.zhangjiao' || dodgeChance <= 0) return 0;
  const knownBlack = Object.values(target.equip).some(card => card && cardColor(card) === 'black');
  const spare = Math.max(0, target.handCount - 1);
  const canForceSpade = knownBlack || spare > 0 ? 1 - Math.pow(0.75, spare + (knownBlack ? 2 : 0)) : 0;
  const hit = 0.25 + 0.75 * canForceSpade;
  const exposed = [ctx.self, ...ctx.observation.others].filter(p => p.alive && p.general !== 'wind.xiaoqiao');
  const harm = Math.max(0, ...exposed.map(p => -ctx.elementalUtility(p.id, 2, 'thunder')));
  return dodgeChance * hit * harm;
}
export function windAttackAdjustment(ctx: EvaluationContext, target: VisiblePlayer, success: number, costs: readonly number[]): number {
  let adjustment = -leijiRisk(ctx, target, 1 - success);
  if (ctx.self.general === 'wind.weiyan' && ctx.self.hp < ctx.self.maxHp && ctx.relation(target.id) < 0) {
    const players = [ctx.self, ...ctx.observation.others].filter(p => p.alive).sort((a, b) => a.id - b.id);
    const from = players.findIndex(p => p.id === ctx.self.id), to = players.findIndex(p => p.id === target.id);
    let distance = Math.min(Math.abs(from - to), players.length - Math.abs(from - to));
    if (ctx.self.equip.minusHorse && !costs.includes(ctx.self.equip.minusHorse.id)) distance--;
    if (target.equip.plusHorse) distance++;
    if (distance <= 1) adjustment += 3 * success;
  }
  if (target.general === 'wind.xiaoqiao' && target.handCount > 0 && ctx.relation(target.id) < 0) {
    const transferChance = 1 - Math.pow(0.5, target.handCount);
    adjustment -= transferChance * success * 4;
  }
  return adjustment;
}
const shensu: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (action.type === 'pass') return 0;
  const timing = (decision.context as { timing?: string }).timing;
  const target = action.targets?.[0]; if (target === undefined) return -100;
  const hit = ctx.shaEffect(target, [], 'normal');
  if (hit <= 0) return -5;
  const costs = (action.ids ?? []).reduce((sum, id) => sum + ctx.value(id), 0);
  if (timing === 'judge') {
    const skipDanger = ctx.self.judge.reduce((sum, card) => sum + (card.name === 'lebu' ? 5 : card.name === 'bingliang' ? 2 : card.name === 'shandian' ? 2.5 : 0), 0);
    return hit * 1.4 + skipDanger - 5;
  }
  const hand = ctx.self.hand.filter(card => !(action.ids ?? []).includes(card.id));
  const normalPlay = hand.reduce((sum, card) => sum + (['wuzhong', 'tao'].includes(card.name) ? 4 :
    ['sha', 'juedou', 'guohe', 'shunshou'].includes(card.name) ? 1.5 : 0), 0);
  return hit * 1.4 - 0.5 * costs - normalPlay - 0.5;
};
const tianxiang: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (action.type === 'pass') return 0;
  const target = ctx.player(action.targets?.[0] ?? -1); if (!target) return -100;
  const amount = (decision.context as { amount?: number }).amount ?? 1;
  const survives = target.hp > amount || target.general === 'wind.zhoutai';
  const cards = survives ? Math.max(0, target.maxHp - target.hp + amount) : 0;
  const relation = ctx.relation(target.id);
  const hurt = -relation * (3.5 * amount + (target.hp <= amount ? 6 : 0));
  const benefit = relation * cards * 1.2;
  const selfSaved = 3.5 * amount + (ctx.self.hp <= amount ? 12 : ctx.self.hp <= 2 ? 4 : 0);
  return selfSaved + hurt + benefit - 0.7 * ctx.value(action.ids?.[0]);
};
const leiji: SkillEvaluator = (ctx, _decision, _choice, action) => {
  if (action.type === 'pass') return 0;
  const target = ctx.player(action.targets?.[0] ?? -1); if (!target || target.general === 'wind.xiaoqiao') return -10;
  const spade = [...ctx.self.hand, ...Object.values(ctx.self.equip).filter(Boolean)].some(card => card?.suit === 'spade');
  return ctx.elementalUtility(target.id, 2, 'thunder') * (spade ? 0.9 : 0.25);
};
const favorable = (reason: string, suit: string, rank: number) => reason === 'wind.leiji' ? suit !== 'spade' :
  reason === 'lebu' ? suit === 'heart' : reason === 'bingliang' ? suit === 'club' :
  reason === 'shandian' ? !(suit === 'spade' && rank >= 2 && rank <= 9) :
  ['bagua', 'standard.tieji'].includes(reason) ? ['heart', 'diamond'].includes(suit) :
  reason === 'standard.luoshen' ? ['spade', 'club'].includes(suit) : undefined;
const guidao: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (action.type === 'pass') return 0;
  const context = decision.context as { subject: number; reason: string; currentId: number };
  const subject = ctx.player(context.subject), current = ctx.card(context.currentId), next = ctx.card(action.cid);
  if (!subject || !current || !next) return -10;
  const before = favorable(context.reason, suitFor(subject, current.suit), current.rank);
  const after = favorable(context.reason, suitFor(subject, next.suit), next.rank);
  const swing = before === undefined || after === undefined || before === after ? 0 :
    (after ? 1 : -1) * ctx.relation(subject.id) * (context.reason === 'wind.leiji' ? 12 : 8);
  const equipped = Object.values(ctx.self.equip).some(card => card?.id === next.id);
  return swing + 0.3 * (ctx.value(current.id) - ctx.value(next.id)) - (equipped ? 2 : 0) - 0.4;
};
const buqu: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (action.type === 'pass') return -100;
  if ((decision.context as { timing?: string }).timing === 'add') return 100;
  const pile = ctx.self.piles?.['wind.buqu'] ?? [];
  const card = pile.find(card => card.id === action.ids?.[0]);
  return card ? pile.filter(other => other.rank === card.rank).length * 10 : -100;
};
const jushou: SkillEvaluator = (ctx, _decision, _choice, action) => {
  if (action.type === 'no') return 0;
  if (ctx.self.faceDown) return 20;
  const defense = ctx.self.hand.filter(card => ['shan', 'tao', 'jiu'].includes(card.name)).length;
  return 5 - ctx.self.handCount * 1.2 + (ctx.self.hp <= 2 ? 2 : 0) - defense * 0.8;
};
const gift: SkillEvaluator = (ctx, _decision, _choice, action) => {
  const target = ctx.player(action.targets?.[0] ?? -1), card = ctx.card(action.ids?.[0]);
  if (!target || !card || ctx.relation(target.id) <= 0) return -5;
  const ownShan = ctx.self.hand.filter(card => card.name === 'shan').length;
  if (card.name === 'shan' && ownShan === 1 && ctx.self.hp <= 2) return -2;
  return ctx.relation(target.id) * (card.name === 'shan' ? target.handCount < 3 ? 7 : 4 : 2) - 0.3 * ctx.value(card.id);
};
const xiaoqiao: GeneralEvaluator = (ctx, decision, _choice, action, base) => {
  const card = ctx.card(action.cid ?? action.ids?.[0]);
  if (!card || !['heart', 'spade'].includes(card.suit)) return base;
  const hearts = ctx.self.hand.filter(card => ['heart', 'spade'].includes(card.suit)).length;
  if (hearts > 1 || card.name === 'tao' && ctx.self.hp < ctx.self.maxHp) return base;
  if (decision.kind === 'discard') return base - 4;
  if (decision.kind === 'play' && cardTypeOf(card) !== 'equip') return base - 3;
  return base;
};
const zhangjiao: GeneralEvaluator = (ctx, decision, _choice, action, base) => {
  const card = ctx.card(action.cid ?? action.ids?.[0]);
  if (!card) return base;
  const lastShan = card.name === 'shan' && ctx.self.hand.filter(c => c.name === 'shan').length <= 1;
  const lastSpade = card.suit === 'spade' && [...ctx.self.hand, ...Object.values(ctx.self.equip)]
    .filter(c => c?.suit === 'spade').length <= 1;
  if (decision.kind === 'discard' && (lastShan || lastSpade)) return base - 3;
  if (decision.kind === 'play' && lastSpade && cardTypeOf(card) !== 'equip' &&
    !(action.targets ?? []).some(id => (ctx.player(id)?.hp ?? Infinity) <= 1)) return base - 2;
  return base;
};
export function registerWindEvaluations(registry: EvaluationRegistry): void {
  registry.register('wind.shensu', shensu).register('wind.tianxiang', tianxiang).register('wind.leiji', leiji)
    .register('wind.guidao', guidao).register('wind.buqu', buqu).register('wind.jushou', jushou)
    .register('wind.huangtian.gift', gift)
    .register('wind.liegong', (_ctx, _d, _c, action) => action.type === 'no' ? 0 : 10)
    .registerGeneral('wind.xiaoqiao', xiaoqiao).registerGeneral('wind.zhangjiao', zhangjiao);
}
