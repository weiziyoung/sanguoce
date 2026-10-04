import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/web/audio.ts';
import type { MusicPreloader } from '../src/web/music-preload.ts';

class ControlledClip {
  static clips: ControlledClip[] = [];
  static playing = new Set<ControlledClip>();
  static maxPlaying = 0;
  src: string;
  loop = false;
  volume = 1;
  paused = true;
  preload = '';
  currentTime = 0;
  readyState = 0;
  error: Error | null = null;
  loadCount = 0;
  playCount = 0;
  rejectAutoplay = false;
  listeners = new Map<string, Set<() => void>>();
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onpause: (() => void) | null = null;
  constructor(src = '') { this.src = src; if (src) ControlledClip.clips.push(this); }
  play(): Promise<void> {
    this.playCount++;
    if (this.rejectAutoplay) return Promise.reject(Object.assign(new Error('需要用户操作'), { name: 'NotAllowedError' }));
    if (this.src === '/reject.mp3') return Promise.reject(new Error('播放被拒绝'));
    this.paused = false;
    if (this.src) {
      ControlledClip.playing.add(this);
      ControlledClip.maxPlaying = Math.max(ControlledClip.maxPlaying, ControlledClip.playing.size);
    }
    return Promise.resolve();
  }
  pause(): void { this.paused = true; ControlledClip.playing.delete(this); this.onpause?.(); }
  end(): void { this.paused = true; ControlledClip.playing.delete(this); this.onended?.(); }
  fail(): void { this.paused = true; ControlledClip.playing.delete(this); this.onerror?.(); }
  load(): void { this.loadCount++; }
  addEventListener(name: string, callback: () => void): void {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(callback);
  }
  removeEventListener(name: string, callback: () => void): void { this.listeners.get(name)?.delete(callback); }
  ready(): void { this.readyState = 4; for (const callback of this.listeners.get('canplay') ?? []) callback(); }
  loadError(): void { this.error = new Error('加载失败'); for (const callback of this.listeners.get('error') ?? []) callback(); }
  removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
}

async function withAudioEffects(run: (audio: GameAudio) => Promise<void>): Promise<void> {
  const prior = { document: globalThis.document, window: globalThis.window, Audio: globalThis.Audio };
  ControlledClip.clips = []; ControlledClip.playing.clear(); ControlledClip.maxPlaying = 0;
  const music = new ControlledClip();
  Object.assign(globalThis, { document: { hidden: false, getElementById: () => music, addEventListener() {} },
    window: { addEventListener() {} }, Audio: ControlledClip });
  const audio = new GameAudio(undefined, undefined, '/button.mp3');
  try { await run(audio); }
  finally { audio.stop(); Object.assign(globalThis, prior); }
}

test('音效音量即时影响正在播放的语音和按钮，静音保留音量且停止全部音效', async () => {
  await withAudioEffects(async audio => {
    const voice = audio.playEffect('/voice.mp3');
    audio.playButton();
    audio.applySettings({ muted: false, musicVolume: 14, effectsVolume: 26 });
    assert.equal(audio.music.volume, 0.14);
    assert.equal(ControlledClip.clips[0].volume, 0.26);
    assert.ok(Math.abs(ControlledClip.clips[1].volume - 0.22) < 1e-10);
    audio.applySettings({ muted: true, musicVolume: 14, effectsVolume: 26 });
    await voice;
    assert.equal(ControlledClip.playing.size, 0);
    audio.applySettings({ muted: false, musicVolume: 14, effectsVolume: 0 });
    await audio.playEffect('/silent.mp3');
    audio.playButton();
    assert.equal(ControlledClip.clips.length, 2);
    audio.applySettings({ muted: false, musicVolume: 14, effectsVolume: 26 });
    const resumed = audio.playEffect('/voice.mp3');
    assert.equal(ControlledClip.clips.at(-1)!.volume, 0.26);
    ControlledClip.clips.at(-1)!.end();
    await resumed;
  });
});

test('试听立即播放完整音效音量，可重复点击重播，关闭只停止试听', async () => {
  await withAudioEffects(async audio => {
    const game = audio.playEffect('/voice.mp3');
    const preview = audio.previewEffect('/voice.mp3');
    assert.equal(ControlledClip.clips.length, 2, '试听不被同名游戏语音去重');
    assert.equal(ControlledClip.clips[1].volume, 0.65);
    const replay = audio.previewEffect('/voice.mp3');
    assert.equal(await preview, 'stopped');
    assert.equal(ControlledClip.clips[1].paused, true);
    assert.equal(ControlledClip.clips[0].paused, false);
    audio.applySettings({ muted: false, musicVolume: 22, effectsVolume: 31 });
    assert.equal(ControlledClip.clips[2].volume, 0.31);
    audio.stopPreview();
    assert.equal(await replay, 'stopped');
    assert.equal(ControlledClip.clips[2].paused, true);
    assert.equal(ControlledClip.clips[0].paused, false);
    ControlledClip.clips[0].end();
    await game;
  });
});

