import test from 'node:test';
import assert from 'node:assert/strict';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EXPANDED_DECK } from '../catalog.ts';
import { expandedContent } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { preparePlayScenario, StandardRuleset } from '../engine.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { beginAttackUse } from '../src/rules/flows/attack-use-flow.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import type { ActionData, GameState } from '../src/domain/state.ts';
import type { DecisionPolicy } from '../contracts.ts';
import { fixture } from './support/scenario-builder.ts';

const runtime = new ContentRuntime(expandedContent);
const rules = new StandardRuleset(standardModes, undefined, expandedContent);
const policy = new StrategicPolicy(undefined, EXPANDED_DECK);
function selected(s: GameState, p: DecisionPolicy = policy): ActionData {
  const decision = rules.decision(s)!;
  const id = p.choose(rules.observe(s, decision.actor), decision);
  return rules.legalActions(s).find(option => option.id === id)!.data as ActionData;
}

test('先喝酒再出杀，真实流程保留增伤计划', () => {
  const f = fixture(2, { cards: 'junzheng' });
  const sha = f.hand(0, 'sha');
  const wine = f.hand(0, 'jiu');
  const state = preparePlayScenario(f.state, 0, runtime);
  assert.equal((selected(state) as { cid: number }).cid, wine);
  assert.equal((selected(rules.apply(state, `play:${wine}`)) as { cid: number }).cid, sha);
});

test('避开藤甲的普通杀，选择火杀', () => {
  const f = fixture(2, { cards: 'junzheng' });
  const normal = f.hand(0, 'sha');
  const fire = f.hand(0, 'sha', 'heart', 4);
  f.equip(1, 'tengjia', 'armor');
  const state = preparePlayScenario(f.state, 0, runtime);
  assert.equal((selected(state) as { cid: number }).cid, fire);
  const decision = rules.decision(state)!;
  const observation = rules.observe(state, 0);
  const normalId = `play:${normal}:1`;
  assert.ok(policy.rank(observation, decision).find(option => option.id === normalId)!.score < 0);
});

test('没有可出的杀时保留酒；火攻无剩余费用时结束出牌', () => {
  for (const name of ['jiu', 'huogong']) {
    const f = fixture(2, { cards: 'junzheng' });
    f.hand(0, name); f.hand(1, 'shan');
    assert.equal(selected(preparePlayScenario(f.state, 0, runtime)).type, 'endPlay');
  }
});

test('铁索为自己解链，重铸候选也得到有效评分', () => {
  const f = fixture(2, { cards: 'junzheng' });
  f.hand(0, 'tiesuo');
  f.state.players[0].chained = true;
  const state = preparePlayScenario(f.state, 0, runtime);
  const action = selected(state);
  assert.ok(action.type === 'play');
  assert.deepEqual(action.targets, [0]);
  const ranking = policy.rank(rules.observe(state, 0), rules.decision(state)!);
  assert.ok(ranking.find(option => option.id.startsWith('recast:'))!.score > 0);
});

test('羽扇考虑公开连环风险：会连伤自己时保留普通杀，藤甲目标则转火', () => {
  for (const chained of [false, true]) {
    const f = fixture(2, { cards: 'junzheng' });
    f.equip(0, 'zhuque', 'weapon');
    const sha = f.hand(0, 'sha');
    if (chained) f.state.players[0].chained = f.state.players[1].chained = true;
    else f.equip(1, 'tengjia', 'armor');
    f.state.resolution = resolutionStack.initial();
    beginAttackUse(f.state, 0, sha, [1], runtime);
    createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
    assert.equal(selected(f.state).type, chained ? 'no' : 'yes');
  }
});

test('持羽扇主动考虑把普通杀转火，能够攻击藤甲目标', () => {
  const f = fixture(2, { cards: 'junzheng' });
  f.equip(0, 'zhuque', 'weapon');
  f.equip(1, 'tengjia', 'armor');
  const sha = f.hand(0, 'sha');
  const state = preparePlayScenario(f.state, 0, runtime);
  assert.equal((selected(state) as { cid: number }).cid, sha);
});

test('火攻付款按目标和连环收益决策，不使用费用伤害自己', () => {
  const f = fixture(2, { cards: 'junzheng' });
  const fire = f.hand(0, 'huogong');
  const cost = f.hand(0, 'sha', 'heart');
  const show = f.hand(1, 'shan', 'heart');
  let state = preparePlayScenario(f.state, 0, runtime);
  state = rules.apply(state, `play:${fire}:1`);
  state = rules.apply(state, `fire-reveal:${show}`);
  assert.equal((selected(state) as { cid: number }).cid, cost);
  state.players[0].chained = state.players[1].chained = true;
  assert.equal(selected(state).type, 'pass');
});
