import { militaryPlayScore, militaryChoiceScore } from './content/junzheng.ts';
import { STANDARD_DECK, cardTypeOf, equipSlotOf, type CardName, type DeckEntry } from '../../catalog.ts';
import type { Choice, Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import { EvaluationContext } from './evaluation-context.ts';
import { EvaluationRegistry, type ScoredAction } from './evaluation-registry.ts';
import { standardSkillEvaluations } from './content/standard-skills.ts';
import { canCompleteResponse } from './response-plan.ts';

const leaves = (choices: Choice[]): Choice[] => choices.flatMap(choice => choice.children ? leaves(choice.children) : [choice]);
const actionOf = (choice: Choice): ScoredAction => (choice.data ?? {}) as ScoredAction;
const fields = (decision: Decision): Record<string, unknown> =>
  decision.context && typeof decision.context === 'object' ? decision.context as Record<string, unknown> : {};
const numberField = (decision: Decision, key: string): number | undefined => {
  const value = fields(decision)[key];
  return typeof value === 'number' ? value : undefined;
};
const stringField = (decision: Decision, key: string): string | undefined => {
  const value = fields(decision)[key];
  return typeof value === 'string' ? value : undefined;
};

/** One policy for duel and identity games; skill-specific logic is supplied by a registry. */
export class StrategicPolicy implements DecisionPolicy {
  readonly evaluations: EvaluationRegistry;
  readonly deck: readonly DeckEntry[];
  constructor(evaluations: EvaluationRegistry = standardSkillEvaluations(), deck: readonly DeckEntry[] = STANDARD_DECK) {
    this.evaluations = evaluations;
    this.deck = deck;
  }

  rank(observation: Observation, decision: Decision): { id: string; label: string; score: number }[] {
    const candidates = leaves(decision.options);
    if (!candidates.length) throw new Error('没有合法行动');
    const context = new EvaluationContext(observation, this.deck);
    const ranked = candidates.map((choice, index) => {
      const action = actionOf(choice);
      const ability = action.ability ?? action.transformation ?? stringField(decision, 'ability') ??
        stringField(decision, 'definition');
      const specialist = this.evaluations.score(ability, context, decision, choice, action);
      let score = this.evaluations.adjust(context, decision, choice, action,
        specialist ?? this.score(context, decision, choice, action));
      if (context.renegade && (action.targets ?? (action.target === undefined ? [] : [action.target]))
        .some(id => context.protectsLord(id)) &&
        (decision.kind === 'attackRedirect' || ability === 'standard.lijian' || ability === 'standard.fanjian')) score = -100;
      return { id: choice.id, label: choice.label,
        score: canCompleteResponse(context, decision, action, candidates) ? score : -100, index };
    });
    if (decision.kind === 'play' && observation.self.drunk) {
      const attacks = ranked.filter(row => {
        const action = actionOf(candidates[row.index]);
        return row.score > 0 && (action.type === 'virtualSha' ||
          action.type === 'play' && context.card(action.cid)?.name === 'sha');
      });
      if (attacks.length) {
        // Finish the publicly pending wine attack before spending its cards on another plan.
        const boost = Math.max(0, Math.max(...ranked.map(row => row.score)) - Math.max(...attacks.map(row => row.score)) + 0.5);
        for (const row of attacks) row.score += boost;
      }
    }
    return ranked.sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ index: _index, ...candidate }) => candidate);
  }
  choose(observation: Observation, decision: Decision): string { return this.rank(observation, decision)[0].id; }

  private play(context: EvaluationContext, decision: Decision, action: ScoredAction, candidates: readonly Choice[]): number {
    const military = militaryPlayScore(context, action, candidates, (choice, planned = context) => {
      const attack = actionOf(choice);
      const base = this.evaluations.score(attack.ability ?? attack.transformation, planned, decision, choice, attack) ??
        this.play(planned, decision, attack, candidates);
      return this.evaluations.adjust(planned, decision, choice, attack, base) > 0;
    });
    if (military !== undefined) return military;
    if (action.type === 'endPlay') return 0;
    if (action.type === 'beginSkill') return -2;
    // A failed proactive request leaves the same decision available and can loop forever.
    // Defer proactive lord proxy attacks until the policy has explicit failed-request memory.
    if (action.type === 'proxySha') return -2;
    if (action.type === 'activeSkill') return -2;
    const physical = context.card(action.cid);
    const effective = action.type === 'virtualSha' ? 'sha' :
      action.type === 'virtualTrick' || action.type === 'virtualDelay' ?
        (action as { cname?: CardName }).cname : physical?.name;
    if (!effective) return -100;
    const costs = action.ids ?? (action.cid === undefined ? [] : [action.cid]);
    const cost = costs.reduce((sum, id) => sum + context.value(id), 0);
    if (effective === 'tao') return context.self.hp < context.self.maxHp ?
      8 + (context.self.hp <= 1 ? 4 : 0) : -100;
    if (effective === 'wuzhong') return 9;
    if (effective === 'shandian') return context.lightning(costs).score;
    if (physical && cardTypeOf(physical) === 'equip') {
      const old = context.self.equip[equipSlotOf(physical)];
      const gain = context.value(physical.id) - (old ? context.value(old.id) : 0) +
        (old?.name === 'baiyin' && context.self.hp < context.self.maxHp ? 4 : 0);
      return gain > 0.5 ? context.order(effective) + gain : -3;
    }
    if (effective === 'taoyuan' || effective === 'nanman' || effective === 'wanjian') {
      const targets = [context.self, ...context.observation.others].filter(player => player.alive);
      const effect = targets.reduce((sum, player) => sum + context.targetEffect(effective, player.id), 0);
      return effect > 0 ? context.order(effective) + effect - 0.2 * cost : -3;
    }
    if (effective === 'wugu') {
      if (context.renegade) {
        const gain = [context.self, ...context.observation.others].filter(player => player.alive)
          .reduce((sum, player) => sum + context.relation(player.id), 0);
        return gain > 0 ? 1 + gain * 2 - 0.2 * cost : -0.5;
      }
      return context.observation.others.every(p => context.relation(p.id) >= 0) ? 2 : -0.5;
    }
    const targets = action.targets ?? [];
    let effect = targets.reduce((sum, id) => sum + (effective === 'sha' ?
      context.shaEffect(id, costs, action.type === 'virtualSha' ? 'normal' : undefined) : context.targetEffect(effective, id)), 0);
    if (effective === 'jiedao' && targets.length >= 2) {
      if (context.protectsLord(targets[1])) return -100;
      effect = -context.relation(targets[0]) * 1.5 + context.targetEffect('sha', targets[1]) * 0.5;
    }
    if (effect <= 0) return -3;
    return context.order(effective) + effect - (action.type === 'play' ? 0.03 : 0.3) * cost;
  }

  private score(context: EvaluationContext, decision: Decision, choice: Choice, action: ScoredAction): number {
    const target = action.targets?.[0] ?? action.target;
    const military = militaryChoiceScore(context, decision, action);
    if (military !== undefined) return military;
    switch (decision.kind) {
      case 'play': return this.play(context, decision, action, leaves(decision.options));
      case 'discard': return -context.value(action.cid);
      case 'respond': {
        if (action.type === 'pass') return 0;
        if (action.type === 'bagua') return 12;
        if (action.type === 'proxy') return 9;
        return 10 - 0.25 * (action.ids ?? []).reduce((sum, id) => sum + context.value(id), 0);
      }
      case 'proxyResponse': {
        const requester = numberField(decision, 'requester');
        if (requester === undefined || context.relation(requester) <= 0) return action.type === 'pass' ? 0 : -2;
        return action.type === 'pass' ? 0 : 4 - 0.25 * context.value(action.ids?.[0]);
      }
      case 'dying': {
        const dying = numberField(decision, 'target');
        const relation = dying === undefined ? 0 : context.relation(dying);
        return action.type === 'save' ? (dying === context.self.id ? 15 : relation * 9) -
          0.1 * context.value(action.ids?.[0]) : 0;
      }
      case 'nullify': {
        if (action.type === 'pass') return 0;
        const chain = context.observation.nullify;
        if (!chain) return -1;
        const effect = context.targetEffect(chain.cname as CardName, chain.target);
        return (chain.parity % 2 === 0 ? -effect : effect) - 1;
      }
      case 'zone': case 'hanbingPick': {
        const victim = numberField(decision, 'target');
        const relation = victim === undefined ? -1 : context.relation(victim);
        if (action.type !== 'zone') return 0;
        const stealing = context.renegade && stringField(decision, 'cname') === 'shunshou';
        if ((action as { zone?: string }).zone === 'hand') return -relation * 2 + (stealing ? 2 : 0);
        const card = context.card(action.cid);
        if (card?.name === 'lebu' || card?.name === 'bingliang') return relation * 5;
        const acquisition = stealing && card ? cardTypeOf(card) === 'equip' ?
          Math.max(1, context.value(card.id) - context.value(context.self.equip[equipSlotOf(card)]?.id)) :
          context.value(card.id) : 0;
        return -relation * (card ? context.value(card.id) : 2) + acquisition;
      }
      case 'wugu': return context.value(action.cid);
      case 'skillCost': {
        const selected = fields(decision).selectedIds;
        const count = Array.isArray(selected) ? selected.length : 0;
        if (action.type === 'cancel') return count ? -5 : 0;
        if (action.type === 'confirm') return count ? 0.5 : -5;
        return action.type === 'toggle' ? 4 - context.value(action.cid) : -5;
      }
      case 'skillTarget': return target === undefined ? 0 : context.relation(target) * 3;
      case 'distribution': return target === undefined ? 0 :
        context.relation(target) * 3 + (target === context.self.id ? 1 : 0) + 0.1 * context.value(action.card);
      case 'deckReorder': {
        const value = context.value(action.card);
        // Top placements are stacked: the last selected card is drawn first.
        return (action as { side?: string }).side === 'bottom' ? 3 - value / 2 : 1 + (10 - value) / 20;
      }
      case 'phaseDrawChoice': return action.type === 'normal' ? 1.5 : 2;
      case 'phaseDiscardChoice': return action.type === 'skip' ? 5 : 0;
      case 'phaseStartChoice': case 'phaseEndChoice': case 'triggerConfirm':
        return action.type === 'yes' ? 2 : 0;
      case 'attackRedirect': {
        if (action.type === 'pass') return 0;
        return target === undefined ? -3 : 4 - 0.4 * context.value(action.card) -
          4 * context.relation(target);
      }
      case 'skillJudgementChoice': {
        if (action.choice === 'damage') return context.self.hp <= 1 ? -10 : -4;
        const ids = action.choice?.split(':').slice(1).map(Number) ?? [];
        return -0.4 * ids.reduce((sum, id) => sum + context.value(id), 0);
      }
      case 'judgeReplace': return action.type === 'pass' ? 0 : -0.2 * context.value(action.cid);
      case 'skillFollowup': return 0;
      case 'jiedao': {
        const victim = numberField(decision, 'target');
        if (action.type === 'jiedaoSha' && victim !== undefined && context.protectsLord(victim)) return -100;
        return action.type === 'jiedaoSha' ? 6 : 0;
      }
      case 'cixiong': return action.type === 'yes' ? 3 : 0;
      case 'cixiongCost': return action.type === 'draw' ? 0 : 5 - context.value(action.cid);
      case 'qinglong': {
        if (action.type !== 'qinglong') return 0;
        const victim = target ?? numberField(decision, 'target');
        return victim !== undefined && context.shaEffect(victim, action.ids ?? []) > 0 ? 5 : -3;
      }
      case 'guanshi': {
        const victim = target ?? numberField(decision, 'target');
        return action.type === 'guanshi' && victim !== undefined &&
          context.player(victim)?.hp === 1 && context.relation(victim) < 0 ? 8 : 0;
      }
      case 'hanbing': {
        const victim = numberField(decision, 'target');
        if (action.type !== 'yes' || victim === undefined) return 0;
        const player = context.player(victim);
        return player && player.hp > 1 && player.handCount > 1 && context.relation(victim) < 0 ? 2 : -1;
      }
      case 'qilin': return action.type === 'qilin' ? 5 : 0;
      default: return 0;
    }
  }
}
