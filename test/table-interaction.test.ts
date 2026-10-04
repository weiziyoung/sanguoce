import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { contextActionChoices } from '../src/web/hud.ts';
import { playerPosition } from '../src/web/layout.ts';
import type { Choice, Decision } from '../contracts.ts';
const leaf = (id: string, data: unknown): Choice => ({ id, label: '任意本地化文本', data });
const decision = (options: Choice[], kind = 'play', context = {}): Decision => ({ id: 'd1', actor: 0, kind, title: '', options, context });

test('拖牌只能从合法候选收敛到确切动作，非法目标不会改变选择', () => {
  const m = new TableInteraction(decision([leaf('sha', { type: 'play', cid: 3, targets: [1] }), leaf('end', { type: 'endPlay' })]));
  assert.equal(m.dragCard(8), false);
  assert.equal(m.dragCard(3), true);
  assert.deepEqual(m.nextTargets, [1]);
  assert.equal(m.selectTarget(0), false);
  assert.equal(m.exact.length, 0);
  m.selectTarget(1);
  assert.deepEqual(m.exact.map(c => c.id), ['sha']);
  m.clear();
  assert.deepEqual(m.cards, []);
  assert.deepEqual(m.targets, []);
});
test('借刀等有序目标必须按顺序选择，不能只按目标集合匹配', () => {
  const m = new TableInteraction(decision([leaf('ab', { type: 'play', cid: 4, targets: [1, 2] }), leaf('ba', { type: 'play', cid: 4, targets: [2, 1] })]));
  m.dragCard(4); m.selectTarget(2);
  assert.deepEqual(m.nextTargets, [1]);
  assert.equal(m.exact.length, 0);
  m.selectTarget(1);
  assert.deepEqual(m.exact.map(c => c.id), ['ba']);
});
test('物理牌与技能转化必须分别选择意图，多张费用可以联合选择', () => {
  const m = new TableInteraction(decision([leaf('normal', { type: 'play', cid: 1, targets: [] }),
    { id: 'skill', label: '技能', children: [leaf('convert', { type: 'virtualSha', ids: [1, 2], targets: [3], transformation: 'test' })] }]));
  assert.deepEqual(m.selectableCards, [1]);
  m.scope(m.roots[1]); m.selectCard(2); m.selectCard(1);
  assert.deepEqual(m.nextTargets, [3]);
  m.selectTarget(3);
  assert.equal(m.exact[0].id, 'convert');
  m.selectCard(1);
  assert.equal(m.exact.length, 0);
  assert.deepEqual(m.targets, []);
});
test('逐张费用的已选状态来自规则，观星保留牌堆顶底两个动作', () => {
  const cost = new TableInteraction(decision([leaf('toggle', { type: 'toggle', cid: 5 })], 'skillCost', { selectedIds: [5] }));
  assert.deepEqual(cost.selectedByRule, [5]);
  const m = new TableInteraction(decision([leaf('top', { type: 'place', card: 6, side: 'top' }), leaf('bottom', { type: 'place', card: 6, side: 'bottom' })], 'deckReorder'));
  m.dragCard(6);
  assert.deepEqual(m.exact.map(c => c.placement), ['top', 'bottom']);
  const fresh = new TableInteraction(decision([]));
  assert.deepEqual(fresh.cards, []);
});
test('1v1、5、8人座位布局均以玩家座位旋转且不会越界', () => {
  for (const count of [2, 5, 8]) {
    const ids = Array.from({ length: count }, (_, i) => i + 10);
    const points = ids.map(id => playerPosition(id, ids, 11));
    assert.equal(new Set(points.map(p => `${p.x},${p.y}`)).size, count);
    assert.deepEqual(points[1], { x: 133, y: count === 5 ? 781 : 749 });
    assert.ok(points.every(p => p.x > 0 && p.x < 1600 && p.y > 0 && p.y < 900));
  }
});

