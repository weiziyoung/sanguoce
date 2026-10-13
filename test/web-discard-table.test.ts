import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { discardTableCard } from '../src/web/discard-table-card.ts';
import { discardTablePosition, discardPickerPosition, PLAY_AREA } from '../src/web/layout.ts';
import type { VisibleEvent } from '../src/domain/events.ts';
import type Phaser from 'phaser';
import { TableEffects } from '../src/web/effects.ts';
import type { TableAssets } from '../src/web/assets.ts';
import type { GameAudio } from '../src/web/audio.ts';

for (const actor of [0, 1]) test(`${actor === 0 ? '己方' : '电脑'}连续弃牌均公开展示，即使观察已进入下一回合`, () => {
  const f = fixture();
  const cards = Array.from({ length: 6 }, () => f.hand(actor, 'sha'));
  let state = f.start(actor);
  const end = legalActions(state).find(choice => choice.data?.type === 'endPlay');
  assert.ok(end);
  state = apply(state, end.id);
  for (const card of cards.slice(0, 2)) {
    const action = legalActions(state).find(choice => choice.data?.type === 'discard' && choice.data.cid === card);
    assert.ok(action);
    state = apply(state, action.id);
  }
  const view = observe(state, 0);
  assert.notEqual(view.active, actor);
  const shown = view.events.map(event => discardTableCard(event, view)).filter(item => item !== null);
  assert.deepEqual(shown.map(item => [item.player, item.card.id, item.card.name]),
    cards.slice(0, 2).map(id => [actor, id, 'sha']));
  assert.ok(cards.slice(0, 2).every(id => state.discard.includes(id)));
});

test('弃牌展示不重复普通响应、转化费用或过拆选牌动画，也不猜测隐藏牌', () => {
  const f = fixture();
  const card = f.hand(0, 'sha');
  const view = observe(f.start(), 0);
  view.eventCards = { [card]: f.state.cards[card] };
  const make = (reason: 'discard' | 'respond' | 'use' | 'convertToSha'): VisibleEvent =>
    ({ id: 1, kind: 'discarded', data: { player: 0, card, reason } });
  for (const reason of ['respond', 'use', 'convertToSha'] as const)
    assert.equal(discardTableCard(make(reason), view), null);
  const zone: VisibleEvent = { id: 2, kind: 'discarded', data: { player: 1, card,
    reason: 'discard', selection: { cause: 'guohe', fromZone: 'hand' } } };
  assert.equal(discardTableCard(zone, view), null);
  assert.equal(discardTableCard(make('discard'), { ...view, eventCards: {} }), null);
});

test('多张弃牌居中铺开，大批弃牌仍留在桌面区域内', () => {
  for (const count of [1, 2, 6, 12, 30]) {
    const positions = Array.from({ length: count }, (_, index) => discardTablePosition(index, count));
    assert.equal((positions[0].x + positions.at(-1)!.x) / 2, PLAY_AREA.x);
    assert.ok(positions[0].x - 50 >= PLAY_AREA.x - PLAY_AREA.width / 2);
    assert.ok(positions.at(-1)!.x + 50 <= PLAY_AREA.x + PLAY_AREA.width / 2);
    assert.ok(positions.every((position, index) => index === 0 || position.x > positions[index - 1].x));
  }
});

test('固政牌面选中抬升后仍避开提示，多排牌面不遮挡手牌或彼此', () => {
  for (const count of [1, 4, 10, 11, 20, 30]) {
    const slots = Array.from({ length: count }, (_, index) => discardPickerPosition(index, count));
    assert.ok(slots.every(slot => slot.y - slot.height / 2 - 26 >= 406));
    assert.ok(slots.every(slot => slot.y + slot.height / 2 < 668));
    if (count > 10) {
      const upper = slots[0], lower = slots[Math.ceil(count / 2)];
      assert.ok(lower.y - lower.height / 2 - 26 > upper.y + upper.height / 2);
    }
  }
});

test('选牌期间收起弃牌动画及说明，退出恢复，已获得的牌不再恢复', async () => {
  class View {
    visible = true; destroyed = false; x = 0; y = 0;
    setVisible(value: boolean) { this.visible = value; return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setSize() { return this; } setStrokeStyle() { return this; }
    setOrigin() { return this; } setResolution() { return this; } setStroke() { return this; }
    setDepth() { return this; } setScale() { return this; }
    setLineSpacing() { return this; }
    add() { return this; }
    destroy() { this.destroyed = true; }
  }
  const views: View[] = [];
  const scene = {
    textures: { exists: () => false },
    add: {
      container: () => { const view = new View(); views.push(view); return view; },
      rectangle: () => new View(), text: () => new View(),
    },
    tweens: { add: (config: { targets: View; onComplete(): void }) => {
      Object.assign(config.targets, config); config.onComplete();
    } },
  } as unknown as Phaser.Scene;
  const effects = new TableEffects(scene, { manifest: {} } as TableAssets,
    { muted: true, stopEffect() {} } as GameAudio);
  const f = fixture(), ids = [f.hand(1, 'sha'), f.hand(1, 'shan'), f.hand(1, 'tao')];
  const obs = observe(f.start(), 0);
  obs.eventCards = Object.fromEntries(ids.map(id => [id, f.state.cards[id]]));
  const discard = (card: number): VisibleEvent => ({ id: card, kind: 'discarded',
    data: { player: 1, card, reason: 'discard' } });
  await effects.play(discard(ids[0]), obs);
  await effects.play(discard(ids[1]), obs);
  assert.ok(views.every(view => view.visible));
  effects.setZonePickerActive(true);
  assert.ok(views.every(view => !view.visible), '整个弃牌容器连同说明一起隐藏');
  await effects.play(discard(ids[2]), obs);
  effects.setZonePickerActive(true);
  assert.ok(views.every(view => !view.visible), '连续选择窗口与新增弃牌也不重叠');
  assert.ok(ids.every(id => effects.hasTableCard(id)), '隐藏期间仍保留去重状态');
  effects.setZonePickerActive(false);
  assert.ok(views.every(view => view.visible));
  effects.setZonePickerActive(true);
  await effects.play({ id: 99, kind: 'gained', data: { from: 1, to: 0,
    card: ids[0], cause: 'mountain.guzheng' } }, obs);
  effects.setZonePickerActive(false);
  assert.ok(views[0].destroyed);
  assert.equal(effects.hasTableCard(ids[0]), false);
  assert.ok(views.slice(1).every(view => view.visible));
  effects.dispose();
});
