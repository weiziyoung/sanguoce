import { cardColor, cardTypeOf, equipSlotOf, type Card, type CardName } from "./catalog.ts";
import type { Choice, Decision, DecisionPolicy, Observation, VisiblePlayer } from "./contracts.ts";
import { CARD_AI_PROFILE } from "./card-ai-profile.ts";

type ActionData = { type: string; cid?: number; ids?: number[]; zone?: string };
const leaves = (choices: Choice[]): Choice[] =>
  choices.flatMap(choice => choice.children ? leaves(choice.children) : [choice]);
const dataOf = (choice: Choice): ActionData => choice.data as ActionData;

/** 无武将 1v1 的可见局面评分：自定义基础值 + 目标效果估计。 */
export class RuleBaseCardEvaluator {
  readonly observation: Observation;
  constructor(observation: Observation) { this.observation = observation; }

  get self(): VisiblePlayer & { hand: Card[] } { return this.observation.self; }
  get enemy(): VisiblePlayer {
    return this.observation.others.find(player => player.alive) ?? this.observation.others[0];
  }
  card(id?: number): Card | undefined {
    return this.self.hand.find(card => card.id === id) ??
      this.observation.table.find(card => card.id === id);
  }
  count(name: CardName): number {
    return this.self.hand.filter(card => card.name === name).length;
  }
  value(card?: Card): number {
    if (!card) return 0;
    if (card.name === "tao") return Math.max(5, 9.2 - this.self.hp);
    if (card.name === "wuzhong") return this.self.hp > 2 ? 9.2 :
      9.2 - 0.7 * Math.min(3, this.self.hand.length);
    if (card.name === "shunshou") return 5.5;
    if (card.name === "guohe") return 5;
    if (cardTypeOf(card) === "equip") return this.equipValue(card.name);
    const value = CARD_AI_PROFILE[card.name]?.value;
    if (Array.isArray(value)) {
      const position = this.self.hand.findIndex(item => item.id === card.id);
      const index = this.self.hand.slice(0, Math.max(0, position))
        .filter(item => item.name === card.name).length;
      return value[Math.min(index, value.length - 1)];
    }
    return typeof value === "number" ? value : 0;
  }
  equipValue(name: CardName): number {
    if (name === "zhuge") {
      const count = this.count("sha");
      return count > 1 ? 6 + count : 3 + count;
    }
    if (name === "qinglong") return Math.min(2.5 + this.count("sha"), 4);
    if (name === "zhangba") return Math.min(2.5 + this.self.hand.length / 3, 4);
    if (name === "guanshi") return Math.min(2.5 + this.self.hand.length / 2.5, 5);
    return CARD_AI_PROFILE[name]?.equipValue ?? 2.5;
  }
  order(name: CardName, card?: Card): number {
    if (name === "zhuge") return 3.1;
    return CARD_AI_PROFILE[name]?.order ?? (card && cardTypeOf(card) === 'equip' ? 2.5 : 1);
  }
  private responseOdds(target: VisiblePlayer, need: "sha" | "shan"): number {
    const portion = need === "shan" ? 15 / 108 : 30 / 108;
    return 1 - Math.pow(1 - portion, target.handCount);
  }
  private effect(name: CardName, card?: Card): number {
    const enemy = this.enemy;
    const self = this.self;
    if (name === "sha") {
      if (enemy.equip.armor?.name === "renwang" &&
          self.equip.weapon?.name !== "qinggang" && card && cardColor(card) === "black") return 0;
      return 1.5 * (1.35 - 0.7 * this.responseOdds(enemy, "shan")) *
        (enemy.hp <= 1 ? 1.5 : 1);
    }
    if (name === "tao") return self.hp < self.maxHp ? 2 * (self.hp <= 1 ? 4 : 1) : 0;
    if (name === "wuzhong") return 2;
    if (name === "taoyuan") return (self.hp < self.maxHp ? 2 : 0) -
      (enemy.hp < enemy.maxHp ? 2 : 0);
    if (name === "wugu") return 0.35;
    if (name === "nanman") return 1.5 * (1 - this.responseOdds(enemy, "sha"));
    if (name === "wanjian") return 1.5 * (1 - this.responseOdds(enemy, "shan"));
    if (name === "juedou") return 1.5 + this.count("sha") -
      2.3 * enemy.handCount * 30 / 108;
    if (name === "shunshou" || name === "guohe") {
      const equipped = Object.values(enemy.equip).filter(Boolean).length;
      return enemy.handCount || equipped || enemy.judge.length ?
        1 + 0.2 * (enemy.handCount + equipped) : 0;
    }
    if (name === "jiedao") {
      const weapon = enemy.equip.weapon;
      if (!weapon) return 0;
      const shaOdds = this.responseOdds(enemy, "sha");
      const protectedSelf = this.count("shan") > 0 || self.equip.armor?.name === "bagua";
      return this.equipValue(weapon.name) * (1 - shaOdds) / 5 -
        (protectedSelf ? 0 : 1.5 * shaOdds);
    }
    if (name === "lebu") return 0.4 + enemy.handCount * 0.3;
    if (name === "shandian") return self.hp >= 4 ? 0.15 : -0.5;
    return 0;
  }
  playScore(choice: Choice): number {
    const data = dataOf(choice);
    if (data.type === "endPlay") return 0;
    if (data.type === "virtualSha") {
      const cards = (data.ids ?? []).map(id => this.card(id)).filter((item): item is Card => !!item);
      if (this.enemy.equip.armor?.name === "renwang" &&
          this.self.equip.weapon?.name !== "qinggang" &&
          cards.length === 2 && cards.every(card => cardColor(card) === "black")) return -100;
      const cost = cards.reduce((sum, card) => sum + this.value(card), 0);
      return this.order("sha") + 1.2 * this.effect("sha") - 0.22 * cost;
    }
    const card = this.card(data.cid);
    if (!card) return -100;
    if (cardTypeOf(card) === "equip") {
      const old = this.self.equip[equipSlotOf(card)];
      const gain = this.equipValue(card.name) - (old ? this.equipValue(old.name) : 0);
      return gain > 0 ? this.order(card.name, card) + 1.2 * gain : -100;
    }
    const effect = this.effect(card.name, card);
    return effect > 0 ? this.order(card.name, card) + 1.2 * effect - 0.03 * this.value(card) : -100;
  }
}

