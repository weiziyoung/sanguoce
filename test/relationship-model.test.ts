import test from 'node:test';
import assert from 'node:assert/strict';
import type { Decision, Observation, VisiblePlayer } from '../contracts.ts';
import { GameEngine } from '../engine.ts';
import { RelationshipModel } from '../src/policies/relationship-model.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';

const equipment = () => ({ weapon: null, armor: null, plusHorse: null, minusHorse: null });
const person = (id: number, role?: string): VisiblePlayer => ({
  id, label: `角色${id}`, sex: 'male', hp: 3, maxHp: 4, alive: true, handCount: 2,
  ...(role ? { role } : {}), equip: equipment(), judge: [],
});
function observation(role: string): Observation {
  return { events: [], mode: { id: 'identity' }, turn: 1, phase: 'play', active: 0, actor: 0,
    self: { ...person(0, role), hand: [{ id: 10, name: 'sha', suit: 'spade', rank: 7 }] },
    others: [person(1, 'lord'), person(2), person(3), person(4)],
    deckCount: 50, discardCount: 0, discardTop: null, table: [], shaUsed: 0,
    nullify: null, log: [], outcome: { status: 'ongoing' } };
}

test('公开攻击与救援改变隐藏角色的目标排序，主忠与反贼方向相反', () => {
  const obs = observation('loyalist');
  obs.events = [
    { id: 1, kind: 'cardUsed', data: { source: 2, card: 20, targets: [1], effectiveName: 'sha' } },
    { id: 2, kind: 'damaged', data: { source: 2, target: 1, amount: 1, hp: 2, maxHp: 4, card: 20 } },
    { id: 3, kind: 'cardUsed', data: { source: 3, card: 21, targets: [1], effectiveName: 'tao' } },
  ];
  const choices: Decision = { actor: 0, kind: 'play', title: '出牌', options: [
    { id: 'attack-helper', label: '攻击救援者', data: { type: 'play', cid: 10, targets: [3] } },
    { id: 'attack-attacker', label: '攻击袭击者', data: { type: 'play', cid: 10, targets: [2] } },
  ] };
  const policy = new StrategicPolicy();
  assert.equal(policy.choose(obs, choices), 'attack-attacker');
  obs.self.role = 'rebel';
  assert.equal(policy.choose(obs, choices), 'attack-helper');
});

test('身份未公开时，伤害自己会降低关系；死亡角色不成为目标', () => {
  const obs = observation('renegade');
  obs.events = [{ id: 1, kind: 'damaged', data: { source: 2, target: 0, amount: 1, hp: 2, maxHp: 4, card: null } }];
  const model = new RelationshipModel(obs);
  assert.ok(model.relation(2) < model.relation(3));
  obs.others[3].alive = false;
  assert.equal(model.relation(4), 0);
});

test('内奸根据主公存活压力调整关系，两人残局转为与主公对抗', () => {
  const obs = observation('renegade');
  obs.others[1].role = 'rebel';
  const model = new RelationshipModel(obs);
  assert.ok(model.relation(1) > 0);
  obs.others[0].hp = 1;
  assert.ok(model.relation(1) > model.relation(2));
  obs.others.slice(2).forEach(player => { player.alive = false; });
  assert.ok(model.relation(2) < 0);
  obs.others.slice(1).forEach(player => { player.alive = false; });
  assert.equal(model.relation(1), -1);
});

test('未公开的真实身份改变时，同一公开观察得到相同关系评分', () => {
  const players = Array.from({ length: 5 }, (_, id) => ({ label: `角色${id}`, sex: 'male' as const }));
  const first = GameEngine.standard({ mode: 'identity', seed: 7, players,
    roles: ['lord', 'rebel', 'loyalist', 'rebel', 'renegade'] }).getObservation(0);
  const second = GameEngine.standard({ mode: 'identity', seed: 7, players,
    roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] }).getObservation(0);
  assert.deepEqual(first, second);
  assert.equal(new RelationshipModel(first).relation(1), new RelationshipModel(second).relation(1));
});

test('主公不因未知身份默认攻击二号位，保护主公的无懈才提高信任', () => {
  const obs = observation('lord');
  obs.others[0] = person(1);
  const choices = { actor: 0, kind: 'play', title: '出牌', options: [
    { id: 'seat-two', label: '杀二号位', data: { type: 'play', cid: 10, targets: [1] } },
    { id: 'end', label: '结束出牌', data: { type: 'endPlay' } },
  ] };
  const policy = new StrategicPolicy();
  assert.equal(new RelationshipModel(obs).relation(1), 0);
  assert.equal(policy.choose(obs, choices), 'end');
  obs.events = [{ id: 1, kind: 'nullificationUsed', data: {
    player: 1, card: 20, cname: 'juedou', target: 0, parityBefore: 0,
  } }];
  assert.ok(new RelationshipModel(obs).relation(1) > 0);
  assert.equal(policy.choose(obs, choices), 'end');
  obs.events = [{ id: 1, kind: 'nullificationUsed', data: {
    player: 1, card: 20, cname: 'juedou', target: 0, parityBefore: 1,
  } }];
  assert.ok(new RelationshipModel(obs).relation(1) < 0);
  assert.equal(policy.choose(obs, choices), 'seat-two');
});

