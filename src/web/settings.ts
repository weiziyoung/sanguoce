import { JEV_ENDPOINT } from '../policies/model-endpoint.ts';

export type AiProvider = 'rule' | 'jev' | 'chat';
export interface GamePreferences {
  muted: boolean;
  musicVolume: number;
  effectsVolume: number;
  gameSpeed: number;
  showBattleLog: boolean;
  showHints: boolean;
  aiProvider: AiProvider;
  jevEndpoint: string;
  jevModel: string;
  jevApiKey: string;
  chatEndpoint: string;
  chatModel: string;
  chatApiKey: string;
}

export const DEFAULT_PREFERENCES: Readonly<GamePreferences> = Object.freeze({
  muted: false, musicVolume: 22, effectsVolume: 65, gameSpeed: 1,
  showBattleLog: true, showHints: true,
  aiProvider: 'rule', jevEndpoint: JEV_ENDPOINT, jevModel: 'jev-latest', jevApiKey: '',
  chatEndpoint: '', chatModel: '', chatApiKey: '',
});
export const SETTINGS_KEY = 'sanguosha.web-settings.v1';
export const AI_CREDENTIALS_KEY = 'sanguosha.ai-credentials.v1';
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
  if (['rule', 'jev', 'chat'].includes(String(data.aiProvider))) result.aiProvider = data.aiProvider as AiProvider;
  for (const key of ['jevEndpoint', 'chatEndpoint', 'jevModel', 'chatModel', 'jevApiKey', 'chatApiKey'] as const)
    if (typeof data[key] === 'string') result[key] = data[key].trim().slice(0, key.endsWith('ApiKey') ? 4096 : 2048);
  return result;
}

/** Persist preferences locally, but keep API keys only in this tab's session storage. */
export class GameSettings {
  private current: GamePreferences = { ...DEFAULT_PREFERENCES };
  private listeners = new Set<() => void>();
  private resumeWaiters = new Set<() => void>();
  private panelOpen = false;
  private storage?: SettingsStorage;
  private credentialsStorage?: SettingsStorage;
  persistent = false;
  credentialsPersistent = false;
  constructor(storage?: SettingsStorage, credentialsStorage?: SettingsStorage) {
    this.storage = storage;
    this.credentialsStorage = credentialsStorage;
    try {
      const saved = storage?.getItem(SETTINGS_KEY);
      if (saved) this.current = normalize({ ...JSON.parse(saved), jevApiKey: '', chatApiKey: '' });
      this.persistent = Boolean(storage);
    } catch { /* Corrupt or unavailable storage must never prevent playing. */ }
    try {
      const saved = credentialsStorage?.getItem(AI_CREDENTIALS_KEY);
      const credentials = saved ? JSON.parse(saved) : {};
      this.current = normalize({ ...this.current, jevApiKey: credentials?.jevApiKey, chatApiKey: credentials?.chatApiKey });
      this.credentialsPersistent = Boolean(credentialsStorage);
    } catch { /* Keys stay in memory when session storage is unavailable. */ }
  }
  get value(): Readonly<GamePreferences> { return { ...this.current }; }
  get open(): boolean { return this.panelOpen; }
  update(patch: Partial<GamePreferences>): void {
    this.current = normalize({ ...this.current, ...patch });
    try {
      const { jevApiKey: _jev, chatApiKey: _chat, ...preferences } = this.current;
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(preferences));
      this.persistent = Boolean(this.storage);
    } catch { this.persistent = false; }
    try {
      this.credentialsStorage?.setItem(AI_CREDENTIALS_KEY, JSON.stringify({
        jevApiKey: this.current.jevApiKey, chatApiKey: this.current.chatApiKey,
      }));
      this.credentialsPersistent = Boolean(this.credentialsStorage);
    } catch { this.credentialsPersistent = false; }
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
  let local: SettingsStorage | undefined, session: SettingsStorage | undefined;
  try { local = window.localStorage; } catch { /* May be blocked independently. */ }
  try { session = window.sessionStorage; } catch { /* May be blocked independently. */ }
  return new GameSettings(local, session);
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
