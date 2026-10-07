import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPANDED_DECK } from '../catalog.ts';
import { StandardRuleset, preparePlayScenario } from '../engine.ts';
import { expandedContent } from '../src/app/game-content.ts';
import { standardGeneralDefinitions } from '../src/content/standard/generals.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { StrategicPolicy as V9 } from '../src/policies/versions/v9/strategic-policy.ts';
import { fixture } from './support/scenario-builder.ts';

const rules = new StandardRuleset(undefined, undefined, expandedContent);
const policy = new StrategicPolicy(undefined, EXPANDED_DECK);
const old = new V9(undefined, EXPANDED_DECK);
const start = (f: ReturnType<typeof fixture>) => preparePlayScenario(f.state, 0, new ContentRuntime(expandedContent));
const choose = (state: ReturnType<typeof start>, p: Pick<StrategicPolicy, 'choose'> = policy) => p.choose(rules.observe(state, rules.decision(state)!.actor), rules.decision(state)!);

test('v9孙权喝酒后优先制衡而可能换掉杀；v10先兑现酒杀，实际伤害为2', () => {
  const f = fixture(2, { cards: 'junzheng' });
  f.state.players[0].general = 'standard.sunquan';
  const wine = f.hand(0, 'jiu'), sha = f.hand(0, 'sha');
  let state = start(f);
  assert.equal(choose(state, old), `play:${wine}`);
  assert.equal(choose(state), `play:${wine}`);
  state = rules.apply(state, choose(state));
  assert.equal(choose(state, old), 'skill:standard.zhiheng:begin');
  assert.equal(choose(state), `play:${sha}:1`);
  state = rules.apply(state, choose(state));
  while (rules.decision(state)?.kind === 'respond') state = rules.apply(state, 'respond:pass');
  assert.equal(state.players[1].hp, 2);
});

test('25名武将若选择喝酒，下一次出牌决策优先完成仍有效的杀，而非改作其他规划', () => {
  let drinks = 0;
  for (const general of standardGeneralDefinitions) {
    const f = fixture(2, { cards: 'junzheng' });
    f.state.players[0].general = general.id;
    const wine = f.hand(0, 'jiu'); f.hand(0, 'sha'); f.hand(0, 'shan');
    let state = start(f);
    if (choose(state) !== `play:${wine}`) continue;
    drinks++;
    state = rules.apply(state, choose(state));
    const id = choose(state);
    const action = rules.legalActions(state).find(choice => choice.id === id)!.data as { type: string; cid?: number };
    assert.ok(action.type === 'virtualSha' || action.type === 'play' && state.cards[action.cid!].name === 'sha', general.id);
  }
  assert.ok(drinks >= 20);
});

test('没有杀、次数已用完、唯一转杀费用是酒、白银不增加伤害时不会浪费酒', () => {
  for (const kind of ['none', 'used', 'cost', 'armor'] as const) {
    const f = fixture(2, { cards: 'junzheng' });
    const wine = f.hand(0, 'jiu', 'diamond');
    if (kind !== 'none' && kind !== 'cost') f.hand(0, 'sha');
    if (kind === 'used') f.hand(0, 'sha');
    if (kind === 'cost') f.state.players[0].general = 'standard.guanyu';
    if (kind === 'armor') f.equip(1, 'baiyin', 'armor');
    let state = start(f);
    if (kind === 'used') {
      const first = state.players[0].hand.find(id => state.cards[id].name === 'sha')!;
      state = rules.apply(state, `play:${first}:1`);
      while (rules.decision(state)?.kind === 'respond') state = rules.apply(state, 'respond:pass');
      assert.equal(state.shaUsed, 1);
    }
    assert.notEqual(choose(state), `play:${wine}`, kind);
  }
});
