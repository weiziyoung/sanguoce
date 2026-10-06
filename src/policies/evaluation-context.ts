import { STANDARD_DECK, cardColor, cardTypeOf, type Card, type CardName, type DeckEntry, type DamageNature } from '../../catalog.ts';
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
    if (cardTypeOf(card) === 'equip') {
      const base = CARD_AI_PROFILE[card.name]?.equipValue ?? 3;
      const own = this.self.hand.some(item => item.id === id) ||
        Object.values(this.self.equip).some(item => item?.id === id);
      if (card.name === 'tengjia' && own) {
        const enemies = this.observation.others.filter(player => player.alive && this.relation(player.id) < -0.3);
        const fans = enemies.filter(player => player.equip.weapon?.name === 'zhuque' && player.handCount > 0).length;
        return base - 5 * fans / Math.max(1, enemies.length) - (this.self.chained ? 2 : 0);
      }
      return base;
    }
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
  shaEffect(id: number, costs: readonly number[], nature?: DamageNature,
    plan: { extraWine?: number; linked?: readonly number[] } = {}): number {
    const weapon = this.self.equip.weapon;
    const ignoresArmor = weapon?.name === 'qinggang' && !costs.includes(weapon.id);
    const black = costs.length > 0 && costs.every(cid => {
      const card = this.card(cid);
      return card !== undefined && cardColor(card) === 'black';
    });
    if (this.player(id)?.equip.armor?.name === 'renwang' && black && !ignoresArmor) return 0;
    const attribute = nature ?? (costs.length === 1 ? this.card(costs[0])?.nature : undefined) ?? 'normal';
    const armor = this.player(id)?.equip.armor?.name;
    const fan = weapon?.name === 'zhuque' && !costs.includes(weapon.id) && attribute === 'normal';
    if (armor === 'tengjia' && attribute === 'normal' && !ignoresArmor && !fan) return 0;
    const bonus = (this.self.drunk ?? 0) + (plan.extraWine ?? 0) +
      (weapon?.name === 'guding' && !costs.includes(weapon.id) && this.player(id)?.handCount === 0 ? 1 : 0);
    if (attribute !== 'normal' || bonus || armor === 'baiyin' || armor === 'tengjia' || fan) {
      const success = Math.pow(1 - this.responseRates.shan, this.player(id)?.handCount ?? 0);
      const direct = this.elementalUtility(id, 1 + bonus, attribute, ignoresArmor, plan.linked);
      return (fan ? Math.max(direct, this.elementalUtility(id, 1 + bonus, 'fire', false, plan.linked)) : direct) * success;
    }
    return this.targetEffect('sha', id);
  }

  chainUtility(id: number, linked?: readonly number[]): number {
    const player = this.player(id);
    if (!player?.alive) return 0;
    const relation = this.relation(id);
    if (player.chained) return relation * 3;
    if (relation >= 0) return -relation * 1.8;
    const others = [this.self, ...this.observation.others].filter(other => other.alive && other.id !== id);
    const partners = others.filter(other => linked ? linked.includes(other.id) : other.chained);
    const safePartners = partners.reduce((sum, other) => sum - this.relation(other.id), 0);
    if (safePartners > 0) return -relation * 1.8 * Math.min(1, safePartners);
    // A lone enemy cannot propagate damage without also linking our own side.
    return !partners.length && others.some(other => this.relation(other.id) < -0.3) ? -relation * 0.4 : 0;
  }
  /** Includes the publicly linked recipients; armor modifies each recipient once. */
  elementalUtility(id: number, amount: number, nature: DamageNature, ignoresArmor = false,
    linked?: readonly number[]): number {
    const target = this.player(id);
    if (!target?.alive) return 0;
    if (nature === 'normal' && target.equip.armor?.name === 'tengjia' && !ignoresArmor) return 0;
    const adjusted = (player: VisiblePlayer, base: number, ignore: boolean) => ignore ? base :
      player.equip.armor?.name === 'baiyin' ? Math.min(1, base) :
        player.equip.armor?.name === 'tengjia' && nature === 'fire' ? base + 1 : base;
    const first = adjusted(target, amount, ignoresArmor);
    const utility = (player: VisiblePlayer, value: number) => -this.relation(player.id) *
      (3.5 * value + (player.hp <= value ? 3 : 0));
    let result = utility(target, first);
    if (nature !== 'normal' && (linked ? linked.includes(id) : target.chained)) for (const player of [this.self, ...this.observation.others]) {
      if (player.id !== id && player.alive && (linked ? linked.includes(player.id) : player.chained))
        result += utility(player, adjusted(player, first, false));
    }
    return result;
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
    if (name === 'huogong') return this.elementalUtility(id, 1, 'fire');
    if (name === 'tiesuo') return this.chainUtility(id);
    if (name === 'bingliang') return enemy * 3;
    if (name === 'lebu') return enemy * (2 + Math.min(2, player.handCount * 0.4));
    if (name === 'shandian') return enemy * 2;
    if ((name === 'nanman' || name === 'wanjian') && player.equip.armor?.name === 'tengjia') return 0;
    if (name === 'nanman') return enemy * 3 * (1 - response('sha'));
    if (name === 'wanjian') return enemy * 3 * (1 - response('shan'));
    return 0;
  }
  bestOpponent(): VisiblePlayer | undefined {
    return this.observation.others.filter(player => player.alive)
      .sort((a, b) => this.relation(a.id) - this.relation(b.id))[0];
  }
}
