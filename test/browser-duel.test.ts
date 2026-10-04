import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserDuel } from '../src/app/browser-duel.ts';
import { GameEngine, StandardRuleset } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { choiceLeaves, projectChoices } from '../src/presentation/choice-view.ts';
import { settlementSummary } from '../src/web/settlement.ts';

test('浏览器 1v1 和 CLI 共用选将、种子、决策与规则，可完整结束对局', () => {
  const browser = new BrowserDuel(42);
  const selected = browser.offer.player[0];
  browser.start(selected.id);
  const direct = new GameEngine(new StandardRuleset(), { seed: 42, players: [
    { label: selected.label, sex: selected.sex, general: selected.id },
    { label: browser.offer.computerPick.label, sex: browser.offer.computerPick.sex,
      general: browser.offer.computerPick.id },
  ] });
  const policy = new StrategicPolicy();
  let steps = 0;
  while (!browser.finished && steps++ < 1000) {
    const decision = browser.decision!;
    assert.deepEqual(browser.observation, direct.getObservation(0));
    assert.deepEqual(decision, direct.getDecision());
    const action = policy.choose(direct.getObservation(decision.actor), decision);
    if (decision.actor === 1) browser.computerStep();
    else browser.choose(action, decision.id!);
    direct.choose({ decisionId: decision.id!, optionId: action });
  }
  assert.ok(steps < 1000, '固定种子的对局应当结束');
  assert.equal(browser.observation.outcome.status, 'finished');
  assert.deepEqual(browser.observation, direct.getObservation(0));
  const summary = settlementSummary(browser.observation);
  assert.equal(summary.mode, '标准 1v1');
  assert.equal(summary.rows.length, 2);
  assert.ok(['胜 利', '落 败'].includes(summary.result));
  assert.match(summary.winner, /获胜/);
  const record = browser.gameDocument();
  assert.equal(record.format, 'sanguosha.web-game.v1');
  assert.equal(record.choices.length, steps);
  assert.ok(record.choices.some(choice => choice.human && choice.observation?.self.id === 0));
  assert.ok(record.choices.every(choice => choice.human === Boolean(choice.observation)));
  assert.ok(record.events.some(event => event.kind === 'damaged'));
  assert.deepEqual(record.outcome, browser.observation.outcome);
});

test('图形行动模型从合法动作数据提取卡牌和目标，不读取中文标签', () => {
  const browser = new BrowserDuel(42);
  browser.start(browser.offer.player[0].id);
  const decision = browser.decision!;
  const choices = projectChoices(decision);
  const physical = choices.find(choice => choice.cardIds.length > 0 && choice.targetIds.length > 0);
  assert.ok(physical);
  assert.ok(choiceLeaves([physical]).every(choice => choice.id));
  assert.ok(physical.cardIds.every(id => browser.observation.self.hand.some(card => card.id === id)));
});
