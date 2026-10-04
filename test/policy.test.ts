import test from "node:test";
import assert from "node:assert/strict";
import { NAMES, type Card, type CardName } from "../catalog.ts";
import type { Choice, Decision, Observation } from "../contracts.ts";
import { CARD_AI_PROFILE } from "../card-ai-profile.ts";
import { RuleBasePolicy } from "../rule-base-policy.ts";

const makeCard = (id: number, name: CardName, suit: Card["suit"] = "heart"): Card =>
  ({ id, name, suit, rank: 7 });
function situation(hand: Card[], enemyHandCount = 1, ownHp = 4, enemyHp = 4): Observation {
  return {
    turn: 1, phase: "play", active: 0, actor: 0,
    self: {
      id: 0, label: "我方", sex: "male", hp: ownHp, maxHp: 4, alive: true,
      handCount: hand.length, hand, equip: { weapon: null, armor: null, plusHorse: null, minusHorse: null },
      judge: [],
    },
    others: [{
      id: 1, label: "对手", sex: "female", hp: enemyHp, maxHp: 4, alive: true,
      handCount: enemyHandCount,
      equip: { weapon: null, armor: null, plusHorse: null, minusHorse: null },
      judge: [],
    }],
    deckCount: 80, discardCount: 20, discardTop: null, table: [], shaUsed: 0,
    nullify: null, log: [], events: [], outcome: { status: 'ongoing' }, mode: { id: 'duel' },
  };
}
function playDecision(cards: Card[]): Decision {
  const options: Choice[] = cards.map(card => ({
    id: String(card.id), label: "使用【" + NAMES[card.name] + "】",
    data: { type: "play", cid: card.id, targets: [1] },
  }));
  options.push({ id: "end", label: "结束出牌阶段", data: { type: "endPlay" } });
  return { actor: 0, kind: "play", title: "出牌阶段", options };
}

test("自定义基础值优先回血和补牌，并降低重复响应牌的保留价值", () => {
  assert.ok(CARD_AI_PROFILE.tao!.order! > CARD_AI_PROFILE.wuzhong!.order!);
  assert.ok(CARD_AI_PROFILE.wuzhong!.order! > CARD_AI_PROFILE.sha!.order!);
  for (const name of ["sha", "shan", "wuxie"]) {
    const value = CARD_AI_PROFILE[name]!.value as readonly number[];
    assert.ok(value[0] > value[1] && value[1] > value[2]);
  }
});

test("有正收益时先无中生有再杀；濒危时桃优先", () => {
  const sha = makeCard(1, "sha");
  const wuzhong = makeCard(2, "wuzhong");
  const tao = makeCard(3, "tao");
  const guohe = makeCard(4, "guohe");
  const policy = new RuleBasePolicy();
  const ranked = policy.rank(situation([sha, wuzhong]), playDecision([sha, wuzhong]));
  assert.equal(ranked[0].id, "2");
  assert.ok(ranked[0].score > ranked[1].score);
  assert.equal(policy.choose(situation([tao, guohe], 2, 1), playDecision([tao, guohe])), "3");
});

test("桃园结义只治疗对手时不出；仁王盾前不使用黑色杀", () => {
  const taoyuan = makeCard(1, "taoyuan");
  const blackSha = makeCard(2, "sha", "spade");
  const redSha = makeCard(3, "sha", "heart");
  const policy = new RuleBasePolicy();
  assert.equal(policy.choose(situation([taoyuan], 1, 4, 2), playDecision([taoyuan])), "end");
  const state = situation([blackSha, redSha]);
  state.others[0].equip.armor = makeCard(4, "renwang", "club");
  assert.equal(policy.choose(state, playDecision([blackSha, redSha])), "3");
});