test('试听明确返回完成、资源错误、播放拒绝和静音结果，并可重试', async () => {
  await withAudioEffects(async audio => {
    assert.equal(await audio.previewEffect(), 'failed');
    assert.equal(await audio.previewEffect('/reject.mp3'), 'failed');
    const failed = audio.previewEffect('/missing.mp3');
    ControlledClip.clips.at(-1)!.fail();
    assert.equal(await failed, 'failed');
    const retry = audio.previewEffect('/missing.mp3');
    ControlledClip.clips.at(-1)!.end();
    assert.equal(await retry, 'ended');
    const preview = audio.previewEffect('/voice.mp3');
    audio.applySettings({ muted: true, musicVolume: 22, effectsVolume: 65 });
    assert.equal(await preview, 'stopped');
    assert.equal(await audio.previewEffect('/voice.mp3'), 'skipped');
  });
});

test('A未结束时B与C立即播放，各自结束互不阻塞', async () => {
  await withAudioEffects(async audio => {
    const first = audio.playEffect('/a.mp3');
    const second = audio.playEffect('/b.mp3');
    const third = audio.playEffect('/c.mp3');
    assert.deepEqual(ControlledClip.clips.map(clip => clip.src), ['/a.mp3', '/b.mp3', '/c.mp3']);
    assert.equal(ControlledClip.maxPlaying, 3);
    ControlledClip.clips[1].end(); await second;
    assert.equal(ControlledClip.clips[0].paused, false);
    assert.equal(ControlledClip.clips[2].paused, false);
    ControlledClip.clips[0].end(); await first;
    ControlledClip.clips[2].end(); await third;
  });
});

test('正在播放的同一音效不叠加，播完后允许再次触发', async () => {
  await withAudioEffects(async audio => {
    const first = audio.playEffect('/a.mp3');
    await audio.playEffect('/a.mp3');
    const second = audio.playEffect('/b.mp3');
    await audio.playEffect('/b.mp3');
    assert.deepEqual(ControlledClip.clips.map(clip => clip.src), ['/a.mp3', '/b.mp3']);
    ControlledClip.clips[0].end(); await first;
    const repeat = audio.playEffect('/a.mp3');
    assert.equal(ControlledClip.clips[1].paused, false, 'B仍在播放时，A可再次立即播放');
    assert.equal(ControlledClip.clips[2].src, '/a.mp3');
    ControlledClip.clips[1].end(); await second;
    ControlledClip.clips[2].end(); await repeat;
  });
});

test('决斗每次出杀允许同一录音独立播放，快速往返不会被去重吞掉', async () => {
  await withAudioEffects(async audio => {
    const responses = Array.from({ length: 4 }, () => audio.playEffect('/sha.mp3', { allowOverlap: true }));
    assert.equal(ControlledClip.clips.length, 4);
    assert.equal(ControlledClip.playing.size, 4);
    ControlledClip.clips[0].end();
    await responses[0];
    assert.equal(ControlledClip.playing.size, 3);
    audio.toggleMute();
    await Promise.all(responses);
    assert.equal(ControlledClip.playing.size, 0);
  });
});

test('按钮和武将／卡牌音效即时响应，不等待其他声音', async () => {
  await withAudioEffects(async audio => {
    const voice = audio.playEffect('/voice.mp3');
    audio.playButton(); audio.playButton();
    const next = audio.playEffect('/next.mp3');
    assert.deepEqual(ControlledClip.clips.map(clip => clip.src), ['/voice.mp3', '/button.mp3', '/next.mp3']);
    assert.equal(ControlledClip.maxPlaying, 3);
    for (const clip of ControlledClip.clips) clip.end();
    await Promise.all([voice, next]);
  });
});

