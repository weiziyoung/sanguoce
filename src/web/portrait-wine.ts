import type { VisibleEvent } from '../domain/events.ts';

export const WINE_PORTRAIT_TINT = 0xff9999;
export interface WinePortraitArt {
  setTint?: (color: number) => unknown;
  clearTint?: () => unknown;
  setFillStyle?: (color: number) => unknown;
}
export function applyWinePortraitTint(art: WinePortraitArt, active: boolean): void {
  if (art.setTint) {
    if (active) art.setTint(WINE_PORTRAIT_TINT);
    else art.clearTint?.();
  } else art.setFillStyle?.(active ? 0x783838 : 0x263d32);
}
export function winePortraitUpdate(event: VisibleEvent): { player: number; active: boolean } | null {
  if (event.kind === 'wineUsed') return { player: event.data.player, active: event.data.bonus > 0 };
  if (event.kind === 'wineCleared') return { player: event.data.player, active: false };
  if (event.kind === 'died') return { player: event.data.target, active: false };
  return null;
}
export function portraitStatus(chained: boolean, drunk: boolean): string {
  return [chained ? '连环' : '', drunk ? '酒＋1' : ''].filter(Boolean).join(' · ');
}
