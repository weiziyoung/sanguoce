import type Phaser from 'phaser';
import type { VisiblePlayer } from '../../contracts.ts';
import { NAMES, type Card } from '../../catalog.ts';
import { JUDGE_MARKER } from './layout.ts';
import { text } from './visuals.ts';

const FACTIONS = {
  wei: { glyph: '魏', base: 0x243b54, fold: 0x172536 },
  shu: { glyph: '蜀', base: 0x793b31, fold: 0x47241f },
  wu: { glyph: '吴', base: 0x315348, fold: 0x1b342e },
  qun: { glyph: '群', base: 0x705836, fold: 0x423421 },
};
const ROLES: Record<string, { glyph: string; base: number; ink: string }> = {
  lord: { glyph: '主', base: 0x782c26, ink: '#ffe0a0' },
  loyalist: { glyph: '忠', base: 0x665133, ink: '#f7deb0' },
  rebel: { glyph: '反', base: 0x54362b, ink: '#efc29b' },
  renegade: { glyph: '内', base: 0x43384e, ink: '#ddd0e9' },
};
const UNKNOWN = { glyph: '?', base: 0x252b2b, ink: '#c8bea8' };
type BadgePoint = { x: number; y: number };
const points = (pairs: number[][]): BadgePoint[] => pairs.map(([x, y]) => ({ x, y }));
function shape(g: Phaser.GameObjects.Graphics, vertices: BadgePoint[], dx = 0, dy = 0, closed = true) {
  g.beginPath().moveTo(vertices[0].x + dx, vertices[0].y + dy);
  for (const point of vertices.slice(1)) g.lineTo(point.x + dx, point.y + dy);
  if (closed) g.closePath();
  return g;
}

/** Small seals keep delayed tricks recognizable without showing a full card at rest. */
export function delayedTrickMarker(scene: Phaser.Scene, x: number, y: number, card: Card) {
  const view = scene.add.container(x, y).setSize(JUDGE_MARKER.width, JUDGE_MARKER.height);
  const g = scene.add.graphics();
  g.fillStyle(0x0d1c19, 0.95).fillRoundedRect(-13, -13, 26, 26, 3);
  g.lineStyle(1, 0xb2945e, 0.85).strokeRoundedRect(-13, -13, 26, 26, 3);
  view.add(g);
  if (card.name === 'shandian') {
    shape(g.fillStyle(0xf2d299), points([[3, -10], [-7, 2], [-1, 2], [-4, 10], [8, -3], [2, -3]])).fillPath();
  } else {
    const glyph = card.name === 'lebu' ? '乐' : card.name === 'bingliang' ? '兵' : (NAMES[card.name] ?? card.name)[0];
    view.add(text(scene, 0, 0, glyph, 21, '#f2d299'));
  }
  return view;
}

/** A stitched, fork-tailed banner anchored to the portrait's name column. */
export function factionBanner(scene: Phaser.Scene, x: number, y: number, group: VisiblePlayer['group']) {
  const style = group ? FACTIONS[group] : { glyph: '将', base: 0x41483e, fold: 0x272d26 };
  const view = scene.add.container(x, y);
  const g = scene.add.graphics();
  const outline = points([[-20, -23], [20, -23], [20, 27], [0, 19], [-20, 27]]);
  shape(g.fillStyle(0x000000, 0.45), outline, 3, 4).fillPath();
  shape(g.fillStyle(style.base), outline).fillPath();
  shape(g.fillStyle(style.fold), points([[7, -22], [20, -22], [20, 26], [7, 21]])).fillPath();
  // Fine horizontal threads stay within the rectangular part of the fabric.
  for (let row = -19; row < 18; row += 3) g.lineStyle(0.5, 0xe4c990, 0.1).lineBetween(-18, row, 18, row);
  shape(g.lineStyle(1.2, 0xbca16a), outline).strokePath();
  shape(g.lineStyle(0.7, 0xe5c88d, 0.6), points([[-16, -18], [-16, 20], [0, 14], [16, 20], [16, -18]]), 0, 0, false).strokePath();
  g.fillGradientStyle(0xe0c48a, 0x907349, 0x786040, 0xbba06b).fillRect(-23, -25, 46, 5);
  g.fillStyle(0xf0d8a0).fillCircle(-19, -22.5, 1).fillCircle(19, -22.5, 1);
  const glyph = text(scene, 0, -2, style.glyph, 27, '#f6e0b0')
    .setFontFamily('STKaiti, KaiTi, Wenq, serif').setStroke('#231b15', 1.5)
    .setShadow(0, 2, '#100e0b', 2);
  view.add([g, glyph]);
  return view;
}

/** Role notes use the neutral back and a small “疑” mark, never a confirmed role's color. */
export function identityToken(scene: Phaser.Scene, x: number, y: number, role?: string, note = '?') {
  const view = scene.add.container(x, y).setSize(46, 56);
  const g = scene.add.graphics();
  const glyph = text(scene, 0, 0, '', 25).setFontFamily('STKaiti, KaiTi, Wenq, serif')
    .setStroke('#211813', 1.5).setShadow(0, 2, '#110c09', 2);
  const annotation = text(scene, 0, 17, '', 9, '#bbaa88').setStroke('', 0);
  view.add([g, glyph, annotation]);
  const update = (nextNote: string) => {
    const known = Boolean(role);
    const style = role ? ROLES[role] ?? UNKNOWN : UNKNOWN;
    const outline = points([[-13, -25], [13, -25], [22, -16], [22, 18], [14, 26], [-14, 26], [-22, 18], [-22, -16]]);
    g.clear();
    shape(g.fillStyle(0x000000, 0.5), outline, 3, 4).fillPath();
    shape(g.fillStyle(0x695236), outline).fillPath();
    shape(g.lineStyle(1.2, known ? 0xd5b578 : 0x9b8862), outline).strokePath();
    g.fillStyle(style.base).fillRoundedRect(-17, -19, 34, 39, 3);
    g.lineStyle(0.7, 0xd6b478, 0.5).strokeRoundedRect(-17, -19, 34, 39, 3);
    g.lineStyle(1, 0xf3dbaa, 0.35).lineBetween(-11, -23, 11, -23);
    g.lineStyle(2, 0x201a14, 0.65).lineBetween(-11, 24, 11, 24);
    g.fillStyle(0x211b14).fillCircle(0, -22, 1.5);
    for (const sx of [-1, 1]) g.fillStyle(0xd3b47c).fillCircle(sx * 19, 15, 1);
    glyph.setText(known ? style.glyph : ROLES[nextNote]?.glyph ?? '?').setColor(style.ink);
    annotation.setText(!known && nextNote !== '?' ? '疑' : '');
  };
  update(note);
  return { view, update };
}
