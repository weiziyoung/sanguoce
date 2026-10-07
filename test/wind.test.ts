import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './support/scenario-builder.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { preparePlayScenario, StandardRuleset } from '../src/app/standard-game.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { vitals } from '../src/rules/operations/vitals-service.ts';
import { JudgementFlow } from '../src/rules/flows/judgement-flow.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { startTurn } from '../src/content/standard/flows/turn-flow.ts';
import type { ActionData, GameState } from '../src/domain/state.ts';
import type { CardSet } from '../src/app/game-content.ts';

function scene(count = 2, cards: CardSet = 'standard', mode?: string, roles?: string[]) {
  const f = fixture(count, { cards, generalPacks: ['wind'], ...(mode ? { mode, roles } : {}) });
  const content = contentForCards(cards, ['wind']);
  const runtime = new ContentRuntime(content);
  const resolution = createStandardResolution(standardModes, runtime.triggers, runtime);
  const rules = new StandardRuleset(undefined, undefined, content);
  const general = (seat: number, id: string) => {
    const d = content.general(id); Object.assign(f.state.players[seat], { general: id, group: d.group, sex: d.sex, hp: d.hp, maxHp: d.hp });
  };
  const choose = (s: GameState, predicate: (data: ActionData) => boolean) => {
    const option = legalActions(s).find(option => option.data && predicate(option.data));
    assert.ok(option, `缺少选项：${decision(s)?.kind} ${JSON.stringify(legalActions(s).map(o => o.data))}`);
    return rules.apply(s, option.id);
  };
  const advance = (s: GameState) => { resolution.scheduler.advance(s); return s; };
  return { f, runtime, resolution, rules, general, choose, advance,
    start: (actor = 0) => preparePlayScenario(f.state, actor, runtime) };
}
function conserved(s: GameState) {
  const zones = [...s.deck, ...s.discard, ...s.table, ...s.players.flatMap(p => [...p.hand, ...p.judge,
    ...Object.values(p.equip).filter((id): id is number => id !== null), ...Object.values(p.piles ?? {}).flat()])];
  assert.equal(zones.length, Object.keys(s.cards).length);
  assert.equal(new Set(zones).size, zones.length);
}

test('风包可独立组合标准或军争：32将、排除于吉、牌堆数量不变', () => {
  for (const cards of ['standard', 'junzheng'] as const) {
    const content = contentForCards(cards, ['wind']);
    assert.equal(content.generals().length, 32); assert.equal(content.deck.length, cards === 'standard' ? 108 : 160);
    assert.equal(content.generals().filter(g => g.id.startsWith('wind.')).length, 7);
    assert.ok(!content.generals().some(g => g.label === '于吉'));
    assert.equal(contentForCards(cards).generals().length, 25);
  }
});

test('烈弓满足手牌条件时禁闪，手中的闪保留', () => {
  const x = scene(); x.general(0, 'wind.huangzhong'); const sha = x.f.hand(0, 'sha'); const shan = x.f.hand(1, 'shan');
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === sha);
  assert.equal(decision(s)?.kind, 'triggerConfirm');
  s = x.choose(s, d => d.type === 'yes');
  assert.equal(s.players[1].hp, 3); assert.ok(s.players[1].hand.includes(shan)); conserved(s);
});

test('烈弓不满足手牌条件时正常响应', () => {
  const x = scene(); x.general(0, 'wind.huangzhong'); const sha = x.f.hand(0, 'sha');
  x.f.hand(1, 'shan'); x.f.hand(1, 'sha');
  const s = x.choose(x.start(), d => d.type === 'play' && d.cid === sha);
  assert.equal(decision(s)?.kind, 'respond');
});

