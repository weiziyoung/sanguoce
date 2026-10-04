import test from "node:test";
import assert from "node:assert/strict";
import { apply, createGame, decision, legalActions, observe } from "../engine.ts";
import { RuleBasePolicy } from "../policy.ts";

test("30 个固定种子的规则 AI 对局均可打到胜负且牌不重复", () => {
  const policy = new RuleBasePolicy();
  for (let seed = 1; seed <= 30; seed++) {
    let game = createGame({ seed });
    for (let step = 0; step < 2000 && game.outcome.status === 'ongoing'; step++) {
      const current = decision(game);
      assert.ok(current, `种子 ${seed} 的对局没有下一步`);
      const picked = policy.choose(observe(game, current.actor), current);
      assert.ok(legalActions(game).some(option => option.id === picked));
      game = apply(game, picked);
      const zones = [
        ...game.deck, ...game.discard, ...game.table,
        ...game.players.flatMap(p => [
          ...p.hand, ...Object.values(p.equip).filter((id): id is number => id !== null), ...p.judge,
        ]),
      ];
      assert.equal(zones.length, 108, `种子 ${seed} 第 ${step} 步牌数不守恒`);
      assert.equal(new Set(zones).size, 108, `种子 ${seed} 第 ${step} 步出现重复牌`);
    }
    assert.notEqual(game.outcome.status, 'ongoing', `种子 ${seed} 未在步数上限内结束`);
  }
});
