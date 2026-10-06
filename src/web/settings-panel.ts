import type { GameAudio } from './audio.ts';
import type { GamePreferences, GameSettings } from './settings.ts';
import { AiSettingsPanel } from './ai-settings-panel.ts';

/** Native modal supplies focus containment and makes the underlying DOM inert. */
export class SettingsPanel {
  private dialog = document.getElementById('settings-dialog') as HTMLDialogElement;
  private settings: GameSettings;
  constructor(settings: GameSettings, audio: GameAudio, previewSound?: string) {
    this.settings = settings;
    new AiSettingsPanel(settings);
    const input = (key: keyof GamePreferences) => document.getElementById(`setting-${key}`) as HTMLInputElement;
    for (const key of ['musicVolume', 'effectsVolume'] as const)
      input(key).addEventListener('input', () => settings.update({ [key]: Number(input(key).value) }));
    for (const key of ['muted', 'showBattleLog', 'showHints'] as const)
      input(key).addEventListener('change', () => settings.update({ [key]: input(key).checked }));
    input('gameSpeed').addEventListener('change', () => settings.update({ gameSpeed: Number(input('gameSpeed').value) }));
    document.getElementById('settings-reset')!.onclick = () => settings.reset();
    document.getElementById('settings-close')!.onclick = () => this.dialog.close();
    const previewStatus = document.getElementById('settings-preview-status')!;
    let previewRequest = 0;
    document.getElementById('settings-test-sound')!.onclick = () => {
      const request = ++previewRequest;
      previewStatus.textContent = '正在播放试听语音…';
      // Start during the click gesture so browser autoplay restrictions allow it.
      void audio.previewEffect(previewSound).then(result => {
        if (request !== previewRequest) return;
        previewStatus.textContent = result === 'failed' ? '试听播放失败，请检查声音资源后重试。'
          : result === 'ended' ? '试听结束，可调整音量后再次试听。'
          : result === 'skipped' ? '请先关闭静音，并调高音效音量。' : '试听已停止。';
      });
    };
    for (const id of ['settings', 'outside-settings']) document.getElementById(id)!.onclick = () => this.show();
    // Phaser also listens for Escape globally: keep modal keystrokes out of the table.
    this.dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.dialog.close(); }
    });
    this.dialog.addEventListener('close', () => {
      previewRequest++;
      audio.stopPreview();
      previewStatus.textContent = '播放一段卡牌语音，使用当前音效音量。';
      settings.setOpen(false);
    });
    settings.subscribe(() => {
      const value = settings.value;
      audio.applySettings(value);
      for (const key of ['musicVolume', 'effectsVolume'] as const) {
        input(key).value = String(value[key]);
        document.getElementById(`setting-${key}-value`)!.textContent = `${value[key]}%`;
      }
      for (const key of ['muted', 'showBattleLog', 'showHints'] as const) input(key).checked = value[key];
      input('gameSpeed').value = String(value.gameSpeed);
      document.getElementById('app')!.classList.toggle('hide-battle-log', !value.showBattleLog);
      document.getElementById('app')!.classList.toggle('hide-operation-hints', !value.showHints);
      for (const id of ['mute', 'outside-mute']) {
        const button = document.getElementById(id)!;
        button.textContent = value.muted ? '静音' : '声音';
        button.setAttribute('aria-pressed', String(value.muted));
        button.setAttribute('aria-label', value.muted ? '开启声音' : '静音');
      }
      document.getElementById('settings-save-status')!.textContent = settings.persistent
        ? '更改立即生效，自动保存在此浏览器。' : '更改已生效；浏览器存储不可用，刷新后将恢复默认。';
      (document.getElementById('settings-test-sound') as HTMLButtonElement).disabled = value.muted || value.effectsVolume === 0;
    });
    for (const id of ['mute', 'outside-mute']) document.getElementById(id)!.onclick = () => {
      const wasMuted = settings.value.muted;
      settings.update({ muted: !wasMuted });
      if (wasMuted) audio.playButton();
    };
  }
  show(): void {
    if (this.dialog.open) return;
    this.dialog.showModal();
    this.settings.setOpen(true);
  }
}
