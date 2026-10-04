import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Choice, Decision } from '../contracts.ts';
import { StandardRuleset, preparePlayScenario, type GameState } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { archivedPolicy } from './support/archived-policy.ts';
import { RULE_POLICY_VERSION } from '../src/policies/rule-policy-version.ts';
import type { ScoredAction } from '../src/policies/evaluation-registry.ts';
import { fixture } from './support/scenario-builder.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { standardContent } from '../src/content/standard/content.ts';

const rules = new StandardRuleset();
const policy = new StrategicPolicy();
const V0Policy = await archivedPolicy('v0');
function selected(state: GameState) {
  const decision = rules.decision(state)!;
  const id = policy.choose(rules.observe(state, decision.actor), decision);
  const action = rules.legalActions(state).find(choice => choice.id === id)!.data as ScoredAction;
  return { id, action };
}
const advance = (state: GameState) => rules.apply(state, selected(state).id);
function settle(state: GameState): GameState {
  for (let i = 0; i < 30 && state.outcome.status === 'ongoing' && rules.decision(state)?.kind !== 'play'; i++)
    state = advance(state);
  return state;
}
const prompt = (kind: string, options: Choice[], context: unknown = {}): Decision =>
  ({ actor: 0, title: kind, kind, options, context });

test('历史快照完整且现行版本源码匹配：修改 policy 必须升版', () => {
  const versions = new URL('../src/policies/versions/', import.meta.url);
  const archived = readdirSync(versions).filter(name => /^v\d+$/.test(name));
  assert.ok(archived.includes(RULE_POLICY_VERSION), '交付前必须冻结现行规则 policy 版本');
  for (const version of archived) {
    const root = new URL(`${version}/`, versions);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
    for (const file of manifest.files) {
      assert.equal(createHash('sha256').update(readFileSync(new URL(file.file, root)))
        .digest('hex'), file.sha256, `${version}/${file.file}`);
      if (version === RULE_POLICY_VERSION) assert.equal(createHash('sha256')
        .update(readFileSync(new URL('../' + file.source, import.meta.url))).digest('hex'),
      file.sourceSha256, `${file.source} 已改变，请升级规则 policy 版本并冻结新版本`);
    }
  }
  assert.equal(policy.version, RULE_POLICY_VERSION);
  const f = fixture();
  f.state.players[0].general = 'standard.huanggai';
  const state = f.start();
  const decision = rules.decision(state)!;
  if (V0Policy) {
    assert.equal(new V0Policy().version, 'v0');
    assert.notEqual(policy.version, new V0Policy().version);
    const oldChoice = new V0Policy().choose(rules.observe(state, 0), decision);
    assert.equal((rules.legalActions(state).find(choice => choice.id === oldChoice)!.data as ScoredAction).ability,
      'standard.kurou');
  }
  assert.equal(selected(state).action.type, 'endPlay');
});

test('孙权先填空装备槽，再以杀和闪电制衡，保留在场装备与第一张闪', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.sunquan';
  const weapon = f.hand(0, 'qinggang');
  const sha = f.hand(0, 'sha');
  const shan = f.hand(0, 'shan');
  const lightning = f.hand(0, 'shandian');
  let state = f.start();
  assert.equal(selected(state).action.cid, weapon);
  state = advance(state);
  assert.equal(selected(state).action.type, 'beginSkill');
  state = advance(state);
  assert.equal(selected(state).action.cid, lightning);
  state = advance(state);
  assert.equal(selected(state).action.cid, sha);
  state = advance(state);
  assert.equal(selected(state).action.type, 'confirm');
  state = advance(state);
  assert.ok(state.discard.includes(sha) && state.discard.includes(lightning));
  assert.ok(state.players[0].hand.includes(shan));
  assert.equal(state.players[0].equip.weapon, weapon);
});

test('孙权装备成型后换掉重复装备和多余基本牌，保留输出锦囊', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.sunquan';
  f.equip(0, 'qilin', 'weapon');
  f.equip(0, 'bagua', 'armor');
  f.equip(0, 'dilu', 'plusHorse');
  f.equip(0, 'chitu', 'minusHorse');
  const duplicate = f.hand(0, 'qinggang');
  const sha = f.hand(0, 'sha');
  const trick = f.hand(0, 'juedou');
  const obs = rules.observe(f.start(), 0);
  const options = [duplicate, sha, trick].map(cid => ({ id: String(cid), label: '', data: { type: 'toggle', cid } }));
  const decision = prompt('skillCost', [...options, { id: 'confirm', label: '', data: { type: 'confirm' } }],
    { ability: 'standard.zhiheng', selectedIds: [duplicate, sha] });
  assert.equal(policy.choose(obs, decision), 'confirm');
  const begin = prompt('play', [
    { id: 'begin', label: '', data: { type: 'beginSkill', ability: 'standard.zhiheng' } },
    { id: 'end', label: '', data: { type: 'endPlay' } },
  ]);
  assert.equal(policy.choose(obs, begin), 'begin');
});

