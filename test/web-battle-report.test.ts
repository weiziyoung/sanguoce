import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuleEvent } from '../src/domain/events.ts';
import { battleReport } from '../src/web/battle-report.ts';

const event = (id: number, kind: 'damaged' | 'recovered' | 'died', data: object): RuleEvent =>
  ({ id, frameId: null, parentEventId: null, kind, data }) as RuleEvent;

test('伤害按目标归属，治疗计实际恢复，三类误杀不计有效击杀', () => {
  const roles = { 0: 'lord', 1: 'loyalist', 2: 'rebel', 3: 'rebel', 4: 'renegade' };
  const report = battleReport([0, 1, 2, 3, 4], roles, [
    event(1, 'damaged', { source: 0, target: 1, amount: 2 }),
    event(2, 'damaged', { source: 0, target: 2, amount: 1 }),
    event(3, 'damaged', { source: 0, target: 0, amount: 1 }),
    event(4, 'damaged', { source: null, target: 2, amount: 1 }),
    event(5, 'recovered', { source: 1, player: 0, amount: 2 }),
    event(6, 'recovered', { source: 0, player: 0, amount: 1 }),
    event(7, 'died', { source: 0, target: 1 }),
    event(8, 'died', { source: 1, target: 0 }),
    event(9, 'died', { source: 2, target: 3 }),
    event(10, 'died', { source: 2, target: 1 }),
    event(11, 'died', { source: null, target: 4 }),
  ]);
  assert.deepEqual(report[0].damageByTarget, { 1: 2, 2: 1 });
  assert.equal(report[0].damageTotal, 3);
  assert.equal(report[0].healing, 1);
  assert.equal(report[0].effectiveKills, 0);
  assert.equal(report[1].healing, 2);
  assert.equal(report[1].effectiveKills, 0);
  assert.equal(report[2].effectiveKills, 1);
});