test('狂骨自动发动，近距离多点伤害回复相同体力，无发动确认', () => {
  const x = scene(); x.general(0, 'wind.weiyan'); const s = x.f.state; s.players[0].hp = 1;
  damage(s, 1, 0, 2); x.advance(s);
  assert.equal(s.players[0].hp, 3); assert.equal(s.players[1].hp, 2);
  assert.ok(s.events.some(e => e.kind === 'skillActivated' && e.data.ability === 'wind.kuanggu'));
  assert.equal(decision(s), null); conserved(s);
});

test('狂骨按距离而非武器射程生效，远距离伤害不回血', () => {
  const x = scene(5); x.general(0, 'wind.weiyan'); x.f.equip(0, 'qilin', 'weapon'); const s = x.f.state; s.players[0].hp = 1;
  damage(s, 2, 0); x.advance(s); assert.equal(s.players[0].hp, 1);
});

test('神速一跳过判定与摸牌，保留延时牌，杀不受距离限制和出牌次数限制', () => {
  const x = scene(5); x.general(0, 'wind.xiahouyuan'); const delay = x.f.take('lebu'); x.f.state.players[0].judge.push(delay);
  let s = x.f.state; s.active = 0; startTurn(s); x.advance(s);
  s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets?.[0] === 2);
  assert.equal(decision(s)?.kind, 'respond'); s = x.choose(s, d => d.type === 'pass');
  assert.equal(s.players[2].hp, 3); assert.ok(s.players[0].judge.includes(delay));
  assert.equal(decision(s)?.kind, 'contentChoice'); // second Shensu offer
  s = x.choose(s, d => d.type === 'pass');
  assert.equal(decision(s)?.kind, 'play'); assert.equal(s.players[0].hand.length, 0); assert.equal(s.shaUsed, 0); conserved(s);
});

test('神速二可以弃置装备区原牌，跳过出牌但继续弃牌和结束阶段', () => {
  const x = scene(); x.general(0, 'wind.xiahouyuan'); const armor = x.f.equip(0, 'bagua', 'armor');
  let s = x.f.state; s.active = 0; s.phase = 'draw';
  resolutionStack.enqueue(s, { kind: 'phaseBefore', phase: 'play' }, { kind: 'phasePlay' }, { kind: 'phaseDiscard' }); x.advance(s);
  s = x.choose(s, d => d.type === 'choose' && 'ids' in d && 'targets' in d && d.ids?.[0] === armor);
  s = x.choose(s, d => d.type === 'pass');
  assert.equal(s.players[0].equip.armor, null); assert.ok(s.discard.includes(armor)); assert.equal(s.skipPlay, true);
  assert.equal(decision(s), null); conserved(s);
});

test('据守摸三张并翻面，下一轮跳过整回合并翻回正面', () => {
  const x = scene(); x.general(0, 'wind.caoren'); let s = x.f.state; s.active = 0;
  resolutionStack.enqueue(s, { kind: 'phaseEndOffer', ability: 'wind.jushou', owner: 0 }); x.advance(s);
  s = x.choose(s, d => d.type === 'yes'); assert.equal(s.players[0].hand.length, 3); assert.equal(s.players[0].faceDown, true);
  startTurn(s); x.advance(s);
  assert.equal(s.players[0].faceDown, false); assert.equal(s.active, 1);
  assert.ok(s.events.some(e => e.kind === 'turnSkipped' && e.data.player === 0)); conserved(s);
});

for (const cards of ['standard', 'junzheng'] as const) test(`天香保留原来源、属性与伤害值（${cards}），红颜黑桃手牌可支付`, () => {
  const x = scene(5, cards); x.general(1, 'wind.xiaoqiao'); const heart = x.f.hand(1, 'sha', 'spade');
  let s = x.f.state; damage(s, 1, 0, 2, null, null, { nature: 'thunder' }); x.advance(s);
  assert.equal(decision(s)?.kind, 'contentChoice'); assert.equal(s.players[1].hp, 3);
  s = x.choose(s, d => d.type === 'choose' && 'ids' in d && 'targets' in d && d.ids?.[0] === heart && d.targets?.[0] === 2);
  assert.equal(s.players[1].hp, 3); assert.equal(s.players[2].hp, 2); assert.equal(s.players[2].hand.length, 2);
  const hits = s.events.filter(e => e.kind === 'damaged'); assert.equal(hits.length, 1);
  assert.ok(hits[0].kind === 'damaged' && hits[0].data.source === 0 && hits[0].data.redirectedBy === 1 && hits[0].data.nature === 'thunder'); conserved(s);
});

