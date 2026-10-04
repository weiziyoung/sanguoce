import test from 'node:test';
import assert from 'node:assert/strict';
import type { Observation } from '../contracts.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { hiddenHandSlot, trickTablePosition } from '../src/web/layout.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';

const weapon = { id: 21, name: 'qinglong', suit: 'spade', rank: 5 } as const;
const judge = { id: 22, name: 'lebu', suit: 'heart', rank: 8 } as const;
const view = { self: { id: 0, equip: {}, judge: [] },
  others: [{ id: 1, equip: { weapon }, judge: [judge] }] } as unknown as Observation;
const model = new TableInteraction({ id: 'zone', actor: 0, kind: 'zone', title: '选择一张牌',
  context: { target: 1 }, options: [
    { id: 'hand:0', label: '暗手牌', data: { type: 'zone', zone: 'hand', slot: 0 } },
    { id: 'hand:1', label: '暗手牌', data: { type: 'zone', zone: 'hand', slot: 1 } },
    { id: 'equip:21', label: '装备区', data: { type: 'zone', zone: 'equip', cid: 21 } },
    { id: 'judge:22', label: '判定区', data: { type: 'zone', zone: 'judge', cid: 22 } },
  ] });

test('顺手、过拆的同一选牌列表包含暗手牌和明置装备、判定牌', () => {
  const picks = zonePickerChoices(view, model);
  assert.deepEqual(picks.map(pick => [pick.zone, pick.card?.id ?? null]), [
    ['hand', null], ['hand', null], ['equip', 21], ['judge', 22],
  ]);
  assert.equal(picks[2].choice.id, 'equip:21');
});

test('选牌窗口开启后锦囊移到可选牌列表外', () => {
  const pickerRight = hiddenHandSlot(5, 11).x + hiddenHandSlot(5, 11).width / 2;
  for (const count of [1, 2, 3]) for (let index = 0; index < count; index++) {
    const position = trickTablePosition('shunshou', index, count, true);
    assert.ok(position.x - 42 > pickerRight);
    assert.ok(position.y + 105 < 668);
  }
  const crowded = trickTablePosition('shunshou', 0, 4, true);
  assert.ok(crowded.y + 105 < hiddenHandSlot(0, 11).y - hiddenHandSlot(0, 11).height / 2);
});
