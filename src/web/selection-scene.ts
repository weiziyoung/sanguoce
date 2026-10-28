import { PregameItems } from './pregame-items.ts';
import Phaser from 'phaser';
import type { BrowserSession } from '../app/browser-session.ts';
import type { TableAssets } from './assets.ts';
import type { GameAudio } from './audio.ts';
import { allContent } from '../app/game-content.ts';
import { background, portraitArt, text } from './visuals.ts';
import { SelectionPreview, selectionVoice } from './selection-preview.ts';
import { bindSceneSettings, type GameSettings } from './settings.ts';
import { HEALTH_PIP_STATES, healthPipSourceTexture } from './health-pips.ts';
import { selectionCards, selectionRow } from './selection-layout.ts';
import { selectionHeading, selectionFrame, selectionFaction, selectionHealth, selectionSkills, selectionButton } from './selection-decoration.ts';

export class SelectionScene extends Phaser.Scene {
  constructor(private session: BrowserSession, private assets: TableAssets, private audio: GameAudio,
    private onLoadProgress: (progress: number) => void, private onReady: () => void,
    private settings: GameSettings) { super('select'); }
  preload() {
    this.load.on('progress', this.onLoadProgress);
    const manifest = this.assets.manifest;
    if (manifest.background) this.load.image('background', manifest.background);
    for (const state of HEALTH_PIP_STATES) {
      const url = manifest.healthPips?.[state];
      if (url && !this.textures.exists(healthPipSourceTexture(state))) this.load.image(healthPipSourceTexture(state), url);
    }
    for (const general of this.session.candidates) if (manifest.generals[general.id])
      this.load.image(general.id, manifest.generals[general.id]);
  }
  create() {
    background(this);
    this.assets.prepareHealthPips(this);
    const pregame = new PregameItems(this.session, this.assets.manifest, (generalId, options) => {
      this.audio.startGame();
      document.getElementById('outside-mute')?.classList.add('hidden');
      document.getElementById('outside-settings')?.classList.add('hidden');
      this.audio.playButton();
      this.audio.playEffect(this.assets.manifest.systemAudio.game_start);
      this.session.start(generalId, options);
      this.scene.start('table');
    });
    const preview = new SelectionPreview();
    this.events.once('shutdown', () => preview.dispose());
    const lordSkillsAvailable = this.session.mode === 'identity' && this.session.humanSeat === this.session.lordSeat;
    let hovered: string | null = null;
    const inside = new Set<string>();
    const frames = new Map<string, ReturnType<typeof selectionFrame>>();
    const leave = (id: string) => {
      inside.delete(id);
      // The portrait and its button share one hover; switching between them does not replay the voice.
      queueMicrotask(() => {
        if (inside.has(id)) return;
        frames.get(id)?.highlight(false);
        if (hovered !== id) return;
        hovered = null;
        preview.hide();
      });
    };
    const identity = this.session.mode === 'identity';
    selectionHeading(this, identity, this.session.humanSeat, this.session.role, this.session.lordSeat);
    const lordDraft = identity && this.session.humanSeat === this.session.lordSeat && this.session.candidates.length > 5;
    const isLord = (general: typeof this.session.candidates[number]) =>
      allContent.general(general.id).abilities.some(id => allContent.requireSkill(id).lordSkill);
    const lordCandidates = lordDraft ? this.session.candidates.filter(isLord) : [];
    const randomCandidates = lordDraft ? this.session.candidates.filter(general => !isLord(general)) : [];
    const layouts = lordDraft
      ? [...selectionRow(lordCandidates.length, 334), ...selectionRow(randomCandidates.length, 644)]
      : selectionCards(this.session.candidates.length);
    const displayedCandidates = lordDraft ? [...lordCandidates, ...randomCandidates] : [...this.session.candidates];
    displayedCandidates.forEach((general, index) => {
      const layout = layouts[index];
      frames.set(general.id, selectionFrame(this, layout));
      portraitArt(this, layout.x, layout.portraitY, layout.portraitWidth, layout.portraitHeight, general.id, 'cover');
      const strip = this.add.graphics();
      const stripHeight = layout.compact ? 36 : 66;
      strip.fillGradientStyle(0x101b1b, 0x101b1b, 0x101b1b, 0x101b1b, 0.65, 0.65, 0.97, 0.97)
        .fillRect(layout.x - layout.portraitWidth / 2, layout.labelY - stripHeight / 2, layout.portraitWidth, stripHeight);
      text(this, layout.x, layout.labelY, general.label, layout.compact ? 25 : layout.width < 300 ? 34 : 39)
        .setFontFamily('STKaiti, KaiTi, Wenq, serif').setShadow(0, 3, '#080e0c', 4);
      selectionFaction(this, layout, general.group);
      selectionHealth(this, layout, general.hp);
      selectionSkills(this, layout, allContent.general(general.id).abilities.map(id => {
        const skill = allContent.requireSkill(id);
        return `${skill.label ?? id}${skill.lordSkill ? '·主' : ''}`;
      }));
      const hover = this.add.rectangle(layout.x, layout.y, layout.width, layout.height, 0xffffff, 0).setInteractive();
      const enter = () => {
        inside.add(general.id);
        frames.get(general.id)?.highlight(true);
        if (hovered === general.id) return;
        if (hovered) frames.get(hovered)?.highlight(false);
        hovered = general.id;
        preview.show(general.id, layout.x, layout.width, lordSkillsAvailable);
        void this.audio.playEffect(selectionVoice(general.id, this.assets.manifest));
      };
      hover.on('pointerover', enter);
      hover.on('pointerout', () => leave(general.id));
      const button = selectionButton(this, layout);
      button.view.on('pointerover', () => { button.state('hover'); enter(); });
      button.view.on('pointerout', () => { button.state('rest'); leave(general.id); });
      button.view.once('pointerdown', () => {
        button.state('pressed');
        preview.hide();
        pregame.open(general.id);
      });
    });
    if (!lordDraft) text(this, 800, 764, '悬停武将查看技能 · 点击出战入局', 15, '#b3a384');
    text(this, 800, lordDraft ? 824 : 801, identity
      ? `选择武将出战 · ${this.session.humanSeat === this.session.lordSeat ? '主公' : '其余身份'}候选${this.session.candidates.length}名 · 其他四个座位从各自候选中选将`
      : '选择一名武将出战 · 对手从独立的三名候选中随机选将', 21, '#dac9a4');
    text(this, 800, lordDraft ? 864 : 853, `随机种子 ${this.session.seed}`, 16, '#9d9278');
    bindSceneSettings(this, this.settings);
    this.onReady();
  }
}
