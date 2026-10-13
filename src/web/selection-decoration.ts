import type Phaser from 'phaser';
import type { GeneralCandidate } from '../app/duel-general-selector.ts';
import type { SelectionCardLayout } from './selection-layout.ts';
import { text } from './visuals.ts';
import { factionBanner, identityToken } from './portrait-badges.ts';
import { healthPipTexture } from './health-pips.ts';
import { roleLabel } from '../../chinese-view.ts';

const BRASS = 0xbc9b62;
const calligraphy = (label: Phaser.GameObjects.Text) => label
  .setFontFamily('STKaiti, KaiTi, Wenq, serif').setShadow(0, 2, '#090b09', 3);

export function selectionHeading(scene: Phaser.Scene, identity: boolean, seat: number, role?: string, lord?: number) {
  const g = scene.add.graphics();
  g.fillGradientStyle(0x0b0d0e, 0x0b0d0e, 0x151713, 0x151713, 0.65, 0.65, 0, 0).fillRect(270, 28, 1060, 145);
  for (const side of [-1, 1]) {
    g.lineStyle(1, BRASS, 0.65).lineBetween(800 + side * 100, 72, 800 + side * 250, 72);
    g.lineStyle(1, BRASS, 0.25).lineBetween(800 + side * 118, 78, 800 + side * 218, 78);
    const x = 800 + side * 264;
    g.fillStyle(BRASS, 0.8).fillTriangle(x - 5, 72, x, 67, x + 5, 72).fillTriangle(x - 5, 72, x, 77, x + 5, 72);
  }
  calligraphy(text(scene, 800, 71, '点 将', 52, '#f8e3b6')).setLetterSpacing(8);
  if (identity) {
    text(scene, 548, 144, `五人身份局 · 座${seat + 1}`, 19, '#bdb296');
    text(scene, 1046, 144, `主公 · 座${(lord ?? 0) + 1}`, 19, '#bdb296');
    const left = 720, top = 120, width = 174, height = 48;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(left + 3, top + 4, width, height, 4);
    g.fillGradientStyle(0x3c3030, 0x271f28, 0x171b1b, 0x201d21).fillRoundedRect(left, top, width, height, 4);
    g.lineStyle(1.2, BRASS).strokeRoundedRect(left, top, width, height, 4);
    g.lineStyle(1, BRASS, 0.3).strokeRect(left + 4, top + 4, width - 8, height - 8);
    identityToken(scene, left + 27, top + height / 2, role).view.setScale(0.72);
    text(scene, left + 65, top + 11, '你的身份', 10, '#bca98a').setOrigin(0, 0.5);
    calligraphy(text(scene, left + 65, top + 31, roleLabel(role), 24, '#f6dfb1')).setOrigin(0, 0.5);
  } else {
    text(scene, 800, 143, '一 对 一  ·  择 将 出 征', 20, '#c8b591');
  }
}

/** Lacquer backing, bronze corner fittings and a restrained hover rim. */
export function selectionFrame(scene: Phaser.Scene, layout: SelectionCardLayout) {
  const { x, y, width: w, height: h } = layout;
  const g = scene.add.graphics();
  const draw = (active: boolean) => {
    const left = x - w / 2, top = y - h / 2;
    g.clear();
    if (active) for (let i = 3; i > 0; i--) g.lineStyle(2, 0xd6ab67, 0.06 * (4 - i))
      .strokeRoundedRect(left - i * 2, top - i * 2, w + i * 4, h + i * 4, 7);
    g.fillStyle(0x000000, 0.5).fillRoundedRect(left + 5, top + 8, w, h, 6);
    g.fillGradientStyle(0x344037, 0x182622, 0x101a18, 0x111714).fillRoundedRect(left, top, w, h, 5);
    g.lineStyle(active ? 2 : 1.2, active ? 0xe2bc7f : BRASS, 0.9).strokeRoundedRect(left, top, w, h, 5);
    g.lineStyle(1, BRASS, 0.28).strokeRect(left + 5, top + 5, w - 10, h - 10);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const px = x + sx * (w / 2 - 2), py = y + sy * (h / 2 - 2);
      g.lineStyle(3, 0xd4b77f, 0.8).beginPath().moveTo(px - sx * 18, py)
        .lineTo(px, py).lineTo(px, py - sy * 18).strokePath();
      g.fillStyle(0xe4c58e).fillCircle(px - sx * 5, py - sy * 5, 1.5);
    }
    // A divider gives the controls their own quiet area beneath the artwork.
    g.lineStyle(1, BRASS, 0.3).lineBetween(left + 18, layout.healthY - 15, left + w - 18, layout.healthY - 15);
  };
  draw(false);
  return { highlight: draw };
}

