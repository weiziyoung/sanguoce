import test from 'node:test';
import assert from 'node:assert/strict';
import type { Observation } from '../contracts.ts';
import { tableCardLabel } from '../src/web/table-card-label.ts';

const view = { mode: { id: 'identity' }, self: { id: 1 },
  eventCards: {
    10: { id: 10, name: 'sha', suit: 'spade', rank: 7 },
    11: { id: 11, name: 'wuxie', suit: 'club', rank: 12 },
    12: { id: 12, name: 'tao', suit: 'heart', rank: 3 },
    13: { id: 13, name: 'wugu', suit: 'heart', rank: 5 },
  } } as unknown as Observation;

test('桌面牌标明出牌者、目标、无懈反制者与五谷选牌者', () => {
  assert.equal(tableCardLabel({ id: 1, kind: 'cardUsed', data: {
    source: 1, card: 10, targets: [3], effectiveName: 'sha',
  } }, view), '座2 使用杀\n座4');
  assert.equal(tableCardLabel({ id: 2, kind: 'nullificationUsed', data: {
    player: 4, card: 11, cname: 'juedou', target: 3, parityBefore: 0,
  } }, view), '座5 打出无懈\n抵消决斗·座4');
  assert.equal(tableCardLabel({ id: 3, kind: 'nullificationUsed', data: {
    player: 0, card: 11, cname: 'juedou', target: 3, parityBefore: 1,
  } }, view), '座1 打出无懈\n恢复决斗·座4');
  assert.equal(tableCardLabel({ id: 4, kind: 'harvestTaken', data: {
    player: 2, card: 12,
  } }, view), '座3 选择\n桃');
  assert.equal(tableCardLabel({ id: 5, kind: 'cardUsed', data: {
    source: 1, card: 12, targets: [],
  } }, view), '座2 使用桃\n座2');
  assert.equal(tableCardLabel({ id: 6, kind: 'cardUsed', data: {
    source: 1, card: 13, targets: [],
  } }, view), '座2 使用五谷丰登\n全场');
});
