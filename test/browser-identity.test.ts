import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserIdentity } from '../src/app/browser-identity.ts';
import { GameEngine, StandardRuleset } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { settlementSummary } from '../src/web/settlement.ts';

test('网页五人局沿用选将、身份、共用规则和 AI 决策，可从任意人类座位运行至结算', () => {
  const browser = new BrowserIdentity(7);
  assert.equal(browser.humanSeat, 2);
  assert.equal(browser.lordSeat, 0);
  assert.equal(browser.role, 'rebel');
  assert.equal(browser.candidates.length, 3);
  assert.equal(new Set(browser.offer.candidates.flat().map(general => general.id)).size, 17);
  const selected = browser.candidates[0];
  browser.start(selected.id);
  const generals = browser.offer.computerPicks.map((pick, seat) => seat === browser.humanSeat ? selected : pick);
  const direct = new GameEngine(new StandardRuleset(), { mode: 'identity', seed: browser.seed,
    players: generals.map((general, seat) => ({
      label: seat === browser.humanSeat ? '你' : `电脑${seat + 1}`,
      sex: general.sex, general: general.id,
    })),
  });
  assert.equal(browser.observation.self.id, 2);
  assert.equal(browser.observation.active, 0);
  assert.equal(browser.observation.others.find(player => player.id === 0)?.role, 'lord');
  assert.ok(browser.observation.others.filter(player => player.id !== 0).every(player => player.role === undefined));
  const policy = new StrategicPolicy();
  let steps = 0;
  while (!browser.finished && steps++ < 5000) {
    const prompt = browser.decision!;
    assert.deepEqual(browser.observation, direct.getObservation(browser.humanSeat));
    assert.deepEqual(prompt, direct.getDecision());
    const action = policy.choose(direct.getObservation(prompt.actor), prompt);
    if (prompt.actor === browser.humanSeat) browser.choose(action, prompt.id!);
    else browser.computerStep();
    direct.choose({ decisionId: prompt.id!, optionId: action });
  }
  assert.ok(browser.finished && steps < 5000);
  assert.deepEqual(browser.observation, direct.getObservation(browser.humanSeat));
  const summary = settlementSummary(browser.observation);
  assert.equal(summary.mode, '标准五人身份局');
  assert.equal(browser.observation.outcome.status, 'finished');
  if (browser.observation.outcome.status === 'finished') {
    assert.equal(summary.result, browser.observation.outcome.winners.includes(browser.humanSeat) ? '胜 利' : '落 败');
    assert.match(summary.winner, /获胜$/);
  }
  assert.equal(summary.rows.length, 5);
  assert.deepEqual(summary.rows.map(row => row.role).sort(), ['主公', '内奸', '反贼', '反贼', '忠臣'].sort());
  assert.equal(summary.rows[0].seat, 1);
});

test('网页五人局主公玩家从五名候选选将，且主公固定座位一', () => {
  const browser = new BrowserIdentity(3205);
  assert.equal(browser.humanSeat, 0);
  assert.equal(browser.role, 'lord');
  assert.equal(browser.candidates.length, 5);
  browser.start(browser.candidates[0].id);
  assert.equal(browser.observation.self.maxHp, browser.candidates[0].hp + 1);
  assert.equal(browser.observation.active, 0);
});