test('孙权一血保留两张闪和桃，持连弩保留杀，不乱拆成型装备', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.sunquan';
  f.state.players[0].hp = 1;
  f.equip(0, 'zhuge', 'weapon');
  f.hand(0, 'sha'); f.hand(0, 'shan'); f.hand(0, 'shan'); f.hand(0, 'tao');
  const obs = rules.observe(f.start(), 0);
  const decision = prompt('play', [
    { id: 'begin', label: '', data: { type: 'beginSkill', ability: 'standard.zhiheng' } },
    { id: 'end', label: '', data: { type: 'endPlay' } },
  ]);
  assert.equal(policy.choose(obs, decision), 'end');
});

test('吕蒙无连弩时不出杀并发动克己保留超限手牌', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.lvmeng';
  f.state.players[0].hp = 2;
  for (let i = 0; i < 4; i++) f.hand(0, 'sha');
  f.hand(0, 'shan');
  let state = f.start();
  assert.equal(selected(state).action.type, 'endPlay');
  state = advance(state);
  assert.equal(rules.decision(state)?.kind, 'phaseDiscardChoice');
  assert.equal(selected(state).action.type, 'skip');
  state = advance(state);
  assert.equal(state.players[0].hand.length, 5);
});

test('吕蒙顺手取敌方连弩优先于八卦阵，装备后连续出杀完成爆发', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.lvmeng';
  f.state.players[1].hp = 3;
  const crossbow = f.equip(1, 'zhuge', 'weapon');
  f.equip(1, 'bagua', 'armor');
  const steal = f.hand(0, 'shunshou');
  for (let i = 0; i < 3; i++) f.hand(0, 'sha');
  let state = f.start();
  assert.equal(selected(state).action.cid, steal);
  state = advance(state);
  assert.equal(rules.decision(state)?.kind, 'zone');
  assert.equal(selected(state).action.cid, crossbow);
  state = advance(state);
  assert.equal(selected(state).action.cid, crossbow);
  state = advance(state);
  assert.equal(state.players[0].equip.weapon, crossbow);
  // Remove random armor outcomes from the burst assertion by using a second clean fixture.
  const g = fixture();
  g.state.players[0].general = 'standard.lvmeng';
  g.state.players[1].hp = 3;
  g.equip(0, 'zhuge', 'weapon');
  for (let i = 0; i < 3; i++) g.hand(0, 'sha');
  state = g.start();
  for (let i = 0; i < 3; i++) {
    assert.equal(state.cards[selected(state).action.cid!].name, 'sha');
    state = settle(advance(state));
  }
  assert.equal(state.outcome.status, 'finished');
  assert.equal(state.players[1].alive, false);
});

test('吕蒙不漏掉确定可出的收尾杀，也不会因其他武将而改变通用攻击', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.lvmeng';
  f.state.players[1].hp = 1;
  const sha = f.hand(0, 'sha');
  assert.equal(selected(f.start()).action.cid, sha);
  f.state.players[0].general = 'standard.guanyu';
  f.state.players[1].hp = 4;
  assert.equal(selected(f.start()).action.cid, sha);
});

test('黄盖没连弩不苦肉，连弩到位可在两血苦肉到一血并用新摸杀获胜', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.huanggai';
  assert.equal(selected(f.start()).action.type, 'endPlay');
  f.state.players[0].hp = 2;
  f.state.players[1].hp = 1;
  f.equip(0, 'zhuge', 'weapon');
  f.top('sha'); f.top('sha');
  let state = f.start();
  assert.equal(selected(state).action.ability, 'standard.kurou');
  state = advance(state);
  assert.equal(state.players[0].hp, 1);
  assert.equal(state.players[0].hand.length, 2);
  assert.equal(state.cards[selected(state).action.cid!].name, 'sha');
  state = settle(advance(state));
  assert.equal(state.outcome.status, 'finished');
  assert.equal(state.players[0].alive, true);
});