test('五人牌桌按真实座次旋转，不受观察值把自身放在首位影响', () => {
  const ids = [2, 0, 1, 3, 4];
  const left = playerPosition(3, ids, 2);
  const upperLeft = playerPosition(4, ids, 2);
  const upperRight = playerPosition(0, ids, 2);
  const right = playerPosition(1, ids, 2);
  assert.ok(left.x < upperLeft.x && upperLeft.x < upperRight.x && upperRight.x < right.x);
});

test('可选额外目标同时保留已完成动作和下一个目标，由界面确认而非提前提交', () => {
  const m = new TableInteraction(decision([leaf('one', { type: 'play', cid: 3, targets: [1] }), leaf('two', { type: 'play', cid: 3, targets: [1, 2] })]));
  m.dragCard(3); m.selectTarget(1);
  assert.deepEqual(m.exact.map(c => c.id), ['one']);
  assert.deepEqual(m.nextTargets, [2]);
});

test('弃牌阶段可一次选齐所需张数，重复点击取消且不能超选', () => {
  const m = new TableInteraction(decision([1, 2, 3].map(id =>
    leaf(`discard:${id}`, { type: 'discard', cid: id })), 'discard', { required: 2 }));
  m.selectCard(1);
  assert.equal(m.batchDiscard.length, 0);
  m.selectCard(2);
  assert.deepEqual(m.batchDiscard.map(choice => choice.id), ['discard:1', 'discard:2']);
  assert.equal(m.selectCard(3), false);
  m.selectCard(1);
  assert.deepEqual(m.cards, [2]);
  m.selectCard(3);
  assert.deepEqual(m.batchDiscard.map(choice => choice.id), ['discard:2', 'discard:3']);
});

test('刚烈先呈现弃牌与受伤意图，弃牌后手选两张并定位唯一合法组合', () => {
  const options = [
    { ...leaf('discard:1:2', { type: 'choose', choice: 'discard:1:2', ids: [1, 2] }), label: '弃两张手牌' },
    { ...leaf('discard:1:3', { type: 'choose', choice: 'discard:1:3', ids: [1, 3] }), label: '弃两张手牌' },
    { ...leaf('discard:2:3', { type: 'choose', choice: 'discard:2:3', ids: [2, 3] }), label: '弃两张手牌' },
    { ...leaf('damage', { type: 'choose', choice: 'damage', ids: [] }), label: '受到1点伤害' },
  ];
  const m = new TableInteraction(decision(options, 'skillJudgementChoice', { ability: 'standard.ganglie' }));
  assert.equal(m.ganglieDiscardIntent?.children.length, 3);
  assert.equal(m.ganglieDamageChoice?.id, 'damage');
  assert.deepEqual(contextActionChoices(m).map(choice => choice.label), ['弃两张手牌', '受到1点伤害']);
  assert.deepEqual(m.selectableCards, []);
  assert.equal(m.selectCard(1), false);
  m.scope(m.ganglieDiscardIntent!);
  assert.deepEqual(contextActionChoices(m), []);
  assert.deepEqual(m.selectableCards, [1, 2, 3]);
  assert.equal(m.selectCard(3), true);
  assert.equal(m.exact.length, 0);
  assert.equal(m.selectCard(1), true);
  assert.deepEqual(m.exact.map(choice => choice.id), ['discard:1:3']);
  assert.equal(m.selectCard(2), false);
  assert.deepEqual(m.cards, [3, 1]);
  m.selectCard(3);
  assert.deepEqual(m.cards, [1]);
  m.clear();
  assert.equal(m.ganglieDiscardActive, false);
  const shortHand = new TableInteraction(decision([options[3]], 'skillJudgementChoice', { ability: 'standard.ganglie' }));
  assert.equal(contextActionChoices(shortHand).length, 2);
  assert.equal(shortHand.ganglieDiscardIntent?.children.length, 0);
});
