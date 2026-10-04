import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, GameSettings, SETTINGS_KEY, bindSceneSettings } from '../src/web/settings.ts';
import { SettingsPanel } from '../src/web/settings-panel.ts';
import type { GameAudio } from '../src/web/audio.ts';

function memoryStorage(initial: string | null = null) {
  const entries = new Map<string, string>();
  if (initial !== null) entries.set(SETTINGS_KEY, initial);
  return { entries, getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
}

test('音量、静音、速度和显示设置可跨会话恢复，重置只修改自身存储键', () => {
  const storage = memoryStorage();
  storage.entries.set('unrelated', 'keep');
  const settings = new GameSettings(storage);
  settings.update({ muted: true, musicVolume: 0, effectsVolume: 37, gameSpeed: 2, showBattleLog: false, showHints: false });
  assert.deepEqual(new GameSettings(storage).value, settings.value);
  const snapshot = settings.value as { musicVolume: number };
  snapshot.musicVolume = 99;
  assert.equal(settings.value.musicVolume, 0);
  settings.reset();
  assert.deepEqual(new GameSettings(storage).value, DEFAULT_PREFERENCES);
  assert.equal(storage.entries.get('unrelated'), 'keep');
});

test('损坏数据、错误类型、越界音量和未知速度均安全回退', () => {
  for (const value of ['bad-json', 'null', '[]', '42'])
    assert.deepEqual(new GameSettings(memoryStorage(value)).value, DEFAULT_PREFERENCES);
  const settings = new GameSettings(memoryStorage(JSON.stringify({ musicVolume: -20, effectsVolume: 200,
    muted: 'false', showHints: 0, gameSpeed: 999 })));
  assert.deepEqual(settings.value, { ...DEFAULT_PREFERENCES, musicVolume: 0, effectsVolume: 100 });
  settings.update({ musicVolume: NaN, effectsVolume: Infinity });
  assert.equal(settings.value.musicVolume, 22);
  assert.equal(settings.value.effectsVolume, 65);
});

test('禁止存储或配额不足时仍即时生效，显示无法持久化', () => {
  const settings = new GameSettings({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } });
  let applied = 0;
  settings.subscribe(() => { applied = settings.value.musicVolume; });
  settings.update({ musicVolume: 18 });
  assert.equal(applied, 18);
  assert.equal(settings.persistent, false);
  settings.reset();
  assert.equal(applied, 22);
});

test('设置打开期间异步对局等待关闭，快速重开仍保持暂停且不保存暂停状态', async () => {
  const storage = memoryStorage();
  const settings = new GameSettings(storage);
  settings.setOpen(true);
  let advanced = false;
  const waiting = settings.whenClosed().then(() => { advanced = true; });
  await Promise.resolve();
  assert.equal(advanced, false);
  settings.setOpen(false);
  settings.setOpen(true);
  await Promise.resolve();
  assert.equal(advanced, false);
  settings.setOpen(false);
  await waiting;
  assert.equal(advanced, true);
  assert.equal(storage.entries.size, 0);
});

test('动画与行动计时同步变速，场景加载完成后也会暂停，关闭和销毁安全解绑', () => {
  const settings = new GameSettings();
  let active = false, pauses = 0, resumes = 0;
  const listeners = new Map<string, () => void>();
  const scene = { time: { timeScale: 1 }, tweens: { timeScale: 1 },
    scene: { isActive: () => active, pause() { active = false; pauses++; }, resume() { active = true; resumes++; } },
    events: { once(name: string, listener: () => void) { listeners.set(name, listener); } } };
  settings.setOpen(true);
  bindSceneSettings(scene, settings);
  assert.equal(pauses, 0);
  active = true;
  listeners.get('create')!();
  assert.equal(pauses, 1);
  settings.update({ gameSpeed: 2 });
  assert.equal(scene.time.timeScale, 2);
  assert.equal(scene.tweens.timeScale, 2);
  assert.equal(resumes, 0);
  settings.setOpen(false);
  assert.equal(resumes, 1);
  settings.setOpen(false);
  assert.equal(resumes, 1);
  listeners.get('shutdown')!();
  settings.update({ gameSpeed: 0.75 });
  assert.equal(scene.time.timeScale, 2);
});

test('面板实际控件联动音量、静音、显示、存储、试听状态、恢复默认与关闭', async () => {
  class Control {
    value = ''; checked = false; disabled = false; textContent = ''; open = false;
    onclick?: () => void;
    attributes = new Map<string, string>();
    classes = new Set<string>();
    classList = { toggle: (name: string, enabled: boolean) => { if (enabled) this.classes.add(name); else this.classes.delete(name); } };
    listeners = new Map<string, (event: unknown) => void>();
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    addEventListener(name: string, listener: (event: unknown) => void) { this.listeners.set(name, listener); }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    fire(name: string, event: unknown = {}) { this.listeners.get(name)?.(event); }
  }
  const controls = new Map<string, Control>();
  const get = (id: string) => { if (!controls.has(id)) controls.set(id, new Control()); return controls.get(id)!; };
  const previous = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: get } });
  try {
    const settings = new GameSettings(memoryStorage());
    let applied: Parameters<GameAudio['applySettings']>[0] = settings.value, previews = 0;
    let previewUrl: string | undefined, previewStopped = 0;
    let finishPreview!: (result: 'ended' | 'failed' | 'stopped') => void;
    new SettingsPanel(settings, { applySettings(value) { applied = value; }, playButton() { previews++; },
      previewEffect(url) { previewUrl = url; return new Promise(resolve => { finishPreview = resolve; }); },
      stopPreview() { previewStopped++; finishPreview?.('stopped'); },
    } as GameAudio, '/voice.mp3');
    get('outside-settings').onclick!();
    assert.equal(settings.open, true);
    get('setting-musicVolume').value = '41';
    get('setting-musicVolume').fire('input');
    assert.equal(applied.musicVolume, 41);
    assert.equal(get('setting-musicVolume-value').textContent, '41%');
    get('setting-showBattleLog').checked = false;
    get('setting-showBattleLog').fire('change');
    assert.ok(get('app').classes.has('hide-battle-log'));
    get('mute').onclick!();
    assert.equal(get('setting-muted').checked, true);
    assert.equal(get('outside-mute').attributes.get('aria-pressed'), 'true');
    assert.equal(get('settings-test-sound').disabled, true);
    get('outside-mute').onclick!();
    assert.equal(previews, 1);
    get('settings-test-sound').onclick!();
    assert.equal(previewUrl, '/voice.mp3');
    assert.equal(previews, 1, '试听不会只重复普通按钮声');
    assert.match(get('settings-preview-status').textContent, /正在播放/);
    finishPreview('failed');
    await Promise.resolve();
    assert.match(get('settings-preview-status').textContent, /播放失败/);
    get('settings-test-sound').onclick!();
    finishPreview('ended');
    await Promise.resolve();
    assert.match(get('settings-preview-status').textContent, /试听结束/);
    get('settings-test-sound').onclick!();
    get('settings-reset').onclick!();
    assert.deepEqual(settings.value, DEFAULT_PREFERENCES);
    let prevented = false, stopped = false;
    get('settings-dialog').fire('keydown', { key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert.ok(prevented && stopped);
    assert.equal(settings.open, false);
    await Promise.resolve();
    assert.equal(previewStopped, 1);
    assert.match(get('settings-preview-status').textContent, /播放一段卡牌语音/);
  } finally { Object.assign(globalThis, { document: previous }); }
});