test('静音或停止关闭所有音效，旧回调不会影响新播放的同一录音', async () => {
  await withAudioEffects(async audio => {
    const first = audio.playEffect('/a.mp3');
    const staleEnd = ControlledClip.clips[0].onended!;
    const second = audio.playEffect('/b.mp3');
    audio.toggleMute();
    await Promise.all([first, second]);
    assert.ok(ControlledClip.clips.every(clip => clip.paused));
    await audio.playEffect('/muted.mp3'); audio.playButton();
    assert.equal(ControlledClip.clips.length, 2);
    audio.toggleMute();
    const fresh = audio.playEffect('/a.mp3');
    staleEnd();
    await audio.playEffect('/a.mp3');
    assert.equal(ControlledClip.clips.length, 3, '旧结束回调不能清除新录音的去重记录');
    const another = audio.playEffect('/another.mp3');
    audio.stopEffect();
    await Promise.all([fresh, another]);
    assert.ok(ControlledClip.clips.every(clip => clip.paused));
    assert.equal(ControlledClip.playing.size, 0);
  });
});

test('加载失败或播放被拒绝不影响其他音效，并允许重试同一录音', async () => {
  await withAudioEffects(async audio => {
    const missing = audio.playEffect('/missing.mp3');
    const rejected = audio.playEffect('/reject.mp3');
    const valid = audio.playEffect('/valid.mp3');
    assert.equal(ControlledClip.clips[2].paused, false);
    ControlledClip.clips[0].fail();
    await Promise.all([missing, rejected]);
    const retry = audio.playEffect('/missing.mp3');
    assert.equal(ControlledClip.clips[3].paused, false);
    ControlledClip.clips[2].end(); await valid;
    ControlledClip.clips[3].end(); await retry;
  });
});

test('结算音效立即播放，停止页面后不会恢复背景音乐', async () => {
  await withAudioEffects(async audio => {
    const voice = audio.playEffect('/voice.mp3');
    audio.finish('/finish.mp3');
    assert.deepEqual(ControlledClip.clips.map(clip => clip.src), ['/voice.mp3', '/finish.mp3']);
    assert.equal(ControlledClip.maxPlaying, 2);
    audio.stop();
    await voice;
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.ok(ControlledClip.clips.every(clip => clip.paused));
    assert.equal(audio.music.paused, true);
  });
});

