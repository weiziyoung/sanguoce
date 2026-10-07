import type Phaser from 'phaser';
import type { VisibleEvent } from '../domain/events.ts';

interface ChainLink { x: number; y: number; angle: number; edgeOn: boolean; }

/** Equally spaced interlocking rings along the rounded perimeter of a portrait. */
export function portraitChainLinks(width: number, height: number): ChainLink[] {
  const radius = 14, horizontal = width - 2 * radius, vertical = height - 2 * radius;
  const corner = Math.PI * radius / 2;
  const lengths = [horizontal, corner, vertical, corner, horizontal, corner, vertical, corner];
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  const count = 2 * Math.round(perimeter / 24);
  return Array.from({ length: count }, (_, index) => {
    let distance = perimeter * index / count, segment = 0;
    while (segment < lengths.length - 1 && distance >= lengths[segment]) distance -= lengths[segment++];
    const left = -width / 2, right = width / 2, top = -height / 2, bottom = height / 2;
    if (segment % 2 === 0) {
      const points = [
        { x: left + radius + distance, y: top, angle: 0 },
        { x: right, y: top + radius + distance, angle: Math.PI / 2 },
        { x: right - radius - distance, y: bottom, angle: Math.PI },
        { x: left, y: bottom - radius - distance, angle: -Math.PI / 2 },
      ];
      return { ...points[segment / 2], edgeOn: index % 2 === 1 };
    }
    const corners = [
      { x: right - radius, y: top + radius }, { x: right - radius, y: bottom - radius },
      { x: left + radius, y: bottom - radius }, { x: left + radius, y: top + radius },
    ];
    const center = corners[(segment - 1) / 2];
    const angle = -Math.PI / 2 + (segment - 1) * Math.PI / 4 + distance / radius;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius,
      angle: angle + Math.PI / 2, edgeOn: index % 2 === 1 };
  });
}

/** Public status updates must reach the portrait before the next animation starts. */
export function portraitChainUpdate(event: VisibleEvent): { player: number; visible: boolean } | null {
  if (event.kind === 'chainChanged') return { player: event.data.player, visible: event.data.chained };
  if (event.kind === 'died') return { player: event.data.target, visible: false };
  return null;
}

export function portraitChain(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
  const view = scene.add.graphics({ x, y });
  const trace = (link: ChainLink, highlight = false) => {
    view.beginPath();
    const start = highlight ? Math.PI + 0.25 : 0, end = highlight ? 2 * Math.PI - 0.25 : 2 * Math.PI;
    for (let step = 0; step <= 20; step++) {
      const theta = start + (end - start) * step / 20;
      const along = 9 * Math.cos(theta), across = (link.edgeOn ? 2 : 4.5) * Math.sin(theta);
      const px = link.x + along * Math.cos(link.angle) - across * Math.sin(link.angle);
      const py = link.y + along * Math.sin(link.angle) + across * Math.cos(link.angle);
      if (step === 0) view.moveTo(px, py); else view.lineTo(px, py);
    }
    if (!highlight) view.closePath();
    view.strokePath();
  };
  for (const link of portraitChainLinks(width + 2, height + 2)) {
    view.lineStyle(5, 0x07100f, 0.9); trace(link);
    view.lineStyle(2.6, link.edgeOn ? 0x66716e : 0x8a9591); trace(link);
    view.lineStyle(0.9, 0xd6d8c5, 0.9); trace(link, true);
  }
  return view;
}