export function selectionFaction(scene: Phaser.Scene, layout: SelectionCardLayout, group: GeneralCandidate['group']) {
  const top = layout.y - layout.height / 2;
  return factionBanner(scene, layout.x - layout.width / 2 + (layout.compact ? 28 : 40), top + (layout.compact ? 29 : 39), group)
    .setScale(layout.compact ? 0.86 : 1.12);
}

export function selectionHealth(scene: Phaser.Scene, layout: SelectionCardLayout, hp: number) {
  const size = layout.compact ? 16 : 23;
  const step = Math.min(size + 3, (layout.width - 66) / hp);
  const width = 32 + hp * step;
  const left = layout.x - width / 2;
  text(scene, left + 12, layout.healthY, '体力', layout.compact ? 10 : 12, '#a8ae92');
  for (let i = 0; i < hp; i++) {
    const x = left + 36 + i * step;
    if (scene.textures.exists(healthPipTexture('healthy'))) scene.add.image(x, layout.healthY, healthPipTexture('healthy')).setDisplaySize(size, size);
    else scene.add.circle(x, layout.healthY, size / 3, 0x87a57b).setStrokeStyle(1, BRASS);
  }
}

export function selectionSkills(scene: Phaser.Scene, layout: SelectionCardLayout, labels: string[]) {
  const gap = layout.compact ? 5 : 8;
  const size = layout.compact ? 12 : 18;
  const widths = labels.map(label => label.length * size + (layout.compact ? 12 : 24));
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (labels.length - 1);
  const scale = Math.min(1, (layout.width - 30) / total);
  const height = layout.compact ? 22 : 30;
  let left = layout.x - total * scale / 2;
  for (const [index, label] of labels.entries()) {
    const width = widths[index] * scale;
    const g = scene.add.graphics();
    g.fillGradientStyle(0x474236, 0x30352c, 0x222c25, 0x1b2621).fillRoundedRect(left, layout.skillY - height / 2, width, height, 3);
    g.lineStyle(1, BRASS, 0.45).strokeRoundedRect(left, layout.skillY - height / 2, width, height, 3);
    g.lineStyle(1, 0xe4cea1, 0.25).lineBetween(left + 4, layout.skillY - height / 2 + 3, left + width - 4, layout.skillY - height / 2 + 3);
    calligraphy(text(scene, left + width / 2, layout.skillY, label, size * scale, '#dcc69c'));
    left += width + gap * scale;
  }
}

export function selectionButton(scene: Phaser.Scene, layout: SelectionCardLayout) {
  const { buttonWidth: w, buttonHeight: h } = layout;
  const view = scene.add.container(layout.x, layout.buttonY).setSize(w, h).setInteractive({ useHandCursor: true });
  const g = scene.add.graphics();
  const label = calligraphy(text(scene, 3, -1, '出 战', layout.compact ? 19 : 28, '#ffe6b6')).setLetterSpacing(layout.compact ? 3 : 6);
  view.add([g, label]);
  const draw = (state: 'rest' | 'hover' | 'pressed') => {
    const active = state !== 'rest', pressed = state === 'pressed';
    g.clear();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(-w / 2 + 2, -h / 2 + 5, w, h, 4);
    g.fillGradientStyle(active ? 0x9c5337 : 0x793c2d, active ? 0x865034 : 0x683629,
      pressed ? 0x3d2019 : 0x44261e, pressed ? 0x3d2019 : 0x573122).fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    g.lineStyle(1.5, active ? 0xf0ce8c : 0xc3a36b).strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
    g.lineStyle(1, 0xf5d294, active ? 0.6 : 0.3).strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
    g.lineStyle(1, 0xf5d294, 0.3).lineBetween(-w / 2 + 10, -h / 2 + 7, w / 2 - 10, -h / 2 + 7);
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - (layout.compact ? 12 : 18));
      g.lineStyle(1, BRASS).beginPath().moveTo(x - side * 5, -5).lineTo(x, 0).lineTo(x - side * 5, 5).strokePath();
    }
    label.setY(pressed ? 1 : -1).setColor(active ? '#fff1cc' : '#ffe6b6');
  };
  draw('rest');
  return { view, state: draw };
}
