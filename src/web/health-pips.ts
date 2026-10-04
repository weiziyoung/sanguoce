import type { PlayerVitalsState } from './player-vitals.ts';

export const HEALTH_PIP_STATES = ['healthy', 'low', 'empty'] as const;
export type HealthPipState = typeof HEALTH_PIP_STATES[number];
export const healthPipTexture = (state: HealthPipState): string => `health:${state}`;
export const healthPipSourceTexture = (state: HealthPipState): string => `health-source:${state}`;

/** Fit the health column below the measured name, inside the existing name strip. */
export function healthPipLayout(nameBottom: number, portraitBottom: number, count: number) {
  const top = nameBottom + 6;
  const bottom = portraitBottom - 8;
  const step = Math.min(26, Math.max(0, bottom - top) / Math.max(1, count));
  return Array.from({ length: count }, (_, index) => ({ y: top + (index + 0.5) * step, size: step }));
}

/** Portrait-side slots run top to bottom; remaining health fills from the bottom. */
export function healthPips({ hp, maxHp, alive }: PlayerVitalsState): HealthPipState[] {
  const filled = alive ? Math.max(0, Math.min(maxHp, hp)) : 0;
  const lit: HealthPipState = filled <= maxHp / 2 ? 'low' : 'healthy';
  return Array.from({ length: maxHp }, (_, index) => index < maxHp - filled ? 'empty' : lit);
}
