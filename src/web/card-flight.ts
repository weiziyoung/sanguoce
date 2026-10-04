import type { Point } from './layout.ts';

export interface CardFlight {
  from: Point; to: Point; first: Point; second: Point;
  startScale: number; endScale: number; tilt: number; duration: number;
}

/** A shallow arc with a soft departure and a level, decelerating arrival. */
export function cardFlight(from: Point, to: Point, startScale: number, endScale: number): CardFlight {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const lift = Math.min(64, distance * 0.14);
  return {
    from, to,
    first: { x: from.x + dx * 0.28, y: Math.max(60, from.y + dy * 0.18 - lift) },
    second: { x: from.x + dx * 0.78, y: Math.max(60, from.y + dy * 0.85 - lift * 0.35) },
    startScale, endScale, tilt: Math.sign(dx) * Math.min(0.085, distance / 6000),
    duration: Math.min(560, 340 + distance * 0.22),
  };
}

/** Sample elapsed time, not frames, so position/scale stay continuous at any frame rate. */
export function sampleCardFlight(flight: CardFlight, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const t = p * p * p * (p * (p * 6 - 15) + 10);
  const r = 1 - t;
  return {
    x: r ** 3 * flight.from.x + 3 * r * r * t * flight.first.x + 3 * r * t * t * flight.second.x + t ** 3 * flight.to.x,
    y: r ** 3 * flight.from.y + 3 * r * r * t * flight.first.y + 3 * r * t * t * flight.second.y + t ** 3 * flight.to.y,
    scale: flight.startScale + (flight.endScale - flight.startScale) * t,
    rotation: flight.tilt * Math.sin(Math.PI * p) ** 2,
  };
}