test('天香转移不重复叠加原来源的裸衣增伤', () => {
  const x = scene(5); x.general(0, 'standard.xuzhu'); x.general(1, 'wind.xiaoqiao'); x.f.hand(1, 'shan', 'heart');
  let s = x.f.state; s.turnMarks = [{ owner: 0, ability: 'standard.luoyi', turn: s.turn }];
  damage(s, 1, 0, 1, null, { name: 'sha', suit: null, virtual: true }); x.advance(s);
  s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets?.[0] === 2);
  assert.equal(s.players[2].hp, 2); conserved(s);
});

test('天香击杀反贼的奖惩归原来源，阵亡目标不摸天香补牌', () => {
  const x = scene(5, 'standard', 'identity', ['lord', 'rebel', 'rebel', 'loyalist', 'renegade']);
  x.general(3, 'wind.xiaoqiao'); x.f.hand(3, 'shan', 'heart'); let s = x.f.state; s.players[2].hp = 1;
  damage(s, 3, 1); x.advance(s); s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets?.[0] === 2);
  assert.equal(s.players[2].alive, false); assert.equal(s.players[1].hand.length, 3); assert.equal(s.players[3].hand.length, 0);
  assert.ok(s.events.some(e => e.kind === 'died' && e.data.target === 2 && e.data.source === 1)); conserved(s);
});

test('天香可放弃，黑桃以外的黑牌不能支付', () => {
  const x = scene(); x.general(1, 'wind.xiaoqiao'); const club = x.f.hand(1, 'sha', 'club'); let s = x.f.state;
  damage(s, 1, 0); x.advance(s); assert.equal(decision(s), null); assert.equal(s.players[1].hp, 2); assert.ok(s.players[1].hand.includes(club));
});

test('鬼道可用黑色装备改判并获得旧判定牌，保持所有实体牌区域守恒', () => {
  const x = scene(); x.general(0, 'wind.zhangjiao'); const equip = x.f.equip(0, 'bagua', 'armor');
  const original = x.f.top('shan', 'heart'); let s = x.f.state;
  new JudgementFlow(x.runtime).begin(s, 1, 'bagua', { kind: 'contentCallback', ability: 'wind.leiji', owner: 0, context: { timing: 'noop', target: 1 } }); x.advance(s);
  assert.equal(decision(s)?.kind, 'judgeReplace'); s = x.choose(s, d => d.type === 'replace' && d.cid === equip);
  assert.ok(s.players[0].hand.includes(original)); assert.equal(s.players[0].equip.armor, null); assert.ok(s.discard.includes(equip)); conserved(s);
});

test('张角打出闪触发雷击，以目标自己的花色判定；小乔红颜阻止雷击', () => {
  for (const xiaoqiao of [false, true]) {
    const x = scene(5); x.general(1, 'wind.zhangjiao'); if (xiaoqiao) x.general(2, 'wind.xiaoqiao');
    const sha = x.f.hand(0, 'sha'); const shan = x.f.hand(1, 'shan'); x.f.top('sha', 'spade');
    let s = x.choose(x.start(), d => d.type === 'play' && d.cid === sha && d.targets[0] === 1);
    s = x.choose(s, d => d.type === 'respond' && d.ids[0] === shan);
    s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets?.[0] === 2);
    if (decision(s)?.kind === 'judgeReplace') s = x.choose(s, d => d.type === 'pass');
    assert.equal(s.players[1].hp, 3); assert.equal(s.players[2].hp, xiaoqiao ? 3 : 2); conserved(s);
  }
});

