import test from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import { cardView, equipmentIcon } from '../src/web/visuals.ts';

/** Reproduce Phaser's shared texture/default-frame behavior without a browser. */
function drawingFixture() {
  const frames = new Map([['__BASE', { width: 420, height: 572 }]]);
  let firstFrame = '__BASE';
  const texture = {
    has: (name: string) => frames.has(name),
    getSourceImage: () => ({ width: 420, height: 572 }),
    add(name: string, _source: number, _x: number, _y: number, width: number, height: number) {
      frames.set(name, { width, height });
      // Texture.add() selects the first non-base frame as the default.
      if (firstFrame === '__BASE') firstFrame = name;
    },
  };
  function drawable() {
    return {
      setSize() { return this; },
      setDisplaySize() { return this; },
      setStrokeStyle() { return this; },
      setOrigin() { return this; },
      setResolution() { return this; },
      setStroke() { return this; },
      add() { return this; },
    };
  }
  const images: { key: string; frame: string; width: number; height: number }[] = [];
  const scene = {
    textures: { exists: () => true, get: () => texture },
    add: {
      container: drawable, rectangle: drawable, text: drawable,
      image(_x: number, _y: number, key: string, frame = firstFrame) {
        images.push({ key, frame, ...frames.get(frame)! });
        return drawable();
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, images };
}

test('装备图标生成后，装备区选牌仍显示完整原牌而非放大的裁切插图', () => {
  for (const name of ['qinggang', 'bagua'] as const) {
    const { scene, images } = drawingFixture();
    const card = { id: 1, name, suit: 'spade', rank: name === 'qinggang' ? 6 : 2 } as const;
    equipmentIcon(scene, 0, 0, name, 20);
    cardView(scene, card, 800, 500, 120, 172);
    equipmentIcon(scene, 0, 24, name, 20);
    cardView(scene, card, 800, 500, 120, 172);
    assert.deepEqual(images.map(image => image.frame), ['equipment-icon', '__BASE', 'equipment-icon', '__BASE']);
    for (const index of [1, 3]) {
      assert.equal(images[index].key, `card:${name}`);
      assert.equal(images[index].width, 420);
      assert.equal(images[index].height, 572);
    }
  }
});

test('同一张牌在装备前后都保留完整原始牌面', () => {
  const { scene, images } = drawingFixture();
  const card = { id: 2, name: 'qinggang', suit: 'spade', rank: 6 } as const;
  cardView(scene, card, 500, 750);
  equipmentIcon(scene, 0, 0, card.name, 20);
  cardView(scene, card, 800, 500);
  assert.deepEqual(images[0], images[2]);
});