test('无懈对已知阵营的影响按锦囊利害与反制层数判断', () => {
  const obs = observation('lord');
  obs.others[0] = person(1);
  const relation = (cname: 'juedou' | 'wuzhong', parityBefore: number) => {
    obs.events = [{ id: 1, kind: 'nullificationUsed', data: {
      player: 1, card: 20, cname, target: 0, parityBefore,
    } }];
    return new RelationshipModel(obs).relation(1);
  };
  assert.ok(relation('juedou', 0) > 0);
  assert.ok(relation('juedou', 1) < 0);
  assert.ok(relation('wuzhong', 0) < 0);
  assert.ok(relation('wuzhong', 1) > 0);
});

test('仁德逐张赠牌、救援和转化杀都进入公开身份判断', () => {
  const obs = observation('lord');
  obs.others[0] = person(1);
  const relation = () => new RelationshipModel(obs).relation(1);
  assert.equal(relation(), 0);
  obs.events = [{ id: 1, kind: 'gained', data: { from: 1, to: 0, card: null, cause: 'standard.rende' } }];
  const oneGift = relation();
  assert.ok(oneGift > 0);
  obs.events.push({ id: 2, kind: 'gained', data: { from: 1, to: 0, card: null, cause: 'standard.rende' } });
  assert.ok(relation() > oneGift);
  obs.events.push({ id: 3, kind: 'rescued', data: { source: 1, target: 0 } });
  assert.equal(relation(), 0.9);
  obs.events = [{ id: 4, kind: 'attackDeclared', data: { source: 1, target: 0 } }];
  assert.ok(relation() < 0);
  obs.events = [{ id: 5, kind: 'attackDeclared', data: { source: 1, target: 0, redirectedBy: 3 } }];
  assert.equal(relation(), 0, '流离转向主公不能算作原出杀者的主动敌意');
  obs.events = [{ id: 6, kind: 'attackDeclared', data: { source: 1, target: 0, forcedBy: 3 } }];
  assert.equal(relation(), 0, '借刀杀人迫使出杀不能算作被迫者的主动敌意');
  obs.events.push({ id: 7, kind: 'damaged', data: {
    source: 1, target: 0, amount: 1, hp: 2, maxHp: 4, card: null, forcedBy: 3,
  } });
  assert.equal(relation(), 0, '被迫出杀造成伤害也不能算作主动敌意');
});

test('偷牌、群体锦囊与无目标技能不凭空推断忠反，指向性技能提供有限证据', () => {
  const obs = observation('lord');
  obs.others[0] = person(1);
  obs.events = [
    { id: 1, kind: 'gained', data: { from: 1, to: 0, card: null } },
    { id: 2, kind: 'cardUsed', data: { source: 1, card: 10, targets: [], effectiveName: 'nanman' } },
  ];
  assert.equal(new RelationshipModel(obs).relation(1), 0);
  obs.events.push({ id: 3, kind: 'skillActivated', data: {
    owner: 1, targets: [0], ability: 'standard.fanjian', label: '反间',
  } });
  assert.ok(new RelationshipModel(obs).relation(1) < 0);
});

test('公开死亡身份约束剩余阵营，反贼不会把剩下的对手永久当成中立', () => {
  const obs = observation('rebel');
  obs.others[3].alive = false;
  obs.others[3].role = 'rebel';
  const model = new RelationshipModel(obs);
  assert.equal(model.relation(2), -0.6, '已知主公、自己和死亡反贼，剩余为忠臣与内奸');
  assert.equal(model.relation(2), model.relation(3), '相同公开信息的未知座位得到相同先验');
  const choices: Decision = { actor: 0, kind: 'play', title: '出牌', options: [
    { id: 'attack', label: '杀', data: { type: 'play', cid: 10, targets: [2] } },
    { id: 'end', label: '结束', data: { type: 'endPlay' } },
  ] };
  assert.equal(new StrategicPolicy().choose(obs, choices), 'attack');
  delete obs.others[3].role;
  assert.equal(model.relation(2), 0, '尚未公开的死亡身份不能参与排除');
});

test('主忠在队友公开死亡后有敌对先验，近期救主证据仍可推翻先验', () => {
  const obs = observation('lord');
  obs.others[0] = person(1);
  obs.others[3].alive = false;
  obs.others[3].role = 'loyalist';
  const model = new RelationshipModel(obs);
  assert.ok(model.relation(1) < -0.7);
  obs.events = [{ id: 1, kind: 'rescued', data: { source: 1, target: 0 } }];
  assert.ok(model.relation(1) > 0);
  obs.events = [];
  assert.ok(model.relation(1) < 0);
});

test('八人局排除公开身份时使用八人身份数量，不误用五人分布', () => {
  const obs = observation('rebel');
  obs.others.push(person(5), person(6), person(7));
  obs.others[3].alive = false;
  obs.others[3].role = 'rebel';
  assert.ok(Math.abs(new RelationshipModel(obs).relation(2) + 0.04) < 1e-10);
});
