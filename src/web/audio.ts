import type { GamePreferences } from './settings.ts';
import { DownloadedMusic, type MusicPreloader } from './music-preload.ts';

export type AudioPlaybackResult = 'ended' | 'stopped' | 'failed' | 'skipped';
const PREVIEW_KEY = 'settings-preview';

/** One active music track; event effects start immediately and may overlap. */
export class GameAudio {
  private readonly outsideMusic: HTMLAudioElement;
  private readonly gameMusic: HTMLAudioElement;
  private preparation?: Promise<void>;
  private autoplayBlocked = false;
  muted = false;
  onMusicBlocked?: (blocked: boolean) => void;
  private started = false;
  private finished = false;
  private track: 'outside' | 'game' | null = null;
  private effectsVolume = 0.65;
  private effectSequence = 0;
  private activeEffects = new Map<string, { audio: HTMLAudioElement; gain: number; done(result?: AudioPlaybackResult): void }>();
  private musicGeneration = 0;
  private gameBgm?: string;
  private outsideBgm?: string;
  private buttonSound?: string;
  private readonly musicPreloader: MusicPreloader;

  constructor(gameBgm?: string, outsideBgm?: string, buttonSound?: string,
    musicPreloader: MusicPreloader = new DownloadedMusic()) {
    this.musicPreloader = musicPreloader;
    this.gameBgm = gameBgm;
    this.outsideBgm = outsideBgm;
    this.buttonSound = buttonSound;
    this.outsideMusic = document.getElementById('bgm') as HTMLAudioElement;
    this.gameMusic = document.getElementById('battle-bgm') as HTMLAudioElement;
    for (const music of [this.outsideMusic, this.gameMusic]) {
      music.loop = true;
      music.volume = 0.22;
      music.preload = 'auto';
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.music.pause();
      else this.resumeMusic();
    });
    // DOM buttons include those created later by the HUD. Capture runs before
    // handlers that replace the scene or navigate away.
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('button:not(:disabled):not([data-sound-preview])')) this.playButton();
    }, true);
    const unlock = () => { if (this.autoplayBlocked) this.resumeMusic(); };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    window.addEventListener('pagehide', event => {
      this.stop();
      if (!(event as PageTransitionEvent).persisted) this.musicPreloader.dispose();
    });
  }

  get music(): HTMLAudioElement { return this.track === 'game' ? this.gameMusic : this.outsideMusic; }

  /** Only finish after both recordings are fully downloaded and locally playable. */
  prepareMusic(progress?: (fraction: number) => void): Promise<void> {
    if (this.preparation) return this.preparation.then(() => { progress?.(1); });
    const fractions = [0, 0];
    const update = (index: number, fraction: number) => {
      fractions[index] = fraction;
      progress?.((fractions[0] + fractions[1]) / 2);
    };
    return this.preparation = Promise.all([
      this.prepareTrack(this.outsideMusic, this.outsideBgm, fraction => update(0, fraction)),
      this.prepareTrack(this.gameMusic, this.gameBgm, fraction => update(1, fraction)),
    ]).then(() => {});
  }

  private async prepareTrack(music: HTMLAudioElement, url: string | undefined,
    progress: (fraction: number) => void): Promise<void> {
    if (!url) { progress(1); return; }
    const localUrl = await this.musicPreloader.prepare(url, fraction => progress(fraction * 0.98));
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        music.removeEventListener('canplay', ready);
        music.removeEventListener('error', failed);
      };
      const ready = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('背景音乐无法播放，请刷新重试')); };
      const timeout = setTimeout(failed, 15_000);
      music.addEventListener('canplay', ready);
      music.addEventListener('error', failed);
      music.src = localUrl;
      music.load();
      if (music.error) failed();
      else if (music.readyState >= 3) ready();
    });
    progress(1);
  }

  /** Call synchronously from the mode button's click to unlock browser audio. */
  startOutside(): void { this.musicGeneration++; this.started = true; this.finished = false; this.switchTrack('outside'); }

  /** The selected general starts the game and switches to the battle track. */
  startGame(): void { this.musicGeneration++; this.started = true; this.finished = false; this.switchTrack('game'); }

  finish(url?: string): void {
    if (this.finished) return;
    this.finished = true;
    this.music.pause();
    const generation = this.musicGeneration;
    void this.playEffect(url).then(() => {
      if (generation !== this.musicGeneration) return;
      this.finished = false;
      this.switchTrack('outside');
    });
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) { this.music.pause(); this.stopEffect(); }
    else this.resumeMusic();
    this.notifyMusicBlocked();
    return this.muted;
  }

  applySettings(settings: Pick<GamePreferences, 'muted' | 'musicVolume' | 'effectsVolume'>): void {
    const wasMuted = this.muted;
    this.muted = settings.muted;
    for (const music of [this.outsideMusic, this.gameMusic]) music.volume = settings.musicVolume / 100;
    this.effectsVolume = settings.effectsVolume / 100;
    for (const effect of this.activeEffects.values()) effect.audio.volume = this.effectsVolume * effect.gain;
    if (this.muted) { this.music.pause(); this.stopEffect(); }
    else if (wasMuted) this.resumeMusic();
    this.notifyMusicBlocked();
  }

  playEffect(url?: string, options: { allowOverlap?: boolean } = {}): Promise<void> {
    if (!url || this.muted || this.effectsVolume === 0) return Promise.resolve();
    return this.playClip(url, 1, options.allowOverlap ? `event-effect:${++this.effectSequence}` : url).then(() => {});
  }

  playButton(): void {
    if (!this.buttonSound || this.muted || this.effectsVolume === 0) return;
    void this.playClip(this.buttonSound, 55 / 65);
  }

  previewEffect(url?: string): Promise<AudioPlaybackResult> {
    this.stopPreview();
    if (!url) return Promise.resolve('failed');
    if (this.muted || this.effectsVolume === 0) return Promise.resolve('skipped');
    // A separate key allows auditioning a voice already playing on the table.
    return this.playClip(url, 1, PREVIEW_KEY);
  }

  stopPreview(): void {
    const preview = this.activeEffects.get(PREVIEW_KEY);
    if (preview) { preview.done(); preview.audio.pause(); }
  }

  private playClip(url: string, gain: number, key = url): Promise<AudioPlaybackResult> {
    // Repeated hover/click events do not stack the same recording on itself.
    if (this.activeEffects.has(key)) return Promise.resolve('skipped');
    return new Promise(resolve => {
      const effect = new Audio(url);
      effect.volume = this.effectsVolume * gain;
      const done = (result: AudioPlaybackResult = 'stopped') => {
        if (this.activeEffects.get(key)?.audio !== effect) return;
        effect.onended = effect.onerror = effect.onpause = null;
        this.activeEffects.delete(key);
        resolve(result);
      };
      this.activeEffects.set(key, { audio: effect, gain, done });
      effect.onended = () => done('ended');
      effect.onerror = () => done('failed');
      effect.onpause = () => done('stopped');
      void effect.play().catch(() => done('failed'));
    });
  }

  stopEffect(): void {
    for (const effect of [...this.activeEffects.values()]) {
      effect.done();
      effect.audio.pause();
    }
  }
  stop(): void {
    this.musicGeneration++;
    this.started = false;
    this.finished = false;
    this.music.pause();
    this.stopEffect();
    this.autoplayBlocked = false;
    this.notifyMusicBlocked();
  }

  private switchTrack(track: 'outside' | 'game'): void {
    const url = track === 'outside' ? this.outsideBgm : this.gameBgm;
    if (this.track !== track) {
      this.music.pause();
      this.track = track;
      if (url && !this.music.src) this.music.src = url;
      // Seeking even from zero can briefly discard the ready buffer before the first play.
      if (this.music.currentTime !== 0) this.music.currentTime = 0;
    }
    this.resumeMusic();
  }

  private resumeMusic(): void {
    if (this.started && !this.finished && !this.muted && !document.hidden && this.music.src) {
      const music = this.music;
      const generation = this.musicGeneration;
      void music.play().then(() => {
        if (generation === this.musicGeneration && music === this.music) {
          this.autoplayBlocked = false;
          this.notifyMusicBlocked();
        }
      }).catch(error => {
        if (generation === this.musicGeneration && music === this.music) {
          this.autoplayBlocked = error?.name === 'NotAllowedError';
          this.notifyMusicBlocked();
        }
      });
    }
  }

  private notifyMusicBlocked(): void {
    this.onMusicBlocked?.(this.autoplayBlocked && this.started && !this.muted && this.music.volume > 0);
  }
}
