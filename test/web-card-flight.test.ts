import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFlight, sampleCardFlight } from '../src/web/card-flight.ts';
import { deckPosition, handPosition, handCardPosition, HAND } from '../src/web/layout.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('对决／五人摸牌及从牌桌选牌都准确落到己方手牌位置', () => {
  const to = handCardPosition(5, 6);
  for (const from of [deckPosition(2), deckPosition(5), { x: 662, y: 483 }]) {
    const path = cardFlight(from, to, 0.52, 1);
    const start = sampleCardFlight(path, 0), end = sampleCardFlight(path, 1);
    near(start.x, from.x); near(start.y, from.y); near(start.scale, 0.52);
    near(end.x, to.x); near(end.y, to.y); near(end.scale, 1); near(end.rotation, 0);
    assert.ok(path.duration >= 340 && path.duration <= 560, '距离变化不导致过短或拖沓的飞行动画');
  }
});

test('飞行开始与结束的速度低于中段，落手减速且不会冲过目标', () => {
  const from = deckPosition(5), to = handCardPosition(0, 4);
  const path = cardFlight(from, to, 0.52, 1);
  const distance = (a: number, b: number) => {
    const first = sampleCardFlight(path, a), second = sampleCardFlight(path, b);
    return Math.hypot(first.x - second.x, first.y - second.y);
  };
  assert.ok(distance(0, 0.01) < distance(0.5, 0.51) / 20);
  assert.ok(distance(0.99, 1) < distance(0.5, 0.51) / 20);
  let previousX = from.x;
  for (let i = 0; i <= 100; i++) {
    const pose = sampleCardFlight(path, i / 100);
    assert.ok(pose.x <= previousX + 1e-8 && pose.x >= to.x - 1e-8);
    assert.ok(pose.y >= Math.min(from.y, to.y) - 64);
    assert.ok(pose.scale >= 0.52 && pose.scale <= 1);
    previousX = pose.x;
  }
});

test('飞到任意五人座位的手牌均在牌桌内，终点归正', () => {
  for (const id of [1, 2, 3, 4]) {
    const from = { x: 790, y: 483 }, to = handPosition(id, [0, 1, 2, 3, 4], 0);
    const path = cardFlight(from, to, 0.9, 54 / 120);
    for (let i = 0; i <= 60; i++) {
      const pose = sampleCardFlight(path, i / 60);
      assert.ok(pose.x > 0 && pose.x < 1600 && pose.y > 0 && pose.y < 900);
      assert.ok(Math.abs(pose.rotation) <= 0.085);
    }
    const end = sampleCardFlight(path, 1);
    near(end.x, to.x); near(end.y, to.y); near(end.rotation, 0); near(end.scale, 54 / 120);
  }
});

test('多张牌的落点按实际手牌间距分开，拥挤时仍在手牌区域内', () => {
  for (const count of [1, 2, 6, 12, 25]) {
    const slots = Array.from({ length: count }, (_, i) => handCardPosition(i, count));
    near(slots[0].x + slots.at(-1)!.x, HAND.x * 2);
    assert.ok(slots[0].x - HAND.cardWidth / 2 >= HAND.x - HAND.width / 2);
    assert.ok(slots.at(-1)!.x + HAND.cardWidth / 2 <= HAND.x + HAND.width / 2);
    for (let i = 1; i < count; i++) assert.ok(slots[i].x > slots[i - 1].x);
  }
});
