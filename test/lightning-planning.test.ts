import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPANDED_DECK, STANDARD_DECK } from '../catalog.ts';
import { decision, observe, preparePlayScenario, StandardRuleset } from '../engine.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { lightningPlan } from '../src/policies/lightning-plan.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { fixture, type ScenarioBuilder } from './support/scenario-builder.ts';

function setup(cards: 'standard' | 'junzheng' = 'standard', enemyCards = 7) {
  const f = fixture(2, { cards });
  const flash = f.hand(0, 'shandian');
  f.state.players[0].hp = 2;
  for (let i = 0; i < enemyCards; i++) f.hand(1, 'sha');
  return { f, flash, cards };
}
function evaluate(f: ScenarioBuilder, cards: 'standard' | 'junzheng' = 'standard') {
  const content = contentForCards(cards), deck = cards === 'junzheng' ? EXPANDED_DECK : STANDARD_DECK;
  const state = preparePlayScenario(f.state, 0, new ContentRuntime(content));
  const observation = observe(state, 0), prompt = decision(state)!;
  const ctx = new EvaluationContext(observation, deck);
  const flash = observation.self.hand.find(card => card.name === 'shandian')!;
  const policy = new StrategicPolicy(undefined, deck);
  return { state, observation, ctx, plan: lightningPlan(ctx, [flash.id]),
    selected: policy.choose(observation, prompt) };
}

for (const cards of ['standard', 'junzheng'] as const) {
  test(`${cards} 策略在公开资源明显落后时投放闪电，之前固定跳过，实际合法动作正常落入判定区`, () => {
    const { f, flash } = setup(cards);
    const result = evaluate(f, cards);
    assert.equal(result.selected, `play:${flash}`);
    assert.ok(result.plan.deficit > 0.4 && result.plan.comebackBonus > 0 && result.plan.score > 0);
    const rules = new StandardRuleset(undefined, undefined, contentForCards(cards));
    const next = rules.apply(result.state, result.selected);
    assert.ok(next.players[0].judge.includes(flash));
    assert.equal(next.players[0].hand.includes(flash), false);
  });
}

test('判定概率和承伤完全相同时，敌方手牌优势提高翻盘偏好，优势局仍选择稳住', () => {
  const even = setup('standard', 0), behind = setup('standard', 8);
  const a = evaluate(even.f), b = evaluate(behind.f);
  assert.equal(a.plan.selfHitChance, b.plan.selfHitChance);
  assert.equal(a.plan.expectedUtility, b.plan.expectedUtility);
  assert.ok(b.plan.comebackBonus > a.plan.comebackBonus);
  assert.equal(a.selected, 'end-play');
  assert.equal(b.selected, `play:${behind.flash}`);
  const ahead = setup('standard', 0);
  ahead.f.state.players[0].hp = 4; ahead.f.state.players[1].hp = 1;
  assert.equal(evaluate(ahead.f).selected, 'end-play');
});

test('一血劣势仍可以搏翻盘，但不能把所有一血场面都当作需要放闪电', () => {
  const desperate = setup('standard', 8);
  desperate.f.state.players[0].hp = 1;
  assert.equal(evaluate(desperate.f).selected, `play:${desperate.flash}`);
  const balanced = setup('standard', 0);
  balanced.f.state.players[0].hp = 1; balanced.f.state.players[1].hp = 1;
  assert.equal(evaluate(balanced.f).selected, 'end-play');
});

test('自敌连环会抵消翻盘收益，白银狮子保护自己时更愿意使用闪电', () => {
  const unsafe = setup('junzheng', 8), plain = evaluate(unsafe.f, 'junzheng');
  unsafe.f.state.players[0].chained = true; unsafe.f.state.players[1].chained = true;
  const chained = evaluate(unsafe.f, 'junzheng');
  assert.ok(chained.plan.score < plain.plan.score);
  assert.equal(chained.selected, 'end-play');
  const armored = setup('junzheng', 8);
  armored.f.equip(0, 'baiyin', 'armor');
  assert.ok(evaluate(armored.f, 'junzheng').plan.score > plain.plan.score);
});

test('孙权保留值得使用的翻盘闪电，不先制衡掉它；诸葛亮也可主动投放', () => {
  for (const general of ['standard.sunquan', 'standard.zhugeliang']) {
    const { f, flash } = setup('standard', 8);
    f.state.players[0].general = general;
    const result = evaluate(f);
    assert.equal(result.selected, `play:${flash}`);
    assert.ok(result.ctx.value(flash) >= 5);
  }
});

test('鬼才只利用自己实际未消耗的改判牌，不把已放入判定区的闪电当作保护费用', () => {
  const { f } = setup();
  f.state.players[0].general = 'standard.simayi';
  const noFee = evaluate(f);
  assert.equal(noFee.plan.selfHitChance, noFee.ctx.lightningRate);
  f.hand(0, 'shan');
  const protectedSelf = evaluate(f);
  assert.equal(protectedSelf.plan.selfHitChance, 0);
  assert.ok(protectedSelf.plan.score > noFee.plan.score);
});

test('敌方有多张手牌的司马懿压低翻盘收益，不因落后就强行承担可操控的雷击', () => {
  const { f } = setup('standard', 8);
  f.state.players[1].general = 'standard.simayi';
  const result = evaluate(f);
  assert.ok(result.plan.selfHitChance > 0.7);
  assert.equal(result.selected, 'end-play');
});

test('对手同样张数的真实手牌内容不同，闪电评估完全相同，不读取隐藏改判牌', () => {
  const a = setup('standard', 6), b = setup('standard', 0);
  for (let i = 0; i < 6; i++) b.f.hand(1, 'shan');
  a.f.state.players[1].general = b.f.state.players[1].general = 'standard.simayi';
  assert.deepEqual(evaluate(a.f).plan, evaluate(b.f).plan);
});

test('己方判定区已有闪电时不保留第二张作为主动翻盘牌', () => {
  const { f, flash } = setup('standard', 8);
  f.state.players[0].judge.push(f.take('shandian'));
  const result = evaluate(f);
  assert.equal(result.selected, 'end-play');
  assert.equal(result.ctx.value(flash), 0);
});

test('先经过敌方的座次比先经过濒死队友更有利，不只按判定命中率评分', () => {
  const f = fixture(5, { mode: 'identity', roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] });
  f.hand(0, 'shandian');
  f.state.players[1].hp = 1;
  f.state.players[4].alive = false;
  for (const player of f.state.players) f.state.mode.knownTo[player.id] = [0, 1, 2, 3, 4];
  const allyFirst = evaluate(f).plan;
  [f.state.players[1].hp, f.state.players[2].hp] = [f.state.players[2].hp, f.state.players[1].hp];
  [f.state.mode.roles[1], f.state.mode.roles[2]] = [f.state.mode.roles[2], f.state.mode.roles[1]];
  const enemyFirst = evaluate(f).plan;
  assert.equal(enemyFirst.deficit, allyFirst.deficit);
  assert.ok(enemyFirst.expectedUtility > allyFirst.expectedUtility);
  assert.ok(enemyFirst.score > allyFirst.score);
});

test('身份信息未公开时，不因后台真实身份变化而改变闪电计划', () => {
  const f = fixture(5, { mode: 'identity', roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] });
  f.hand(0, 'shandian');
  const first = evaluate(f);
  assert.equal(first.observation.others.find(player => player.id === 1)?.role, undefined);
  [f.state.mode.roles[1], f.state.mode.roles[2]] = [f.state.mode.roles[2], f.state.mode.roles[1]];
  assert.deepEqual(evaluate(f).plan, first.plan);
});
