import type Phaser from 'phaser';
import { cardLabel, cardAssetKey, type Card } from '../../catalog.ts';
import { BOARD } from './layout.ts';

export const COLORS = { ink: 0x111b1a, gold: 0xb2945e, light: 0xf2d299, selected: 0x9ed9c7,
  red: 0xb64c38, green: 0x547566 } as const;
export function text(scene: Phaser.Scene, x: number, y: number, value: string, size = 24, color = '#efdbb5') {
  return scene.add.text(x, y, value, { fontFamily: 'Wenq', fontSize: `${size}px`, color,
    stroke: '#101815', strokeThickness: 1, align: 'center' }).setOrigin(0.5).setResolution(2);
}
export function panel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, color: number = COLORS.gold) {
  const graphics = scene.add.graphics();
  graphics.fillStyle(COLORS.ink, 0.94).fillRoundedRect(x - width / 2, y - height / 2, width, height, 5);
  graphics.lineStyle(1.5, color).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 5);
  graphics.lineStyle(1, color, 0.3).strokeRect(x - width / 2 + 5, y - height / 2 + 5, width - 10, height - 10);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const px = x + sx * width / 2, py = y + sy * height / 2;
    graphics.lineStyle(3, color).beginPath().moveTo(px - sx * 20, py).lineTo(px, py).lineTo(px, py - sy * 20).strokePath();
  }
  return graphics;
}
export function background(scene: Phaser.Scene): void {
  if (scene.textures.exists('background')) scene.add.image(800, 450, 'background').setDisplaySize(BOARD.width, BOARD.height);
  else scene.cameras.main.setBackgroundColor('#20372f');
  scene.add.rectangle(800, 450, BOARD.width, BOARD.height, 0x081316, 0.31);
  const g = scene.add.graphics();
  g.fillStyle(0x071014, 0.8).fillRect(0, 668, 1600, 232);
  g.lineStyle(2, COLORS.gold, 0.8).lineBetween(0, 668, 1600, 668);
  g.lineStyle(1, COLORS.gold, 0.25).lineBetween(0, 673, 1600, 673);
}
export function portraitArt(scene: Phaser.Scene, x: number, y: number, width: number, height: number, key: string,
  fit: 'contain' | 'cover' = 'contain') {
  if (!scene.textures.exists(key)) return scene.add.rectangle(x, y, width, height, 0x263d32);
  const texture = scene.textures.get(key);
  const source = texture.getSourceImage() as HTMLImageElement;
  if (!texture.has('portrait')) texture.add('portrait', 0, Math.round(source.width * 0.24),
    Math.round(source.height * 0.135), Math.round(source.width * 0.625), Math.round(source.height * 0.59));
  const frame = texture.get('portrait');
  if (fit === 'cover') {
    // Fill the taller table portrait without stretching the artwork or leaving a footer.
    const scale = Math.max(width / frame.width, height / frame.height);
    const cropWidth = Math.min(frame.width, Math.round(width / scale));
    const cropHeight = Math.min(frame.height, Math.round(height / scale));
    const coverFrame = `portrait-cover:${cropWidth}:${cropHeight}`;
    if (!texture.has(coverFrame)) texture.add(coverFrame, 0,
      frame.cutX + Math.floor((frame.width - cropWidth) / 2),
      frame.cutY + Math.floor((frame.height - cropHeight) / 2), cropWidth, cropHeight);
    return scene.add.image(x, y, key, coverFrame).setDisplaySize(width, height);
  }
  const scale = Math.min(width / frame.width, height / frame.height);
  return scene.add.image(x, y, key, 'portrait').setDisplaySize(frame.width * scale, frame.height * scale);
}
export function cardView(scene: Phaser.Scene, card: Card, x: number, y: number, width = 120, height = 172) {
  const container = scene.add.container(x, y).setSize(width, height);
  const shadow = scene.add.rectangle(4, 6, width + 2, height + 2, 0x000000, 0.45);
  const border = scene.add.rectangle(0, 0, width + 4, height + 4, 0x000000, 0).setStrokeStyle(0);
  container.add([shadow, border]);
  // Adding the equipment-icon frame changes Phaser's default frame; full cards
  // must explicitly keep the original artwork, including its title and rules.
  const key = cardAssetKey(card);
  if (scene.textures.exists(`card:${key}`)) container.add(scene.add.image(0, 0, `card:${key}`, '__BASE').setDisplaySize(width, height));
  else container.add(scene.add.rectangle(0, 0, width, height, 0xe5d5ad));
  const rank = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[card.rank] ?? String(card.rank);
  const suit = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[card.suit];
  const red = card.suit === 'heart' || card.suit === 'diamond';
  container.add(scene.add.rectangle(-width / 2 + 16, -height / 2 + 29, 27, 53, 0xefdfbc, 0.96));
  container.add(text(scene, -width / 2 + 16, -height / 2 + 17, rank, 20, red ? '#a02d27' : '#1b2523').setStroke('', 0));
  container.add(scene.add.text(-width / 2 + 16, -height / 2 + 39, suit,
    { fontFamily: 'serif', fontSize: '21px', color: red ? '#a02d27' : '#1b2523' }).setOrigin(0.5));
  container.add(scene.add.rectangle(0, height / 2 - 16, width - 7, 25, 0x15211f, 0.96));
  container.add(text(scene, 0, height / 2 - 15, cardLabel(card),
    width < 90 ? 13 : 20));
  return { container, border };
}
/** Crop the equipment illustration, leaving its printed title and rules for the hover preview. */
export function equipmentIcon(scene: Phaser.Scene, x: number, y: number, name: string, size: number) {
  const key = `card:${name}`;
  if (!scene.textures.exists(key)) return scene.add.rectangle(x, y, size, size, 0x728276);
  const texture = scene.textures.get(key);
  if (!texture.has('equipment-icon')) {
    const source = texture.getSourceImage() as HTMLImageElement;
    const side = Math.round(Math.min(source.width * 0.7, source.height * 0.44));
    texture.add('equipment-icon', 0, Math.round((source.width - side) / 2),
      Math.round(source.height * 0.18), side, side);
  }
  return scene.add.image(x, y, key, 'equipment-icon').setDisplaySize(size, size);
}
export function cardBack(scene: Phaser.Scene, x: number, y: number, width = 62, height = 88) {
  const group = scene.add.container(x, y).setSize(width, height);
  group.add(scene.add.rectangle(3, 5, width + 2, height + 2, 0x000000, 0.4));
  if (scene.textures.exists('card-back')) group.add(scene.add.image(0, 0, 'card-back').setDisplaySize(width, height));
  else {
    group.add(scene.add.rectangle(0, 0, width, height, 0x1d3330));
    group.add(text(scene, 0, 0, '策', Math.round(width * 0.47), '#b99a61'));
  }
  return group;
}
