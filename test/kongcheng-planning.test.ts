import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardRuleset, preparePlayScenario, type GameState } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { StrategicPolicy as V5Policy } from '../src/policies/versions/v5/strategic-policy.ts';
import type { ScoredAction } from '../src/policies/evaluation-registry.ts';
import { fixture } from './support/scenario-builder.ts';

const rules = new StandardRuleset();
const policy = new StrategicPolicy();
function selected(state: GameState, ai: Pick<StrategicPolicy, 'choose'> = policy) {
  const prompt = rules.decision(state)!;
  const id = ai.choose(rules.observe(state, prompt.actor), prompt);
  return { id, action: rules.legalActions(state).find(choice => choice.id === id)!.data as ScoredAction };
}

test('诸葛亮提前使用两张同值或较低价值装备清空手牌，真实空城禁止杀与决斗', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhugeliang';
  f.equip(0, 'zhuge', 'weapon');
  f.equip(0, 'bagua', 'armor');
  const axe = f.hand(0, 'guanshi');
  const armor = f.hand(0, 'renwang');
  const sha = f.hand(1, 'sha');
  const duel = f.hand(1, 'juedou');
  let state = f.start();
  assert.equal(selected(state, new V5Policy()).action.type, 'endPlay');
  for (let i = 0; i < 2; i++) {
    assert.equal(selected(state).action.type, 'play');
    state = rules.apply(state, selected(state).id);
  }
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.players[0].equip.weapon, axe);
  assert.equal(state.players[0].equip.armor, armor);
  const enemyPlay = rules.legalActions(preparePlayScenario(state, 1));
  assert.ok(!enemyPlay.some(choice => [sha, duel].includes((choice.data as ScoredAction).cid ?? -1)));
});

test('诸葛亮在弃牌之前换装清手，无法空城时保留闪而非强留装备', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhugeliang';
  f.state.players[0].hp = 1;
  f.equip(0, 'zhuge', 'weapon');
  const axe = f.hand(0, 'guanshi');
  const shan = f.hand(0, 'shan');
  f.hand(0, 'wuxie');
  let state = f.start();
  assert.equal(selected(state).action.cid, axe);
  state = rules.apply(state, selected(state).id);
  assert.equal(selected(state).action.type, 'endPlay');
  state = rules.apply(state, selected(state).id);
  assert.equal(rules.decision(state)!.kind, 'discard');
  assert.notEqual(selected(state).action.cid, shan);
  state = rules.apply(state, selected(state).id);
  assert.ok(state.players[0].hand.includes(shan));
  assert.equal(state.players[0].equip.weapon, axe);
});

test('诸葛亮保留连弩先用多张杀，再用贯石斧清空最后手牌', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhugeliang';
  f.equip(0, 'zhuge', 'weapon');
  const axe = f.hand(0, 'guanshi');
  f.hand(0, 'sha');
  f.hand(0, 'sha');
  let state = f.start();
  assert.equal(state.cards[selected(state).action.cid!].name, 'sha');
  assert.ok(policy.rank(rules.observe(state, 0), rules.decision(state)!)
    .find(choice => (rules.legalActions(state).find(option => option.id === choice.id)!.data as ScoredAction).cid === axe)!.score < 0);
  for (let i = 0; i < 10 && state.players[0].hand.length; i++) state = rules.apply(state, selected(state).id);
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.players[0].equip.weapon, axe);
});
