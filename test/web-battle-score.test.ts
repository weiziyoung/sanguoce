import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuleEvent } from '../src/domain/events.ts';
import { battleAllies, battleReport } from '../src/web/battle-report.ts';
import { battleScores } from '../src/web/battle-score.ts';

const event = (kind: 'damaged' | 'recovered' | 'died', data: object, id = 1): RuleEvent =>
  ({ id, frameId: null, parentEventId: null, kind, data }) as RuleEvent;
const victory = (winners: number[]) => ({ status: 'finished' as const, winners, losers: [], reason: 'test' });

test('积分分项统计敌方伤害、自己及队友实际治疗、有效击杀、胜利和误伤扣分', () => {
  const roles = { 0: 'lord', 1: 'loyalist', 2: 'rebel', 3: 'renegade' };
  const stats = battleReport([0, 1, 2, 3], roles, [
    event('damaged', { source: 0, target: 2, amount: 3 }),
    event('damaged', { source: 0, target: 1, amount: 1 }),
    event('damaged', { source: 0, target: 0, amount: 2 }),
    event('damaged', { source: null, target: 2, amount: 1 }),
    event('recovered', { source: 0, player: 0, amount: 1 }),
    event('recovered', { source: 0, player: 1, amount: 2 }),
    event('recovered', { source: 0, player: 2, amount: 4 }),
    event('died', { source: 0, target: 2 }),
    event('died', { source: 0, target: 1 }),
  ]);
  const result = battleScores(stats, victory([0, 1]));
  const score = result.scores.find(score => score.seat === 0)!;
  assert.deepEqual(score.points, { damage: 9, healing: 6, kills: 5, victory: 10, penalty: 11 });
  assert.equal(score.total, 19);
  assert.equal(score.stat.healing, 7, '原始治疗统计保留对敌恢复');
  assert.equal(score.stat.supportHealing, 3, '治疗敌方不计贡献');
  assert.equal(score.stat.damageTotal, 4, '原始伤害统计保留友伤');
  assert.equal(score.stat.friendlyKills, 1);
  assert.equal(result.mvp?.seat, 0);
});

test('主公忠臣、忠臣彼此和反贼彼此同阵营，内奸之间也不被当作队友', () => {
  const roles = { 0: 'lord', 1: 'loyalist', 2: 'loyalist', 3: 'rebel', 4: 'rebel', 5: 'renegade', 6: 'renegade' };
  for (const [a, b] of [[0, 1], [1, 2], [3, 4]]) assert.equal(battleAllies(a, b, roles), true);
  for (const [a, b] of [[0, 3], [1, 5], [5, 6]]) assert.equal(battleAllies(a, b, roles), false);
  const report = battleReport([1, 2], roles, [event('died', { source: 1, target: 2 })]);
  assert.equal(report[0].effectiveKills, 0); assert.equal(report[0].friendlyKills, 1);
});

test('败方即使全场最高分也不获 MVP，阵亡胜方仍参与评选', () => {
  const stats = battleReport([0, 1, 2], { 0: 'lord', 1: 'loyalist', 2: 'rebel' }, [
    event('damaged', { source: 2, target: 0, amount: 20 }),
    event('damaged', { source: 1, target: 2, amount: 4 }),
    event('died', { source: 2, target: 1 }),
  ]);
  const result = battleScores(stats, victory([0, 1]));
  assert.equal(result.scores[0].seat, 2);
  assert.equal(result.scores[0].mvp, false);
  assert.equal(result.mvp?.seat, 1);
  assert.equal(result.scores.filter(score => score.mvp).length, 1);
});

test('1v1 有效伤害与击杀正常计分，双人也只评胜方', () => {
  const stats = battleReport([0, 1], {}, [event('damaged', { source: 0, target: 1, amount: 4 }), event('died', { source: 0, target: 1 })]);
  const result = battleScores(stats, victory([0]));
  assert.equal(result.mvp?.total, 27); assert.equal(result.mvp?.seat, 0);
});

test('内奸获胜的贡献胜利分高于普通身份，落败和平局没有额外奖励', () => {
  const stats = battleReport([0, 1], {}, []);
  assert.equal(battleScores(stats, victory([0]), { 0: 'renegade' }).scores[0].points.victory, 30);
  assert.equal(battleScores(stats, victory([0]), { 0: 'lord' }).scores[0].points.victory, 10);
  assert.equal(battleScores(stats, victory([1]), { 0: 'renegade' }).scores.find(s => s.seat === 0)!.points.victory, 0);
  assert.ok(battleScores(stats, { status: 'draw', reason: 'no-survivors' }, { 0: 'renegade' }).scores.every(s => s.points.victory === 0));
});

test('积分同分依次比较有效击杀、对敌伤害、治疗贡献、座次，统计不被修改', () => {
  const stats = battleReport([0, 1, 2], {}, []);
  Object.assign(stats[0], { enemyDamage: 2, supportHealing: 2 }); // 10
  Object.assign(stats[1], { enemyDamage: 1, supportHealing: 1, effectiveKills: 1 }); // 10
  Object.assign(stats[2], { enemyDamage: 2, supportHealing: 2 });
  const before = structuredClone(stats);
  const result = battleScores(stats, victory([0, 1, 2]));
  assert.deepEqual(result.scores.map(score => score.seat), [1, 0, 2]);
  assert.deepEqual(result.scores.map(score => score.rank), [1, 2, 3]);
  assert.equal(result.mvp?.seat, 1); assert.deepEqual(stats, before);
  const noKills = battleScores(stats.map(stat => ({ ...stat, effectiveKills: 0, enemyDamage: stat.seat === 1 ? 0 : 2,
    supportHealing: stat.seat === 1 ? 5 : 2 })), victory([0, 1, 2]));
  assert.equal(noKills.mvp?.seat, 0, '同积分时对敌伤害优先');
});

test('积分最低为零，平局不设胜利分或 MVP，无事件也能稳定结算', () => {
  const stats = battleReport([0, 1], { 0: 'lord', 1: 'loyalist' }, [event('damaged', { source: 0, target: 1, amount: 20 })]);
  const draw = battleScores(stats, { status: 'draw', reason: 'no-survivors' });
  assert.equal(draw.mvp, null); assert.ok(draw.scores.every(score => score.total === 0 && score.points.victory === 0));
  assert.equal(battleScores(battleReport([0, 1], {}, []), victory([1])).mvp?.seat, 1);
  assert.throws(() => battleScores(stats, { status: 'ongoing' }), /尚未结束/);
});
