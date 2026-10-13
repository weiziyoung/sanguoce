import test from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import { apply, legalActions, observe, type GameState } from '../engine.ts';
import { TableEffects } from '../src/web/effects.ts';
import { TableAssets } from '../src/web/assets.ts';
import type { GameAudio } from '../src/web/audio.ts';
import { PlayerVitalsPresenter, type PlayerVitalsState } from '../src/web/player-vitals.ts';
import { fixture } from './support/scenario-builder.ts';

/** Advance real effect promises against a deterministic scene clock, without a browser. */
function effectFixture() {
  let now = 0;
  const tasks: { at: number; target?: unknown; cancelled: boolean; run: () => void }[] = [];
  const schedule = (duration: number, run: () => void, target?: unknown) => {
    const task = { at: now + duration, target, cancelled: false, run };
    tasks.push(task);
    return { remove: () => { task.cancelled = true; } };
  };
  class View {
    destroyed = false;
    x: number;
    y: number;
    label?: string;
    constructor(x: number, y: number, label?: string) { this.x = x; this.y = y; this.label = label; }
    setSize() { return this; }
    setDepth() { return this; }
    setStrokeStyle() { return this; }
    setOrigin() { return this; }
    setResolution() { return this; }
    setStroke() { return this; }
    setLineSpacing() { return this; }
    add() { return this; }
    destroy() { this.destroyed = true; }
  }
  const views: View[] = [];
  const containers: View[] = [];
  const draw = (x: number, y: number, label?: string) => {
    const view = new View(x, y, label);
    views.push(view);
    return view;
  };
  const scene = {
    textures: { exists: () => false },
    add: { container: (x: number, y: number) => {
      const view = draw(x, y);
      containers.push(view);
      return view;
    }, rectangle: draw, text: draw },
    time: { delayedCall: (delay: number, callback: () => void) => schedule(delay, callback) },
    tweens: {
      add: (config: { duration: number; targets: unknown; onComplete?: () => void }) =>
        schedule(config.duration, () => config.onComplete?.(), config.targets),
      killTweensOf: (target: unknown) => {
        for (const task of tasks) if (task.target === target) task.cancelled = true;
      },
    },
  } as unknown as Phaser.Scene;
  const sounds: string[] = [];
  const audio = { muted: false, stopEffect() {}, playEffect(url: string) {
    sounds.push(url);
    return new Promise<void>(() => {}); // A playing voice must never hold up the next choice.
  } } as unknown as GameAudio;
  const assets = new TableAssets({ cards: {}, generals: {}, generalAudio: {}, systemAudio: {},
    cardAudio: { tao: { male: 'tao.mp3' } } });
  const effects = new TableEffects(scene, assets, audio);
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const advance = async (duration: number) => {
    const until = now + duration;
    await flush();
    while (true) {
      const next = tasks.filter(task => !task.cancelled && task.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.cancelled = true;
      now = next.at;
      next.run();
      await flush();
    }
    now = until;
    await flush();
  };
  return { effects, views, containers, sounds, advance, pending: () => tasks.filter(task => !task.cancelled) };
}

function use(state: GameState, cid: number): GameState {
  const choice = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === cid);
  assert.ok(choice);
  return apply(state, choice.id);
}

for (const count of [2, 5]) {
  test(`${count}人局：桃落桌即回血并结束事件播放，牌面停留、回血飘字和语音继续`, async () => {
    const f = fixture(count);
    f.state.players[0].hp = 2;
    const peach = f.hand(0, 'tao');
    const nextCard = f.hand(0, 'tao');
    let state = f.start();
    const before = observe(state, 0);
    const fx = effectFixture();
    let displayed!: PlayerVitalsState;
    const vitals = new PlayerVitalsPresenter((id, status) => { if (id === 0) displayed = status; });
    vitals.reset([before.self, ...before.others]);
    const last = Math.max(0, ...before.events.map(event => event.id));
    state = use(state, peach);
    const obs = observe(state, 0);
    assert.equal(obs.self.hp, 3, '规则已经同步结算回血');
    assert.ok(legalActions(state).some(choice => choice.data?.type === 'play' && choice.data.cid === nextCard));
    let ready = false;
    const playback = (async () => {
      for (const event of obs.events.filter(event => event.id > last))
        await vitals.play(event, () => fx.effects.play(event, obs));
      ready = true;
    })();
    await fx.advance(269);
    assert.equal(ready, false, '飞行尚未结束');
    await fx.advance(1);
    assert.equal(ready, true, '不用等停留、消退、飘字或语音');
    assert.equal(displayed.hp, 3);
    assert.equal(fx.effects.hasTableCard(peach), true, '牌面保留且可供桌面去重');
    assert.ok(fx.views.some(view => view.label === '+1' && !view.destroyed));
    assert.deepEqual(fx.sounds, ['tao.mp3']);
    await playback;
    await fx.advance(900);
    assert.equal(fx.effects.hasTableCard(peach), false, '保留牌自动淡出并释放');
    assert.ok(fx.views.filter(view => view.label === '+1').every(view => view.destroyed));
    assert.equal(fx.pending().length, 0);
  });
}

test('连续用桃收起上一张保留牌，离开场景清理牌面、飘字、定时器和动画', async () => {
  const f = fixture();
  f.state.players[0].hp = 2;
  const first = f.hand(0, 'tao'), second = f.hand(0, 'tao');
  let state = f.start();
  const fx = effectFixture();
  for (const cid of [first, second]) {
    const last = Math.max(0, ...observe(state, 0).events.map(event => event.id));
    state = use(state, cid);
    const obs = observe(state, 0);
    const playback = (async () => {
      for (const event of obs.events.filter(event => event.id > last)) await fx.effects.play(event, obs);
    })();
    await fx.advance(270);
    await playback;
    assert.equal(fx.effects.hasTableCard(cid), true);
  }
  assert.equal(fx.effects.hasTableCard(first), false);
  const secondView = fx.containers.at(-1)!;
  fx.effects.dispose();
  assert.equal(fx.effects.hasTableCard(second), false);
  assert.equal(fx.pending().length, 0);
  assert.ok(fx.views.filter(view => view.label === '+1').every(view => view.destroyed));
  assert.equal(secondView.destroyed, true);
  await fx.advance(2000);
  assert.equal(fx.pending().length, 0);
});
