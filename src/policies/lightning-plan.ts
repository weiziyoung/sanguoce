import type { VisiblePlayer } from '../../contracts.ts';
import type { EvaluationContext } from './evaluation-context.ts';

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const hazardous = (card: { suit: string; rank: number }) => card.suit === 'spade' && card.rank >= 2 && card.rank <= 9;

/** Public fighting resources, not a prediction of hidden hands or a calibrated win rate. */
function strength(player: VisiblePlayer): number {
  const equipment = Object.entries(player.equip).reduce((sum, [slot, card]) => sum +
    (card ? slot === 'armor' ? 1.5 : slot === 'weapon' ? 1 : 0.75 : 0), 0);
  const delays = player.judge.filter(card => card.name === 'lebu' || card.name === 'bingliang').length;
  return Math.max(0.5, Math.max(0, player.hp) * 2 + Math.min(10, player.handCount) * 0.8 + equipment - delays);
}

export interface LightningPlan {
  score: number;
  deficit: number;
  expectedUtility: number;
  comebackBonus: number;
  enemyUpside: number;
  selfHitChance: number;
}

/** Evaluate one clockwise circuit. Being behind increases appetite for useful upside, not arbitrary risk. */
export function lightningPlan(ctx: EvaluationContext, spent: readonly number[] = []): LightningPlan {
  const living = [ctx.self, ...ctx.observation.others].filter(player => player.alive).sort((a, b) => a.id - b.id);
  let friendly = 0, hostile = 0, uncertain = 0;
  for (const player of living) {
    const relation = ctx.relation(player.id), power = strength(player);
    friendly += Math.max(0, relation) * power;
    hostile += Math.max(0, -relation) * power;
    uncertain += (1 - Math.abs(relation)) * power;
  }
  const balance = (hostile - friendly) / Math.max(1, hostile + friendly + uncertain * 0.5);
  const deficit = clamp(balance);
  const order = living.filter(player => player.id >= ctx.self.id)
    .concat(living.filter(player => player.id < ctx.self.id))
    .filter(player => player.id === ctx.self.id || !player.judge.some(card => card.name === 'shandian'));
  const ownReplacement = ctx.self.hand.filter(card => !spent.includes(card.id));
  const manipulators = living.filter(player => player.general === 'standard.simayi' && player.handCount > 0);
  const replacementCounts = new Map(manipulators.map(player => [player.id, Math.min(8, player.handCount)]));
  const hitChance = (target: VisiblePlayer): number => {
    let chance = ctx.lightningRate;
    for (const player of manipulators) {
      const friendlyToTarget = ctx.relation(player.id) * ctx.relation(target.id) > 0;
      if (player.id === ctx.self.id) {
        const replacement = ownReplacement.findIndex(card => friendlyToTarget ? !hazardous(card) :
          ctx.relation(target.id) < 0 && hazardous(card));
        if (replacement >= 0) {
          chance = friendlyToTarget ? 0 : 1;
          // Reserve each physical card once; a single safe card cannot protect a whole circuit.
          ownReplacement.splice(replacement, 1);
        }
      } else if ((replacementCounts.get(player.id) ?? 0) > 0 && friendlyToTarget) {
        // A public hand count indicates a chance to have a safe replacement, never its actual identity.
        chance *= Math.pow(ctx.lightningRate, replacementCounts.get(player.id)!);
        replacementCounts.set(player.id, replacementCounts.get(player.id)! - 1);
      } else if ((replacementCounts.get(player.id) ?? 0) > 0 && ctx.relation(player.id) * ctx.relation(target.id) < 0) {
        chance += (1 - chance) * (1 - Math.pow(1 - ctx.lightningRate, replacementCounts.get(player.id)!));
        replacementCounts.set(player.id, replacementCounts.get(player.id)! - 1);
      }
    }
    return clamp(chance);
  };
  let reach = 1, expectedUtility = 0, enemyUpside = 0;
  let selfHitChance = ctx.lightningRate;
  for (const target of order) {
    const chance = hitChance(target);
    if (target.id === ctx.self.id) selfHitChance = chance;
    let utility = ctx.elementalUtility(target.id, 3, 'thunder');
    const direct = target.equip.armor?.name === 'baiyin' ? 1 : 3;
    const recipients = living.filter(player => player.id === target.id || target.chained && player.chained);
    for (const player of recipients) {
      const amount = player.equip.armor?.name === 'baiyin' ? 1 : direct;
      // A lord's death ends the identity game; do not trade them for an ordinary enemy.
      if (player.role === 'lord' && player.hp <= amount) utility -= ctx.relation(player.id) * 12;
    }
    const weight = reach * chance;
    expectedUtility += weight * utility;
    enemyUpside += weight * Math.max(0, utility);
    reach *= 1 - chance;
  }
  const appetite = clamp((deficit - 0.12) / 0.6);
  const comebackBonus = appetite * Math.min(6, enemyUpside * 2.5);
  const leadPenalty = clamp(-balance) * 3;
  const duplicate = ctx.self.judge.some(card => card.name === 'shandian');
  return { score: duplicate ? -3 : expectedUtility + comebackBonus - leadPenalty - 0.6,
    deficit, expectedUtility, comebackBonus, enemyUpside, selfHitChance };
}
