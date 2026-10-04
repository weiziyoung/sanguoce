import { cardTypeOf, type CardName } from "./catalog.ts";
import type { Choice, Decision, DecisionPolicy, Observation } from "./contracts.ts";

function leaves(options: Choice[]): Choice[] {
  return options.flatMap(option => option.children ? leaves(option.children) : [option]);
}
type ActionData = { type: string; cid?: number; ids?: number[]; zone?: string };

/** 早期的简化启发式策略，保留用于与无名杀基线做消融比较。 */
export class SimpleRulePolicy implements DecisionPolicy {
  choose(observation: Observation, decision: Decision): string {
    const candidates = leaves(decision.options);
    if (!candidates.length) throw new Error("没有合法行动");
    const self = observation.self;
    const enemy = observation.others.find(p => p.alive) ?? observation.others[0];
    const ownMissing = self.maxHp - self.hp;
    const enemyMissing = enemy.maxHp - enemy.hp;
    const ownSha = self.hand.filter(c => c.name === "sha").length;
    const cardOf = (cid?: number) => self.hand.find(c => c.id === cid) ??
      observation.table.find(c => c.id === cid);
    const cardValue = (cid?: number) => {
      const card = cardOf(cid);
      if (!card) return 0;
      const values: Partial<Record<CardName, number>> = {
        tao: self.hp <= 2 ? 10 : 8, shan: self.hp <= 2 ? 9 : 7,
        sha: 5, wuxie: 7, wuzhong: 8, shunshou: 7, guohe: 6,
        juedou: 4, nanman: 4, wanjian: 4, lebu: 6,
      };
      return values[card.name] ?? (cardTypeOf(card) === "equip" ? 5 : 3);
    };
    const score = (option: Choice): number => {
      const data = option.data as ActionData;
      switch (decision.kind) {
        case "play": {
          if (data.type === "endPlay") return 0;
          if (data.type === "virtualSha") return 2.5 - (data.ids?.reduce((n, id) => n + cardValue(id), 0) ?? 0) / 5;
          const c = cardOf(data.cid);
          if (!c) return -10;
          if (cardTypeOf(c) === "equip") {
            const already = Object.values(self.equip).some(item => item?.name === c.name);
            return already ? -1 : 5;
          }
          const values: Partial<Record<CardName, number>> = {
            tao: ownMissing ? 9 : -10,
            wuzhong: 8, guohe: 7, shunshou: 8,
            sha: 4 + (enemy.hp <= 1 ? 2 : 0),
            juedou: ownSha > 0 ? 5 : 1,
            nanman: enemy.handCount < 2 ? 6 : 3,
            wanjian: enemy.handCount < 2 ? 6 : 3,
            taoyuan: ownMissing > enemyMissing ? 4 : -2,
            wugu: self.handCount <= enemy.handCount ? 3 : 1,
            lebu: 5, shandian: self.hp > 3 ? 1 : -3,
            jiedao: 5,
          };
          return values[c.name] ?? 1;
        }
        case "discard": return -cardValue(data.cid);
        case "respond":
          if (data.type === "pass") return 0;
          if (data.type === "bagua") return 12;
          return data.ids?.length === 2 ? 6 : 10;
        case "nullify": {
          if (data.type === "pass") return 0;
          const n = observation.nullify;
          if (!n) return 0;
          const harmful = new Set(["sha", "juedou", "nanman", "wanjian", "guohe", "shunshou", "jiedao", "lebu", "shandian"]);
          const targetIsSelf = n.target === self.id;
          const negative = harmful.has(n.cname);
          const expectedAgainstSelf = targetIsSelf && negative;
          const expectedForEnemy = !targetIsSelf && !negative;
          const wantsCancel = expectedAgainstSelf || expectedForEnemy;
          return (n.parity % 2 === 0) === wantsCancel ? 7 : -5;
        }
        case "dying":
          return data.type === "save" && observation.self.hp <= 0 ? 10 : 0;
        case "zone":
        case "hanbingPick":
          return data.zone === "hand" ? 3 : 5;
        case "wugu": return cardValue(data.cid);
        case "jiedao": return data.type === "jiedaoSha" ? 6 : 0;
        case "cixiong": return data.type === "yes" ? 3 : 0;
        case "cixiongCost": return data.type === "draw" ? 0 : -cardValue(data.cid) + 5;
        case "qinglong": return data.type === "qinglong" ? 5 : 0;
        case "guanshi": return data.type === "guanshi" && enemy.hp <= 1 ? 8 : 0;
        case "hanbing": return data.type === "yes" && enemy.hp > 1 && enemy.handCount > 2 ? 4 : 0;
        case "qilin": return data.type === "qilin" ? 5 : 0;
        default: return 0;
      }
    };
    return candidates.reduce((best, current) => score(current) > score(best) ? current : best).id;
  }
}

export { RuleBasePolicy } from "./rule-base-policy.ts";