test('八卦阵视为打出的闪也触发雷击', () => {
  const x = scene(); x.general(1, 'wind.zhangjiao'); x.f.equip(1, 'bagua', 'armor'); const sha = x.f.hand(0, 'sha');
  x.f.top('sha', 'spade'); x.f.top('shan', 'heart'); let s = x.choose(x.start(), d => d.type === 'play' && d.cid === sha);
  s = x.choose(s, d => d.type === 'bagua'); s = x.choose(s, d => d.type === 'pass');
  assert.equal(decision(s)?.kind, 'contentChoice');
  s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets?.[0] === 0);
  if (decision(s)?.kind === 'judgeReplace') s = x.choose(s, d => d.type === 'pass');
  assert.equal(s.players[0].hp, 2); conserved(s);
});

test('黄天向其他群将授予献牌行动，每回合一次，非主公与1v1不授予', () => {
  const x = scene(5, 'standard', 'identity', ['lord', 'loyalist', 'rebel', 'rebel', 'renegade']);
  x.general(0, 'wind.zhangjiao'); x.general(1, 'standard.huatuo'); const shan = x.f.hand(1, 'shan'); x.f.hand(1, 'shan');
  let s = x.choose(x.start(1), d => d.type === 'activeSkill' && d.ability === 'wind.huangtian.gift' && d.ids[0] === shan);
  assert.ok(s.players[0].hand.includes(shan)); assert.ok(!legalActions(s).some(o => o.data?.type === 'activeSkill' && o.data.ability === 'wind.huangtian.gift'));
  const duel = scene(); duel.general(0, 'wind.zhangjiao'); duel.general(1, 'standard.huatuo'); assert.equal(duel.runtime.abilities.has(duel.f.state, 1, 'wind.huangtian.gift'), false); conserved(s);
});

test('原版不屈保留负体力，公开不屈牌；回血后逐张移去多余牌', () => {
  const x = scene(5); x.general(1, 'wind.zhoutai'); x.f.state.players[1].hp = 1;
  x.f.top('sha', 'spade', 7); x.f.top('shan', 'heart', 2); let s = x.f.state;
  damage(s, 1, 0, 2); x.advance(s); s = x.choose(s, d => d.type === 'choose' && d.choice === 'add');
  assert.equal(s.players[1].hp, -1); assert.equal(s.players[1].alive, true); assert.equal(s.players[1].piles?.['wind.buqu'].length, 2);
  assert.equal(observe(s, 0).others.find(p => p.id === 1)?.piles?.['wind.buqu'].length, 2);
  const before = s.events.length; vitals.recover(s, 1, 2); x.resolution.scheduler.afterStep(s, before); x.advance(s);
  for (let i = 0; i < 2; i++) s = x.choose(s, d => d.type === 'choose' && d.choice?.startsWith('remove:') === true);
  assert.equal(s.players[1].hp, 1); assert.equal(s.players[1].piles?.['wind.buqu'].length, 0); conserved(s);
});

test('不屈重复点数进入濒死，桃救治后可移去重复牌恢复存活', () => {
  const x = scene(5); x.general(1, 'wind.zhoutai'); x.f.state.players[1].hp = 1;
  x.f.top('sha', 'spade', 7); x.f.top('sha', 'club', 7); const tao = x.f.hand(2, 'tao'); let s = x.f.state;
  damage(s, 1, 0, 2); x.advance(s); s = x.choose(s, d => d.type === 'choose' && d.choice === 'add');
  assert.equal(decision(s)?.kind, 'dying'); s = x.choose(s, d => d.type === 'save' && d.ids[0] === tao);
  s = x.choose(s, d => d.type === 'choose'); assert.equal(s.players[1].hp, 0); assert.equal(s.players[1].alive, true); conserved(s);
});