test('黄盖一血不再苦肉，敌人处于射程外时不透支体力', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.huanggai';
  f.equip(0, 'zhuge', 'weapon');
  f.state.players[0].hp = 1;
  assert.equal(selected(f.start()).action.type, 'endPlay');
  f.state.players[0].hp = 3;
  f.equip(1, 'dilu', 'plusHorse');
  assert.equal(selected(f.start()).action.type, 'endPlay');
});

test('诸葛亮观星避开闪、无懈、满血桃和多余杀，保留可用装备和一张杀', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhugeliang';
  const ids = ['shan', 'wuxie', 'tao', 'sha', 'sha', 'bagua'].map(name => f.take(name));
  f.state.table = [...ids];
  const obs = rules.observe(f.start(), 0);
  const choose = (cid: number) => policy.choose(obs, prompt('deckReorder', [
    { id: 'top', label: '', data: { type: 'place', card: cid, side: 'top' } },
    { id: 'bottom', label: '', data: { type: 'place', card: cid, side: 'bottom' } },
  ], { ability: 'standard.guanxing', owner: 0 }));
  for (const cid of ids.slice(0, 3)) assert.equal(choose(cid), 'bottom');
  assert.equal(choose(Math.min(ids[3], ids[4])), 'top');
  assert.equal(choose(Math.max(ids[3], ids[4])), 'bottom');
  assert.equal(choose(ids[5]), 'top');
  obs.self.hp = 2;
  assert.equal(choose(ids[2]), 'top');
});

test('诸葛亮打出最后一张同值装备进入空城；最后一张闪优先于八卦判定', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhugeliang';
  f.equip(0, 'bagua', 'armor');
  const shield = f.hand(0, 'renwang');
  let state = f.start();
  assert.equal(selected(state).action.cid, shield);
  state = advance(state);
  assert.equal(state.players[0].hand.length, 0);
  const g = fixture();
  g.state.players[0].general = 'standard.zhugeliang';
  g.equip(0, 'bagua', 'armor');
  const shan = g.hand(0, 'shan');
  const obs = rules.observe(g.start(), 0);
  assert.equal(policy.choose(obs, prompt('respond', [
    { id: 'bagua', label: '', data: { type: 'bagua' } },
    { id: 'shan', label: '', data: { type: 'respond', ids: [shan] } },
    { id: 'pass', label: '', data: { type: 'pass' } },
  ])), 'shan');
});

test('诸葛亮观星、摸牌、出牌串联后清空手牌，并由规则禁止杀与决斗目标', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhugeliang';
  f.top('sha'); f.top('bagua');
  const enemySha = f.hand(1, 'sha');
  const enemyDuel = f.hand(1, 'juedou');
  f.state.active = 0;
  f.state.resolution = resolutionStack.initial();
  resolutionStack.enqueue(f.state, { kind: 'phaseStart' }, { kind: 'phaseDraw' }, { kind: 'phasePlay' });
  const runtime = new ContentRuntime(standardContent);
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  let state = f.state;
  for (let i = 0; i < 30; i++) {
    if (state.phase === 'play' && rules.decision(state)?.kind === 'play' &&
      selected(state).action.type === 'endPlay') break;
    state = advance(state);
  }
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.cards[state.players[0].equip.armor!].name, 'bagua');
  // Restart only the enemy's play window to test the actual engine target filter.
  const enemyPlay = rules.legalActions(preparePlayScenario(state, 1));
  assert.ok(!enemyPlay.some(option => {
    const action = option.data as ScoredAction;
    return action.cid === enemySha || action.cid === enemyDuel;
  }));
});

test('诸葛亮五谷不拿本回合已无法再出的杀，也不为不可达目标拿顺手', () => {
  const f = fixture();
  f.state.players[0].general = 'standard.zhugeliang';
  f.equip(1, 'dilu', 'plusHorse');
  const sha = f.take('sha');
  const steal = f.take('shunshou');
  const equip = f.take('bagua');
  f.state.table = [sha, steal, equip];
  const obs = rules.observe(f.start(), 0);
  obs.shaUsed = 1;
  const decision = prompt('wugu', [sha, steal, equip].map(cid => ({ id: String(cid), label: '',
    data: { type: 'wugu', cid } })));
  assert.equal(policy.choose(obs, decision), String(equip));
});
