import { STANDARD_DECK, cardColor, cardTypeOf, type Card, type CardName, type DeckEntry } from '../../catalog.ts';
import type { Observation, VisiblePlayer } from '../../contracts.ts';
import { CARD_AI_PROFILE } from '../../card-ai-profile.ts';
import { RelationshipModel } from './relationship-model.ts';

/** All estimates are made from the acting player's public observation. */
export class EvaluationContext {
  readonly observation: Observation;
  readonly relationships: RelationshipModel;
  readonly responseRates: { sha: number; shan: number };
  constructor(observation: Observation, deck: readonly DeckEntry[] = STANDARD_DECK) {
    if (!deck.length) throw new Error('AI 牌堆统计不能为空');
    this.observation = observation;
    this.relationships = new RelationshipModel(observation);
    this.responseRates = {
      sha: deck.filter(card => card.name === 'sha').length / deck.length,
      shan: deck.filter(card => card.name === 'shan').length / deck.length,
    };
  }

  get self() { return this.observation.self; }
  player(id: number): VisiblePlayer | undefined {
    return id === this.self.id ? this.self : this.observation.others.find(player => player.id === id);
  }
  card(id: number | undefined): Card | undefined {
    return this.self.hand.find(card => card.id === id) ?? this.observation.table.find(card => card.id === id) ??
      Object.values(this.self.equip).find(card => card?.id === id) ??
      this.observation.others.flatMap(player => [...Object.values(player.equip), ...player.judge])
        .find(card => card?.id === id) ?? undefined;
  }
  value(id: number | undefined): number {
    const card = this.card(id);
    if (!card) return 0;
    if (card.name === 'tao') return this.self.hp <= 2 ? 10 : 8;
    if (card.name === 'shan') return this.self.hp <= 2 ? 9 : 7;
    if (cardTypeOf(card) === 'equip') return CARD_AI_PROFILE[card.name]?.equipValue ?? 3;
    const value = CARD_AI_PROFILE[card.name]?.value;
    if (Array.isArray(value)) {
      const duplicates = this.self.hand.filter(item => item.name === card.name && item.id < card.id).length;
      return value[Math.min(duplicates, value.length - 1)];
    }
    return typeof value === 'number' ? value : 4;
  }
  order(name: CardName): number { return CARD_AI_PROFILE[name]?.order ?? 2; }

  /** Positive means helping the target advances our side. Hidden roles remain uncertain. */
  relation(id: number): number { return this.relationships.relation(id); }

  /** Physical and transformed Sha share the engine's all-black cost rule. */
  shaEffect(id: number, costs: readonly number[]): number {
    const weapon = this.self.equip.weapon;
    const ignoresArmor = weapon?.name === 'qinggang' && !costs.includes(weapon.id);
    const black = costs.length > 0 && costs.every(cid => {
      const card = this.card(cid);
      return card !== undefined && cardColor(card) === 'black';
    });
    if (this.player(id)?.equip.armor?.name === 'renwang' && black && !ignoresArmor) return 0;
    return this.targetEffect('sha', id);
  }

  /** Utility of a direct one-target effect, before action order and card costs. */
  targetEffect(name: CardName, id: number): number {
    const player = this.player(id);
    if (!player?.alive) return 0;
    const relation = this.relation(id);
    const enemy = -relation;
    const missing = player.maxHp - player.hp;
    const response = (kind: 'sha' | 'shan') => 1 - Math.pow(1 - this.responseRates[kind], player.handCount);
    if (name === 'sha') return enemy * (3.5 + (player.hp <= 1 ? 3 : 0)) * (1 - response('shan'));
    if (name === 'juedou') return enemy * (3 + (player.hp <= 1 ? 2 : 0)) * (1 - response('sha') * 0.5);
    if (name === 'tao' || name === 'taoyuan') return missing > 0 ? relation * (player.hp <= 1 ? 8 : 4) : 0;
    if (name === 'wuzhong') return relation * 5;
    if (name === 'guohe' || name === 'shunshou') return enemy * (player.handCount + Object.values(player.equip).filter(Boolean).length + player.judge.length > 0 ? 3 : 0);
    if (name === 'lebu') return enemy * (2 + Math.min(2, player.handCount * 0.4));
    if (name === 'shandian') return enemy * 2;
    if (name === 'nanman') return enemy * 3 * (1 - response('sha'));
    if (name === 'wanjian') return enemy * 3 * (1 - response('shan'));
    return 0;
  }
  bestOpponent(): VisiblePlayer | undefined {
    return this.observation.others.filter(player => player.alive)
      .sort((a, b) => this.relation(a.id) - this.relation(b.id))[0];
  }
}