test('游戏外、游戏内与结算使用同一音乐通道切换，静音状态贯穿全局', async () => {
  class FakeAudio {
    src: string;
    loop = false;
    volume = 1;
    paused = true;
    playCount = 0;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onpause: (() => void) | null = null;
    constructor(src = '') { this.src = src; }
    play(): Promise<void> {
      this.paused = false;
      this.playCount++;
      if (this.src === '/finish.mp3') queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
    pause(): void { this.paused = true; this.onpause?.(); }
    removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
  }
  const priorDocument = globalThis.document;
  const priorWindow = globalThis.window;
  const priorAudio = globalThis.Audio;
  const music = new FakeAudio();
  const battleMusic = new FakeAudio();
  const listeners = new Map<string, () => void>();
  const page = { hidden: false, getElementById: (id: string) => id === 'battle-bgm' ? battleMusic : music,
    addEventListener: (name: string, callback: () => void) => { listeners.set(name, callback); } };
  Object.assign(globalThis, { document: page, window: { addEventListener() {} }, Audio: FakeAudio });
  try {
    const audio = new GameAudio('/battle.mp3', '/outside.mp3');
    assert.equal(music.src, '');
    audio.startOutside();
    assert.equal(music.src, '/outside.mp3');
    assert.equal(music.playCount, 1);
    audio.startGame();
    assert.equal(audio.music, battleMusic);
    assert.equal(battleMusic.src, '/battle.mp3');
    assert.equal(battleMusic.playCount, 1);
    assert.equal(music.paused, true);
    assert.equal(audio.toggleMute(), true);
    assert.equal(battleMusic.paused, true);
    assert.equal(audio.toggleMute(), false);
    assert.equal(battleMusic.playCount, 2);
    audio.finish('/finish.mp3');
    assert.equal(battleMusic.paused, true);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(music.src, '/outside.mp3');
    assert.equal(music.playCount, 2);
    assert.equal(battleMusic.paused, true);
    page.hidden = true;
    listeners.get('visibilitychange')!();
    assert.equal(music.paused, true);
    page.hidden = false;
    listeners.get('visibilitychange')!();
    assert.equal(music.playCount, 3);
    audio.stop();
  } finally {
    Object.assign(globalThis, { document: priorDocument, window: priorWindow, Audio: priorAudio });
  }
});

async function withMusic(run: (audio: GameAudio, outside: ControlledClip, battle: ControlledClip,
  listeners: Map<string, () => void>) => Promise<void>, preloader: MusicPreloader = {
    async prepare(url, progress) { progress(1); return `blob:${url}`; }, dispose() {},
  }): Promise<void> {
  const prior = { document: globalThis.document, window: globalThis.window, Audio: globalThis.Audio };
  const outside = new ControlledClip();
  const battle = new ControlledClip();
  const listeners = new Map<string, () => void>();
  Object.assign(globalThis, { document: { hidden: false,
    getElementById: (id: string) => id === 'battle-bgm' ? battle : outside,
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
  }, window: { addEventListener() {} }, Audio: ControlledClip });
  const audio = new GameAudio('/battle.mp3', '/outside.mp3', undefined, preloader);
  try { await run(audio, outside, battle, listeners); }
  finally { audio.stop(); Object.assign(globalThis, prior); }
}

test('启动准备同时加载两首背景音乐，等待可播放，切换复用缓冲且不叠播', async () => {
  await withMusic(async (audio, outside, battle) => {
    let prepared = false;
    const ready = audio.prepareMusic().then(() => { prepared = true; });
    await Promise.resolve();
    assert.equal(outside.src, 'blob:/outside.mp3');
    assert.equal(battle.src, 'blob:/battle.mp3');
    assert.equal(outside.preload, 'auto');
    assert.equal(outside.playCount + battle.playCount, 0);
    outside.ready();
    await Promise.resolve();
    assert.equal(prepared, false);
    battle.ready();
    await ready;
    await audio.prepareMusic();
    assert.equal(outside.loadCount, 1);
    assert.equal(battle.loadCount, 1);
    audio.startOutside();
    outside.currentTime = 20;
    audio.startOutside();
    assert.equal(outside.currentTime, 20, '同曲不重复切源或重置播放');
    audio.startGame();
    assert.equal(outside.paused, true);
    assert.equal(battle.paused, false);
    audio.startOutside();
    assert.equal(battle.paused, true);
    assert.equal(outside.currentTime, 0);
    assert.equal(outside.loadCount + battle.loadCount, 2, '切曲不重新加载');
  });
});

test('背景音乐无法播放时启动报告错误，清理等待监听', async () => {
  await withMusic(async (audio, outside, battle) => {
    const ready = audio.prepareMusic();
    const rejected = assert.rejects(ready, /背景音乐无法播放/);
    await Promise.resolve();
    outside.loadError();
    battle.ready();
    await rejected;
    for (const track of [outside, battle]) {
      assert.equal(track.listeners.get('canplay')?.size, 0);
      assert.equal(track.listeners.get('error')?.size, 0);
    }
  });
});

test('背景音乐下载超过八秒仍等待完整下载和可播放，不虚报进度完成', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const downloads = new Map<string, { resolve(url: string): void; progress(fraction: number): void }>();
  const preloader: MusicPreloader = {
    prepare(url, progress) { return new Promise(resolve => { downloads.set(url, { resolve, progress }); }); },
    dispose() {},
  };
  await withMusic(async (audio, outside, battle) => {
    let complete = false;
    let progress = 0;
    const ready = audio.prepareMusic(value => { progress = value; }).then(() => { complete = true; });
    downloads.get('/outside.mp3')!.progress(0.5);
    downloads.get('/battle.mp3')!.progress(0.25);
    t.mock.timers.tick(8000);
    await Promise.resolve();
    assert.equal(complete, false);
    assert.ok(progress > 0 && progress < 1);
    assert.equal(outside.src, '', '完整下载之前不让播放器重新发起远程请求');
    for (const [url, download] of downloads) { download.progress(1); download.resolve(`blob:${url}`); }
    await Promise.resolve();
    assert.equal(complete, false, '下载完成后还须等待播放器准备好');
    outside.ready();
    battle.ready();
    await ready;
    assert.equal(progress, 1);
  }, preloader);
});

for (const event of ['pointerdown', 'keydown']) {
  test(`自动播放被拦截时，首次 ${event} 恢复音乐；静音和停止后不自动续播`, async () => {
    await withMusic(async (audio, outside, battle, listeners) => {
      let blocked = false;
      audio.onMusicBlocked = value => { blocked = value; };
      outside.rejectAutoplay = true;
      audio.startOutside();
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(outside.paused, true);
      assert.equal(blocked, true, '自动播放被浏览器拦截时显示点击提示');
      outside.rejectAutoplay = false;
      listeners.get(event)!();
      assert.equal(outside.paused, false);
      assert.equal(outside.playCount, 2);
      assert.equal(battle.playCount, 0);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(blocked, false);
      listeners.get(event)!();
      assert.equal(outside.playCount, 2, '解锁后不在每次点击重复调用播放');
      audio.toggleMute();
      listeners.get(event)!();
      assert.equal(outside.paused, true);
      audio.toggleMute();
      audio.stop();
      listeners.get(event)!();
      assert.equal(outside.paused, true);
    });
  });
}
