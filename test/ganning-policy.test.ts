import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardRuleset } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import type { ScoredAction } from '../src/policies/evaluation-registry.ts';
import { fixture } from './support/scenario-builder.ts';

const rules = new StandardRuleset();
const policy = new StrategicPolicy();

test('甘宁保留黑牌和过河拆桥，等待可见的关键牌', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.ganning';
  const black = f.hand(0, 'sha', 'spade');
  const guohe = f.hand(0, 'guohe');
  f.hand(1, 'shan');
  const state = f.start();
  const decision = rules.decision(state)!;
  const observation = rules.observe(state, 0);
  const qixi = rules.legalActions(state).find(choice =>
    (choice.data as ScoredAction)?.transformation === 'standard.qixi' &&
    (choice.data as ScoredAction)?.ids?.[0] === black)!;
  const ordinary = rules.legalActions(state).find(choice =>
    (choice.data as ScoredAction)?.cid === guohe)!;
  const ranked = policy.rank(observation, decision);
  assert.ok(ranked.find(row => row.id === qixi.id)!.score < 0);
  assert.ok(ranked.find(row => row.id === ordinary.id)!.score < 0);
});

test('甘宁用低价值黑牌奇袭，优先拆防具而非连弩或未知手牌', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.ganning';
  const black = f.hand(0, 'sha', 'spade');
  const wuxie = f.hand(0, 'wuxie', 'spade');
  const crossbow = f.equip(1, 'zhuge', 'weapon');
  const armor = f.equip(1, 'bagua', 'armor');
  f.hand(1, 'shan');
  f.hand(1, 'sha');
  let state = f.start();
  let decision = rules.decision(state)!;
  let chosen = rules.legalActions(state).find(choice => choice.id ===
    policy.choose(rules.observe(state, 0), decision))!;
  assert.deepEqual((chosen.data as ScoredAction).ids, [black]);
  assert.equal((chosen.data as ScoredAction).transformation, 'standard.qixi');
  state = rules.apply(state, chosen.id);
  while (rules.decision(state)?.kind === 'nullify') {
    const response = rules.decision(state)!;
    state = rules.apply(state, policy.choose(rules.observe(state, response.actor), response));
  }
  decision = rules.decision(state)!;
  assert.equal(decision.kind, 'zone');
  const observation = rules.observe(state, 0);
  chosen = rules.legalActions(state).find(choice => choice.id ===
    policy.choose(observation, decision))!;
  assert.equal((chosen.data as ScoredAction).cid, armor);
  state = rules.apply(state, chosen.id);
  assert.equal(state.players[1].equip.armor, null);
  assert.equal(state.players[1].equip.weapon, crossbow);
  assert.ok(state.players[0].hand.includes(wuxie));
});

test('甘宁优先拆马：防御马在防具前，进攻马在连弩前', () => {
  for (const horse of [
    { name: 'dilu', slot: 'plusHorse' },
    { name: 'chitu', slot: 'minusHorse' },
  ] as const) {
    const f = fixture();
    f.state.players[0].general = 'standard.ganning';
    f.hand(0, 'sha', 'spade');
    const mount = f.equip(1, horse.name, horse.slot);
    f.equip(1, 'zhuge', 'weapon');
    if (horse.slot === 'plusHorse') f.equip(1, 'bagua', 'armor');
    f.hand(1, 'shan');
    f.hand(1, 'sha');
    let state = f.start();
    let decision = rules.decision(state)!;
    state = rules.apply(state, policy.choose(rules.observe(state, 0), decision));
    while (rules.decision(state)?.kind === 'nullify') {
      decision = rules.decision(state)!;
      state = rules.apply(state, policy.choose(rules.observe(state, decision.actor), decision));
    }
    decision = rules.decision(state)!;
    assert.equal(decision.kind, 'zone');
    const chosen = rules.legalActions(state).find(choice => choice.id ===
      policy.choose(rules.observe(state, 0), decision))!;
    assert.equal((chosen.data as ScoredAction).cid, mount);
  }
});

test('甘宁不拆自己的在场装备来换对方的手牌', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.ganning';
  const armor = f.equip(0, 'bagua', 'armor');
  f.hand(1, 'shan');
  const state = f.start();
  const ranked = policy.rank(rules.observe(state, 0), rules.decision(state)!);
  const qixi = rules.legalActions(state).find(choice =>
    (choice.data as ScoredAction)?.ids?.[0] === armor)!;
  assert.ok(ranked.find(row => row.id === qixi.id)!.score < 0);
  assert.equal(ranked[0].id, 'end-play');
});