test('不屈重复且无人救援会阵亡，清理不屈牌；序列化恢复保留原选择', () => {
  const x = scene(); x.general(1, 'wind.zhoutai'); x.f.state.players[1].hp = 1;
  x.f.top('sha', 'spade', 7); x.f.top('sha', 'club', 7); let s = x.f.state;
  damage(s, 1, 0, 2); x.advance(s); s = JSON.parse(JSON.stringify(s));
  s = x.choose(s, d => d.type === 'choose' && d.choice === 'add'); assert.equal(s.players[1].alive, false);
  assert.equal(s.players[1].piles?.['wind.buqu'].length, 0); conserved(s);
});

test('红颜使黑桃杀成为红色，可穿过仁王盾；黑桃闪电判定不命中', () => {
  const x = scene(5); x.general(0, 'wind.xiaoqiao'); const sha = x.f.hand(0, 'sha', 'spade'); x.f.equip(1, 'renwang', 'armor');
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === sha && d.targets[0] === 1);
  assert.equal(decision(s)?.kind, 'respond'); s = x.choose(s, d => d.type === 'pass'); assert.equal(s.players[1].hp, 3);
  const y = scene(); y.general(0, 'wind.xiaoqiao'); const lightning = y.f.take('shandian'); y.f.state.players[0].judge.push(lightning);
  y.f.top('sha', 'spade', 7); let judged = y.f.state; judged.active = 0;
  resolutionStack.enqueue(judged, { kind: 'resolveJudge', owner: 0, cid: lightning }); y.advance(judged);
  assert.equal(judged.players[0].hp, 3); assert.ok(judged.players[1].judge.includes(lightning)); conserved(judged);
});

test('红颜火攻：小乔展示黑桃视为红桃，来源只能弃红桃', () => {
  const x = scene(5, 'junzheng'); x.general(1, 'wind.xiaoqiao'); const fire = x.f.hand(0, 'huogong');
  const heart = x.f.hand(0, 'shan', 'heart'); const spade = x.f.hand(0, 'sha', 'spade'); const revealed = x.f.hand(1, 'sha', 'spade');
  let s = x.choose(x.start(), d => d.type === 'play' && d.cid === fire && d.targets[0] === 1);
  s = x.choose(s, d => d.type === 'reveal' && d.cid === revealed);
  assert.equal(decision(s)?.kind, 'fireAttackPay'); assert.ok(legalActions(s).some(o => o.data?.type === 'discard' && o.data.cid === heart));
  assert.ok(!legalActions(s).some(o => o.data?.type === 'discard' && o.data.cid === spade)); conserved(s);
});

test('天香嵌套雷电连环只转移本次伤害，原小乔不掉血但仍可收到后续连环传导', () => {
  const x = scene(5, 'junzheng'); x.general(1, 'wind.xiaoqiao'); x.f.hand(1, 'shan', 'heart');
  x.f.state.players[1].chained = true; x.f.state.players[2].chained = true; x.f.state.players[3].chained = true;
  let s = x.f.state; damage(s, 1, 0, 1, null, null, { nature: 'thunder' }); x.advance(s);
  s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets[0] === 2);
  assert.equal(s.players[1].hp, 2); assert.equal(s.players[2].hp, 3); assert.equal(s.players[3].hp, 3);
  assert.ok([1, 2, 3].every(id => s.players[id].chained === false));
  assert.equal(s.events.filter(e => e.kind === 'damaged').length, 3); conserved(s);
});

test('天香不会将青釭剑的无视防具扩展给新的伤害接收者，白银按接收者减伤', () => {
  const x = scene(5, 'junzheng'); x.general(1, 'wind.xiaoqiao'); x.f.hand(1, 'shan', 'heart'); x.f.equip(2, 'baiyin', 'armor');
  let s = x.f.state; damage(s, 1, 0, 3, null, null, { ignoreArmor: true }); x.advance(s);
  s = x.choose(s, d => d.type === 'choose' && 'targets' in d && d.targets[0] === 2);
  assert.equal(s.players[2].hp, 3); assert.equal(s.players[2].hand.length, 1); conserved(s);
});
