import Phaser from 'phaser';
import type { BrowserSession } from '../app/browser-session.ts';
import type { TableAssets } from './assets.ts';
import type { GameAudio } from './audio.ts';
import { roleLabel } from '../../chinese-view.ts';
import { background, panel, portraitArt, text, COLORS } from './visuals.ts';
import { SelectionPreview, selectionVoice } from './selection-preview.ts';
import { bindSceneSettings, type GameSettings } from './settings.ts';

const GROUPS = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };
export class SelectionScene extends Phaser.Scene {
  constructor(private session: BrowserSession, private assets: TableAssets, private audio: GameAudio,
    private onLoadProgress: (progress: number) => void, private onReady: () => void,
    private settings: GameSettings) { super('select'); }
  preload() {
    this.load.on('progress', this.onLoadProgress);
    const manifest = this.assets.manifest;
    if (manifest.background) this.load.image('background', manifest.background);
    for (const general of this.session.candidates) if (manifest.generals[general.id])
      this.load.image(general.id, manifest.generals[general.id]);
  }
  create() {
    background(this);
    const preview = new SelectionPreview();
    this.events.once('shutdown', () => preview.dispose());
    const lordSkillsAvailable = this.session.mode === 'identity' && this.session.humanSeat === this.session.lordSeat;
    let hovered: string | null = null;
    const inside = new Set<string>();
    const leave = (id: string) => {
      inside.delete(id);
      // The portrait and its button share one hover; switching between them does not replay the voice.
      queueMicrotask(() => {
        if (hovered !== id || inside.has(id)) return;
        hovered = null;
        preview.hide();
      });
    };
    text(this, 800, 82, '点 将', 54);
    const identity = this.session.mode === 'identity';
    const wideDraft = this.session.candidates.length === 5;
    text(this, 800, 139, identity
      ? `标准五人身份局 · 你在座${this.session.humanSeat + 1} · 身份【${roleLabel(this.session.role)}】 · 主公座${this.session.lordSeat! + 1}`
      : '一对一', 24, '#bca87e');
    this.session.candidates.forEach((general, index) => {
      const x = wideDraft ? 212 + index * 294 : 410 + index * 390;
      const width = wideDraft ? 270 : 312;
      panel(this, x, 461, width, wideDraft ? 535 : 554);
      portraitArt(this, x, wideDraft ? 382 : 389, width - 22, wideDraft ? 343 : 376, general.id);
      this.add.rectangle(x, 545, width - 22, 66, 0x101b1b, 0.85);
      text(this, x, 544, general.label, wideDraft ? 34 : 39);
      this.add.circle(x - width / 2 + 40, 226, 24, 0x172f2a).setStrokeStyle(2, COLORS.gold);
      text(this, x - width / 2 + 40, 226, GROUPS[general.group], 27);
      text(this, x, 604, `体力 ${general.hp}   ·   ${general.skills.join(' / ')}`, wideDraft ? 16 : 19).setWordWrapWidth(width - 36);
      const hover = this.add.rectangle(x, 432, width, 478, 0xffffff, 0).setInteractive();
      const enter = () => {
        inside.add(general.id);
        if (hovered === general.id) return;
        hovered = general.id;
        preview.show(general.id, x, width, lordSkillsAvailable);
        void this.audio.playEffect(selectionVoice(general.id, this.assets.manifest));
      };
      hover.on('pointerover', enter);
      hover.on('pointerout', () => leave(general.id));
      const button = this.add.rectangle(x, 683, wideDraft ? 208 : 234, 56, 0x65482b).setStrokeStyle(1, COLORS.light).setInteractive({ useHandCursor: true });
      text(this, x, 683, '出 战', 28);
      button.on('pointerover', () => { button.setFillStyle(0x90653a); enter(); });
      button.on('pointerout', () => { button.setFillStyle(0x65482b); leave(general.id); });
      button.once('pointerdown', () => {
        this.audio.startGame();
        document.getElementById('outside-mute')?.classList.add('hidden');
        document.getElementById('outside-settings')?.classList.add('hidden');
        this.audio.playButton();
        this.audio.playEffect(this.assets.manifest.systemAudio.game_start);
        this.session.start(general.id);
        this.scene.start('table');
      });
    });
    text(this, 800, 801, identity
      ? `选择武将出战 · ${this.session.humanSeat === this.session.lordSeat ? '主公' : '其余身份'}候选${this.session.candidates.length}名 · 其他四个座位从各自候选中选将`
      : '选择一名武将出战 · 对手从独立的三名候选中随机选将', 21, '#dac9a4');
    text(this, 800, 853, `随机种子 ${this.session.seed}`, 16, '#9d9278');
    bindSceneSettings(this, this.settings);
    this.onReady();
  }
}
