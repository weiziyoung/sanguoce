import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './support/scenario-builder.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { preparePlayScenario, StandardRuleset } from '../src/app/standard-game.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import type { GameState } from '../src/domain/state.ts';
const content = contentForCards('standard', ['fire', 'wind']), runtime = new ContentRuntime(content);
const rules = new StandardRuleset(undefined, undefined, content), policy = new StrategicPolicy();
const choose = (s: GameState) => legalActions(s).find(o => o.id === policy.choose(observe(s, decision(s)!.actor), decision(s)!))!.data!;
const advance = (s: GameState) => { createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(s); return s; };
function general(s: GameState, id: string, seat = 0) { const d = content.general(id); Object.assign(s.players[seat], { general: id, group: d.group, hp: d.hp, maxHp: d.hp }); }

test('拼点AI优先高点数，不读取对手已提交的暗牌', () => {
  const f = fixture(2, { generalPacks: ['fire'] }); general(f.state, 'fire.taishici');
  const low = f.hand(0, 'sha'), high = f.hand(0, 'shan'); f.state.cards[low].rank = 2; f.state.cards[high].rank = 13; f.hand(1, 'sha');
  let s = preparePlayScenario(f.state, 0, runtime); const launch = legalActions(s).find(o => o.data?.type === 'activeSkill' && o.data.ability === 'fire.tianyi')!;
  s = rules.apply(s, launch.id); const action = choose(s); assert.equal(action.type, 'pindian'); if (action.type === 'pindian') assert.equal(action.cid, high);
  s = rules.apply(s, legalActions(s).find(o => o.data?.type === 'pindian' && o.data.cid === high)!.id);
  const before = policy.rank(observe(s, 1), decision(s)!); resolutionStack.require(s, 'pindian').data.sourceCard = low;
  assert.deepEqual(policy.rank(observe(s, 1), decision(s)!), before);
});

test('天义有高点牌与后续杀时愿意发动，只有低点牌时不冒险禁杀', () => {
  for (const rank of [2, 13]) {
    const f = fixture(2, { generalPacks: ['fire'] }); general(f.state, 'fire.taishici');
    const point = f.hand(0, 'shan'); f.state.cards[point].rank = rank; const sha = f.hand(0, 'sha'); f.state.cards[sha].rank = 1; f.hand(1, 'shan');
    const action = choose(preparePlayScenario(f.state, 0, runtime));
    assert.equal(action.type === 'activeSkill' && action.ability === 'fire.tianyi', rank === 13);
  }
});

test('强袭AI一血不选扣血，自身满血且敌人一血时主动收尾', () => {
  const f = fixture(2, { generalPacks: ['fire'] }); general(f.state, 'fire.dianwei'); f.state.players[1].hp = 1;
  f.state.players[0].hp = 1; assert.equal(choose(preparePlayScenario(f.state, 0, runtime)).type, 'endPlay');
  f.state.players[0].hp = 4; const action = choose(preparePlayScenario(f.state, 0, runtime)); assert.equal(action.type, 'activeSkill');
  if (action.type === 'activeSkill') assert.equal(action.ability, 'fire.qiangxi');
});

test('涅槃AI在真实负血濒死提示时自动选择救活', () => {
  const f = fixture(2, { generalPacks: ['fire'] }); general(f.state, 'fire.pangtong', 1); damage(f.state, 1, 0, 4); advance(f.state);
  const action = choose(f.state); assert.equal(action.type, 'choose'); if (action.type === 'choose') assert.equal(action.choice, 'recover');
});

test('节命AI优先给缺牌的友方补牌，不选择敌方', () => {
  const f = fixture(5, { generalPacks: ['fire'], mode: 'identity', roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] }); general(f.state, 'fire.xunyu', 1);
  f.hand(1, 'shan'); damage(f.state, 1, 2); advance(f.state); let s = rules.apply(f.state, policy.choose(observe(f.state, 1), decision(f.state)!));
  const action = choose(s); assert.equal(action.type, 'choose'); if (action.type === 'choose' && 'targets' in action) assert.equal(action.targets[0], 0);
});

test('对卧龙八阵估计闪避机会，对庞统未用涅槃降低致死收益，对荀彧考虑节命补牌', () => {
  const f = fixture(2, { generalPacks: ['fire'] }); const sha = f.hand(0, 'sha');
  const bare = new EvaluationContext(observe(f.state, 0)).shaEffect(1, [sha]); general(f.state, 'fire.wolong', 1);
  assert.ok(new EvaluationContext(observe(f.state, 0)).shaEffect(1, [sha]) < bare);
  general(f.state, 'fire.pangtong', 1); f.state.players[1].hp = 1; let obs = observe(f.state, 0);
  const unused = new EvaluationContext(obs).shaEffect(1, [sha]); obs.others[0].spentLimitedSkills = ['fire.niepan'];
  assert.ok(new EvaluationContext(obs).shaEffect(1, [sha]) > unused);
  general(f.state, 'fire.xunyu', 1); const xun = new EvaluationContext(observe(f.state, 0)).shaEffect(1, [sha]); assert.ok(xun < bare);
});

test('双雄AI有决斗储备才替代摸牌，空手优先正常摸两张', () => {
  for (const rich of [false, true]) {
    const f = fixture(2, { generalPacks: ['fire'] }); general(f.state, 'fire.yanliangwenchou');
    if (rich) for (let i = 0; i < 4; i++) f.hand(0, 'sha');
    resolutionStack.enqueue(f.state, { kind: 'phaseDraw' }); advance(f.state);
    assert.equal(choose(f.state).type, rich ? 'skill' : 'normal');
  }
});

test('乱击与实体万箭的AI计入卧龙八阵，实际穿防具后不再获得额外判定闪估值', () => {
  const f = fixture(2, { generalPacks: ['fire'] });
  const base = new EvaluationContext(observe(f.state, 0)).targetEffect('wanjian', 1);
  general(f.state, 'fire.wolong', 1);
  assert.equal(new EvaluationContext(observe(f.state, 0)).targetEffect('wanjian', 1), base * 0.5);
  f.equip(1, 'renwang', 'armor');
  assert.equal(new EvaluationContext(observe(f.state, 0)).targetEffect('wanjian', 1), base);
});

test('火计没有剩余支付牌时不发动；乱击AI不会只为消耗同花色牌乱放群攻', () => {
  const f = fixture(2, { generalPacks: ['fire'] }); general(f.state, 'fire.wolong'); f.hand(0, 'shan', 'heart'); f.hand(1, 'sha');
  assert.equal(choose(preparePlayScenario(f.state, 0, runtime)).type, 'endPlay');
  const y = fixture(5, { generalPacks: ['fire'], mode: 'identity', roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] }); general(y.state, 'fire.yuanshao', 1);
  y.hand(1, 'shan', 'heart'); y.hand(1, 'tao', 'heart'); y.state.players[0].hp = 1;
  const action = choose(preparePlayScenario(y.state, 1, runtime)); assert.notEqual(action.type, 'virtualTrick');
});
