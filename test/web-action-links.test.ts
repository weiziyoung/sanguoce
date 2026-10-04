import test from 'node:test';
import assert from 'node:assert/strict';
import type { Observation } from '../contracts.ts';
import { actionLinks, ActionLinkRouter } from '../src/web/action-links.ts';
import { eventSounds } from '../src/web/sound-cues.ts';
import type { VisibleEvent } from '../src/domain/events.ts';
import { apply, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { EQUIPMENT_ROW, IDENTITY_JUDGE, IDENTITY_SELF, equipmentRowPosition, identityZonePosition, playerPosition } from '../src/web/layout.ts';

const view = { events: [], mode: { id: 'identity' }, turn: 1, phase: 'play', active: 0, actor: 0,
  self: { id: 0, label: '你', sex: 'male', hp: 3, maxHp: 3, alive: true, handCount: 0,
    equip: {}, judge: [], hand: [] }, others: [], deckCount: 0, discardCount: 0,
  discardTop: null, table: [], shaUsed: 0, nullify: null, log: [], outcome: { status: 'ongoing' },
  eventCards: { 10: { id: 10, name: 'guohe', suit: 'spade', rank: 7 },
    11: { id: 11, name: 'jiedao', suit: 'club', rank: 12 },
    12: { id: 12, name: 'sha', suit: 'spade', rank: 7 },
    13: { id: 13, name: 'shan', suit: 'heart', rank: 2 } } } satisfies Observation;

test('真实出杀的指示线与牌名语音都属于出牌事件，后续攻击事件不再重复画线', () => {
  const f = fixture();
  const sha = f.hand(0, 'sha');
  f.hand(1, 'shan');
  const start = f.start();
  const choice = legalActions(start).find(c => c.data?.type === 'play' && c.data.cid === sha)!;
  const obs = observe(apply(start, choice.id), 0);
  const played = obs.events.find(e => e.kind === 'cardUsed' && e.data.card === sha)!;
  const attack = obs.events.find(e => e.kind === 'attackDeclared')!;
  assert.ok(played.id < attack.id);
  assert.deepEqual(eventSounds(played, obs, { cards: {}, generals: {}, generalAudio: {},
    systemAudio: {}, cardAudio: { sha: { male: '/sha.mp3' } } }), ['/sha.mp3']);
  const router = new ActionLinkRouter();
  const cues = obs.events.map(e => ({ event: e, links: router.links(e, obs) }));
  assert.deepEqual(cues.find(c => c.event.id === played.id)?.links,
    [{ from: 0, to: 1, label: '杀', helpful: false }]);
  assert.deepEqual(cues.find(c => c.event.id === attack.id)?.links, []);
});

test('多目标杀同时显示全部目标，每个攻击事件只去重一次，追击仍显示指示线', () => {
  const router = new ActionLinkRouter();
  const played: VisibleEvent = { id: 1, kind: 'cardUsed', data: { source: 0, card: 12, targets: [1, 2] } };
  assert.deepEqual(router.links(played, view), [
    { from: 0, to: 1, label: '杀', helpful: false },
    { from: 0, to: 2, label: '杀', helpful: false },
  ]);
  const attack = (id: number, target: number): VisibleEvent =>
    ({ id, kind: 'attackDeclared', data: { source: 0, target } });
  assert.deepEqual(router.links(attack(2, 1), view), []);
  assert.deepEqual(router.links(attack(3, 2), view), []);
  assert.deepEqual(router.links(attack(4, 1), view), [{ from: 0, to: 1, label: '杀', helpful: false }]);
  assert.equal(router.links({ ...played, id: 5 }, view).length, 2);
  assert.deepEqual(router.links(attack(6, 1), view), []);
});

test('转移、借刀和未发出cardUsed的虚拟杀保留实际攻击指向', () => {
  const router = new ActionLinkRouter();
  router.links({ id: 1, kind: 'cardUsed', data: { source: 0, card: 12, targets: [1] } }, view);
  assert.deepEqual(router.links({ id: 2, kind: 'attackDeclared', data: { source: 0, target: 1 } }, view), []);
  assert.deepEqual(router.links({ id: 3, kind: 'attackDeclared', data: { source: 0, target: 2, redirectedBy: 1 } }, view),
    [{ from: 0, to: 2, label: '杀', helpful: false }]);
  router.links({ id: 4, kind: 'cardUsed', data: { source: 0, card: 11, targets: [1, 2] } }, view);
  assert.deepEqual(router.links({ id: 5, kind: 'attackDeclared', data: { source: 1, target: 2, forcedBy: 0 } }, view),
    [{ from: 1, to: 2, label: '杀', helpful: false }]);
  assert.deepEqual(router.links({ id: 6, kind: 'attackDeclared', data: { source: 0, target: 1 } }, view),
    [{ from: 0, to: 1, label: '杀', helpful: false }]);
});

test('有效牌名为杀时提前连线，回合切换清理尚未结算的攻击指向', () => {
  const router = new ActionLinkRouter();
  assert.deepEqual(router.links({ id: 1, kind: 'cardUsed', data: {
    source: 0, card: 13, effectiveName: 'sha', targets: [1],
  } }, view), [{ from: 0, to: 1, label: '杀', helpful: false }]);
  router.links({ id: 2, kind: 'turnStarted', data: { player: 1, turn: 2 } }, view);
  assert.deepEqual(router.links({ id: 3, kind: 'attackDeclared', data: { source: 0, target: 1 } }, view),
    [{ from: 0, to: 1, label: '杀', helpful: false }]);
});

test('指向牌、借刀、流离、离间和转化杀都标明实际发起人与目标', () => {
  assert.deepEqual(actionLinks({ id: 1, kind: 'cardUsed', data: { source: 0, card: 10, targets: [2] } }, view),
    [{ from: 0, to: 2, label: '过河拆桥', helpful: false }]);
  assert.deepEqual(actionLinks({ id: 5, kind: 'cardUsed', data: {
    source: 0, card: 11, targets: [1, 2],
  } }, view), [
    { from: 0, to: 1, label: '借刀杀人', helpful: false },
    { from: 1, to: 2, label: '杀', helpful: false },
  ]);
  assert.deepEqual(actionLinks({ id: 2, kind: 'attackDeclared', data: { source: 3, target: 4 } }, view),
    [{ from: 3, to: 4, label: '杀', helpful: false }]);
  assert.deepEqual(actionLinks({ id: 3, kind: 'skillActivated', data: {
    owner: 2, targets: [4], ability: 'standard.liuli', label: '流离',
  } }, view), [{ from: 2, to: 4, label: '流离', helpful: false }]);
  assert.deepEqual(actionLinks({ id: 4, kind: 'skillActivated', data: {
    owner: 2, targets: [3, 4], ability: 'standard.lijian', label: '离间',
  } }, view), [
    { from: 2, to: 3, label: '离间', helpful: false },
    { from: 3, to: 4, label: '决斗', helpful: false },
  ]);
});

test('五人装备逐行放在体力数字上方，己方判定牌位于上方牌桌', () => {
  const seats = [0, 1, 2, 3, 4];
  for (const self of seats) for (const id of seats) {
    const portrait = playerPosition(id, seats, self);
    for (let equipmentCount = 0; equipmentCount <= 4; equipmentCount++) {
      const equipment = Array.from({ length: equipmentCount }, (_, i) =>
        identityZonePosition(id, seats, self, 'equip', i, equipmentCount));
      for (let a = 0; a < equipment.length; a++) for (let b = a + 1; b < equipment.length; b++) {
        assert.equal(equipment[a].x, equipment[b].x);
        assert.ok(Math.abs(equipment[a].y - equipment[b].y) >= EQUIPMENT_ROW.height + EQUIPMENT_ROW.gap);
      }
      for (const zone of ['equip', 'judge'] as const) {
        const size = zone === 'equip' ? { ...EQUIPMENT_ROW, width: id === self ? 152 : 128 } : IDENTITY_JUDGE;
        const count = zone === 'equip' ? equipmentCount : 2;
        for (let i = 0; i < count; i++) {
          const pos = identityZonePosition(id, seats, self, zone, i, count);
          if (zone === 'equip') {
            const halfHeight = id === self ? IDENTITY_SELF.height / 2 : 107;
            assert.ok(pos.y - size.height / 2 > portrait.y - halfHeight + 60);
            assert.ok(pos.y + size.height / 2 < portrait.y + halfHeight - 35);
            const portraitWidth = id === self ? IDENTITY_SELF.width : 172;
            assert.equal(size.width, portraitWidth - 44, '装备行覆盖原画可用宽度');
            assert.ok(pos.x - size.width / 2 > portrait.x - portraitWidth / 2 + 36, '避开左侧姓名和阴阳鱼');
          } else if (id === self) assert.ok(pos.y + size.height / 2 < portrait.y - IDENTITY_SELF.height / 2);
          else assert.ok(pos.y - size.height / 2 > portrait.y + 107);
          assert.ok(pos.x - size.width / 2 > 0 && pos.x + size.width / 2 < 1600);
          assert.ok(pos.y + size.height / 2 < 900);
        }
      }
    }
  }
});

test('对决己方和对手满装备时，每行都在画像内且不遮挡体力数字', () => {
  const seats = [0, 1];
  for (const self of seats) for (const id of seats) {
    const portrait = playerPosition(id, seats, self);
    const halfHeight = id === self ? 121 : 130;
    const rows = Array.from({ length: 4 }, (_, i) => equipmentRowPosition(id, seats, self, i, 4));
    for (const row of rows) {
      assert.equal(row.x, portrait.x + 16);
      assert.equal(row.width, id === self ? 152 : 160, '装备行覆盖原画可用宽度');
      assert.ok(row.y - EQUIPMENT_ROW.height / 2 > portrait.y - halfHeight + 60);
      assert.ok(row.y + EQUIPMENT_ROW.height / 2 < portrait.y + halfHeight - 35);
      assert.ok(row.y + EQUIPMENT_ROW.height / 2 < 900);
    }
  }
});

test('无懈反制层数与关系模型共用同一利害判断', () => {
  const cue = (parityBefore: number) => actionLinks({ id: parityBefore + 1, kind: 'nullificationUsed', data: {
    player: 2, target: 0, card: 10, cname: 'juedou', parityBefore,
  } }, view)[0];
  assert.equal(cue(0).helpful, true);
  assert.equal(cue(1).helpful, false);
});
