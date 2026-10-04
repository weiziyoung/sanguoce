import type { Decision } from '../../contracts.ts';
import { choiceLeaves, projectChoices, type ActionChoice } from '../presentation/choice-view.ts';

const sameCards = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every(id => b.includes(id));

/** Selection only narrows legal leaves. It never constructs an action or decides a rule. */
export class TableInteraction {
  readonly decision: Decision;
  readonly roots: ActionChoice[];
  readonly leaves: ActionChoice[];
  cards: number[] = [];
  targets: number[] = [];
  focus: ActionChoice | null = null;

  constructor(decision: Decision) {
    this.decision = decision;
    this.roots = projectChoices(decision);
    this.leaves = choiceLeaves(this.roots);
  }

  clear(): void { this.cards = []; this.targets = []; this.focus = null; }
  scope(choice: ActionChoice): void { this.clear(); this.focus = choice; }

  get tuxiIntent(): ActionChoice | null {
    if (this.decision.kind !== 'phaseDrawChoice') return null;
    const children = this.leaves.filter(choice => choice.actionType === 'skill' && choice.ability === 'standard.tuxi');
    return children.length ? { id: 'ui:standard.tuxi', label: '发动突袭', ability: 'standard.tuxi',
      cardIds: [], targetIds: [], children } : null;
  }
  get tuxiActive(): boolean { return this.focus?.id === 'ui:standard.tuxi'; }
  get normalDrawChoice(): ActionChoice | undefined {
    return this.decision.kind === 'phaseDrawChoice' ? this.leaves.find(choice => choice.actionType === 'normal') : undefined;
  }

  get ganglieDiscardIntent(): ActionChoice | null {
    const context = this.decision.context as { ability?: string } | undefined;
    if (this.decision.kind !== 'skillJudgementChoice' || context?.ability !== 'standard.ganglie') return null;
    const children = this.leaves.filter(choice => choice.actionType === 'choose' && choice.cardIds.length === 2);
    return { id: 'ui:ganglie-discard', label: '弃两张手牌', cardIds: [], targetIds: [], children };
  }
  get ganglieDiscardActive(): boolean { return this.focus?.id === 'ui:ganglie-discard'; }
  get ganglieDamageChoice(): ActionChoice | undefined {
    if (!this.ganglieDiscardIntent) return undefined;
    return this.leaves.find(choice => choice.actionType === 'choose' && choice.cardIds.length === 0);
  }

  get scoped(): ActionChoice[] {
    if (this.focus) return choiceLeaves([this.focus]);
    if (this.tuxiIntent) return this.leaves.filter(choice => choice.ability !== 'standard.tuxi');
    // Ordinary card use and skill conversion are deliberately distinct user intents.
    return this.decision.kind === 'play' ? this.leaves.filter(choice => !choice.ability) : this.leaves;
  }

  get candidates(): ActionChoice[] {
    return this.scoped.filter(choice => this.cards.every(id => choice.cardIds.includes(id)) &&
      this.targets.every((id, index) => this.tuxiActive ? choice.targetIds.includes(id) : choice.targetIds[index] === id));
  }

  get selectableCards(): number[] {
    if (this.ganglieDiscardIntent && !this.ganglieDiscardActive) return [];
    return [...new Set(this.scoped.flatMap(choice => choice.cardIds))];
  }
  get nextTargets(): number[] {
    return [...new Set(this.candidates.filter(choice => sameCards(choice.cardIds, this.cards))
      .flatMap(choice => choice.targetIds.length > this.targets.length ?
        this.tuxiActive ? choice.targetIds.filter(id => !this.targets.includes(id)) : [choice.targetIds[this.targets.length]] : []))];
  }
  get exact(): ActionChoice[] {
    return this.candidates.filter(choice => sameCards(choice.cardIds, this.cards) && choice.targetIds.length === this.targets.length);
  }

  get batchDiscard(): ActionChoice[] {
    if (this.decision.kind !== 'discard') return [];
    const required = (this.decision.context as { required?: number }).required;
    if (!Number.isInteger(required) || this.cards.length !== required) return [];
    const selected = this.cards.map(id => this.leaves.find(choice =>
      choice.actionType === 'discard' && choice.cardIds.length === 1 && choice.cardIds[0] === id));
    return selected.every((choice): choice is ActionChoice => Boolean(choice)) ? selected as ActionChoice[] : [];
  }

  selectCard(id: number, extend = true): boolean {
    if (!this.selectableCards.includes(id)) return false;
    this.targets = [];
    if (this.cards.includes(id)) this.cards = this.cards.filter(card => card !== id);
    else {
      if ((this.ganglieDiscardActive || this.decision.kind === 'guanshi') && this.cards.length >= 2) return false;
      if (this.decision.kind === 'discard') {
        const required = (this.decision.context as { required?: number }).required ?? 1;
        if (this.cards.length >= required) return false;
        this.cards = [...this.cards, id];
        return true;
      }
      const next = [...this.cards, id];
      this.cards = extend && this.scoped.some(choice => next.every(card => choice.cardIds.includes(card))) ? next : [id];
    }
    return true;
  }

  dragCard(id: number): boolean {
    if (!this.selectableCards.includes(id)) return false;
    if (!this.cards.includes(id)) this.selectCard(id);
    this.targets = [];
    return true;
  }

  selectTarget(id: number): boolean {
    if (this.tuxiActive && this.targets.includes(id)) {
      this.targets = this.targets.filter(target => target !== id);
      return true;
    }
    if (!this.nextTargets.includes(id)) return false;
    this.targets.push(id);
    return true;
  }

  get selectedByRule(): number[] {
    const context = this.decision.context as { selectedIds?: unknown } | undefined;
    return Array.isArray(context?.selectedIds) ? context.selectedIds.filter((id): id is number => typeof id === 'number') : [];
  }
}
