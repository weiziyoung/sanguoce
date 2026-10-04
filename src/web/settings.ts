export interface GamePreferences {
  muted: boolean;
  musicVolume: number;
  effectsVolume: number;
  gameSpeed: number;
  showBattleLog: boolean;
  showHints: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<GamePreferences> = Object.freeze({
  muted: false, musicVolume: 22, effectsVolume: 65, gameSpeed: 1,
  showBattleLog: true, showHints: true,
});
export const SETTINGS_KEY = 'sanguosha.web-settings.v1';
export const GAME_SPEEDS = [0.75, 1, 1.5, 2] as const;
type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

function normalize(value: unknown): GamePreferences {
  const result = { ...DEFAULT_PREFERENCES };
  if (!value || typeof value !== 'object') return result;
  const data = value as Record<string, unknown>;
  for (const key of ['muted', 'showBattleLog', 'showHints'] as const)
    if (typeof data[key] === 'boolean') result[key] = data[key];
  for (const key of ['musicVolume', 'effectsVolume'] as const) {
    const volume = data[key];
    if (typeof volume === 'number' && Number.isFinite(volume))
      result[key] = Math.round(Math.max(0, Math.min(100, volume)));
  }
  if (GAME_SPEEDS.some(speed => speed === data.gameSpeed)) result.gameSpeed = data.gameSpeed as number;
  return result;
}

/** Preferences are independent of the rule engine, saves and AI policy. */
export class GameSettings {
  private current: GamePreferences = { ...DEFAULT_PREFERENCES };
  private listeners = new Set<() => void>();
  private resumeWaiters = new Set<() => void>();
  private panelOpen = false;
  private storage?: SettingsStorage;
  persistent = false;
  constructor(storage?: SettingsStorage) {
    this.storage = storage;
    try {
      const saved = storage?.getItem(SETTINGS_KEY);
      if (saved) this.current = normalize(JSON.parse(saved));
      this.persistent = Boolean(storage);
    } catch { /* Corrupt or unavailable storage must never prevent playing. */ }
  }
  get value(): Readonly<GamePreferences> { return { ...this.current }; }
  get open(): boolean { return this.panelOpen; }
  update(patch: Partial<GamePreferences>): void {
    this.current = normalize({ ...this.current, ...patch });
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.current));
      this.persistent = Boolean(this.storage);
    } catch { this.persistent = false; }
    this.emit();
  }
  reset(): void { this.update(DEFAULT_PREFERENCES); }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    listener();
    return () => { this.listeners.delete(listener); };
  }
  setOpen(open: boolean): void {
    if (open === this.panelOpen) return;
    this.panelOpen = open;
    this.emit();
    if (!open) {
      for (const resolve of this.resumeWaiters) resolve();
      this.resumeWaiters.clear();
    }
  }
  async whenClosed(): Promise<void> {
    while (this.panelOpen) await new Promise<void>(resolve => this.resumeWaiters.add(resolve));
  }
  private emit(): void { for (const listener of this.listeners) listener(); }
}

export function browserSettings(): GameSettings {
  try { return new GameSettings(window.localStorage); }
  catch { return new GameSettings(); }
}

interface SettingsScene {
  time: { timeScale: number };
  tweens: { timeScale: number };
  scene: { isActive(): boolean; pause(): unknown; resume(): unknown };
  events: { once(event: string, listener: () => void): unknown };
}

/** Scale timers and tweens together; resume only scenes paused by this panel. */
export function bindSceneSettings(scene: SettingsScene, settings: GameSettings): void {
  let pausedHere = false;
  const apply = () => {
    scene.time.timeScale = settings.value.gameSpeed;
    scene.tweens.timeScale = settings.value.gameSpeed;
    if (settings.open && scene.scene.isActive()) {
      pausedHere = true;
      scene.scene.pause();
    } else if (!settings.open && pausedHere) {
      pausedHere = false;
      scene.scene.resume();
    }
  };
  const unsubscribe = settings.subscribe(apply);
  // During create(), Phaser is still CREATING; pause once it becomes RUNNING.
  scene.events.once('create', apply);
  scene.events.once('shutdown', unsubscribe);
}