/** 使用无名杀标准牌 ai.basic 数据及 get.effect 思路的独立 1v1 策略。 */
export class RuleBasePolicy implements DecisionPolicy {
  rank(observation: Observation, decision: Decision): { id: string; label: string; score: number }[] {
    const candidates = leaves(decision.options);
    if (!candidates.length) throw new Error("没有合法行动");
    const ai = new RuleBaseCardEvaluator(observation);
    const score = (choice: Choice): number => {
      const data = dataOf(choice);
      switch (decision.kind) {
        case "play": return ai.playScore(choice);
        case "discard": return -ai.value(ai.card(data.cid));
        case "respond":
          if (data.type === "pass") return 0;
          return data.type === "bagua" ? 12 : data.ids?.length === 2 ? 6 : 10;
        case "nullify": {
          if (data.type === "pass") return 0;
          const chain = observation.nullify;
          if (!chain) return 0;
          const harmful = new Set(["juedou", "nanman", "wanjian", "guohe",
            "shunshou", "jiedao", "lebu", "shandian"]);
          const againstSelf = chain.target === ai.self.id && harmful.has(chain.cname);
          const helpsEnemy = chain.target !== ai.self.id && !harmful.has(chain.cname);
          const wantsCancel = againstSelf || helpsEnemy;
          return (chain.parity % 2 === 0) === wantsCancel ? 7 : -5;
        }
        case "dying": return data.type === "save" && ai.self.hp <= 0 ? 10 : 0;
        case "zone":
        case "hanbingPick": {
          if (data.zone === "hand") return 3;
          const visible = [...Object.values(ai.enemy.equip), ...ai.enemy.judge]
            .find(card => card?.id === data.cid);
          if (visible?.name === "lebu") return -5;
          return visible ? ai.equipValue(visible.name) : 0;
        }
        case "wugu": return ai.value(ai.card(data.cid));
        case "jiedao": return data.type === "jiedaoSha" ? 6 : 0;
        case "cixiong": return data.type === "yes" ? 3 : 0;
        case "cixiongCost": return data.type === "draw" ? 0 : 5 - ai.value(ai.card(data.cid));
        case "qinglong": return data.type === "qinglong" ? 5 : 0;
        case "guanshi": return data.type === "guanshi" && ai.enemy.hp <= 1 ? 8 : 0;
        case "hanbing": return data.type === "yes" && ai.enemy.hp > 1 && ai.enemy.handCount > 2 ? 4 : 0;
        case "qilin": return data.type === "qilin" ? 5 : 0;
        default: return 0;
      }
    };
    return candidates.map(choice => ({ id: choice.id, label: choice.label, score: score(choice) }))
      .sort((left, right) => right.score - left.score);
  }
  choose(observation: Observation, decision: Decision): string {
    return this.rank(observation, decision)[0].id;
  }
}
