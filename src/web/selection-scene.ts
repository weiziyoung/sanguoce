import Phaser from 'phaser';
import type { BrowserSession } from '../app/browser-session.ts';
import type { TableAssets } from './assets.ts';
import type { GameAudio } from './audio.ts';
import { roleLabel } from '../../chinese-view.ts';
import { allContent } from '../app/game-content.ts';
import { background, panel, portraitArt, text, COLORS } from './visuals.ts';
import { SelectionPreview, selectionVoice } from './selection-preview.ts';
import { bindSceneSettings, type GameSettings } from './settings.ts';

const GROUPS = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };

interface SelectionCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  portraitY: number;
  portraitWidth: number;
  portraitHeight: number;
  labelY: number;
  skillY: number;
  buttonY: number;
  buttonWidth: number;
}

function rowLayout(count: number, y: number, width = 230, height = 275): SelectionCardLayout[] {
  const step = 1460 / count;
  return Array.from({ length: count }, (_, index) => {
    const x = 70 + step * (index + 0.5);
    return { x, y, width, height, portraitY: y - 39, portraitWidth: width - 22,
      portraitHeight: 190, labelY: y + 57, skillY: y + 102, buttonY: y + 127, buttonWidth: 160 };
  });
}

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
    text(this, 800, 139, identity
      ? `五人身份局 · 你在座${this.session.humanSeat + 1} · 身份【${roleLabel(this.session.role)}】 · 主公座${this.session.lordSeat! + 1}`
      : '一对一', 24, '#bca87e');
    const lordDraft = identity && this.session.humanSeat === this.session.lordSeat && this.session.candidates.length > 5;
    const isLord = (general: typeof this.session.candidates[number]) =>
      allContent.general(general.id).abilities.some(id => allContent.requireSkill(id).lordSkill);
    const lordCandidates = lordDraft ? this.session.candidates.filter(isLord) : [];
    const randomCandidates = lordDraft ? this.session.candidates.filter(general => !isLord(general)) : [];
    const wideDraft = !lordDraft && this.session.candidates.length >= 5;
    const layouts = lordDraft
      ? [...rowLayout(lordCandidates.length, 330), ...rowLayout(randomCandidates.length, 620)]
      : this.session.candidates.map((_, index): SelectionCardLayout => {
        const step = 1460 / this.session.candidates.length;
        const x = wideDraft ? 70 + step * (index + 0.5) : 410 + index * 390;
        const width = wideDraft ? Math.min(270, step - 20) : 312;
        return { x, y: 461, width, height: wideDraft ? 535 : 554,
          portraitY: wideDraft ? 382 : 389, portraitWidth: width - 22,
          portraitHeight: wideDraft ? 343 : 376, labelY: 544,
          skillY: 604, buttonY: 683, buttonWidth: wideDraft ? 208 : 234 };
      });
    const displayedCandidates = lordDraft ? [...lordCandidates, ...randomCandidates] : [...this.session.candidates];
    displayedCandidates.forEach((general, index) => {
      const layout = layouts[index];
      panel(this, layout.x, layout.y, layout.width, layout.height);
      portraitArt(this, layout.x, layout.portraitY, layout.portraitWidth, layout.portraitHeight, general.id);
      this.add.rectangle(layout.x, layout.labelY, layout.width - 22, lordDraft ? 46 : 66, 0x101b1b, 0.85);
      text(this, layout.x, layout.labelY, general.label, lordDraft ? 28 : wideDraft ? 34 : 39);
      const factionY = lordDraft ? layout.y - layout.height / 2 + 33 : 226;
      this.add.circle(layout.x - layout.width / 2 + 40, factionY, 24, 0x172f2a).setStrokeStyle(2, COLORS.gold);
      text(this, layout.x - layout.width / 2 + 40, factionY, GROUPS[general.group], lordDraft ? 23 : 27);
      text(this, layout.x, layout.skillY, `体力 ${general.hp}   ·   ${general.skills.join(' / ')}`,
        lordDraft ? 14 : wideDraft ? 16 : 19).setWordWrapWidth(layout.width - 36);
      const hover = this.add.rectangle(layout.x, layout.y, layout.width, layout.height, 0xffffff, 0).setInteractive();
      const enter = () => {
        inside.add(general.id);
        if (hovered === general.id) return;
        hovered = general.id;
        preview.show(general.id, layout.x, layout.width, lordSkillsAvailable);
        void this.audio.playEffect(selectionVoice(general.id, this.assets.manifest));
      };
      hover.on('pointerover', enter);
      hover.on('pointerout', () => leave(general.id));
      const button = this.add.rectangle(layout.x, layout.buttonY, layout.buttonWidth, lordDraft ? 42 : 56, 0x65482b)
        .setStrokeStyle(1, COLORS.light).setInteractive({ useHandCursor: true });
      text(this, layout.x, layout.buttonY, '出 战', lordDraft ? 22 : 28);
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
    text(this, 800, lordDraft ? 824 : 801, identity
      ? `选择武将出战 · ${this.session.humanSeat === this.session.lordSeat ? '主公' : '其余身份'}候选${this.session.candidates.length}名 · 其他四个座位从各自候选中选将`
      : '选择一名武将出战 · 对手从独立的三名候选中随机选将', 21, '#dac9a4');
    text(this, 800, lordDraft ? 864 : 853, `随机种子 ${this.session.seed}`, 16, '#9d9278');
    bindSceneSettings(this, this.settings);
    this.onReady();
  }
}
