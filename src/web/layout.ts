export const BOARD = { width: 1600, height: 900 } as const;
export interface Point { x: number; y: number; }
export const PLAY_AREA = { x: 790, y: 486, width: 650, height: 205 } as const;
export const HAND = { x: 881, y: 774, width: 840, cardWidth: 120, cardHeight: 172 } as const;
/** Keep a batch of public discards inside the central table, compressing large batches. */
export function discardTablePosition(index: number, count: number): Point {
  const stride = Math.min(112, (PLAY_AREA.width - 100) / Math.max(1, count - 1));
  return { x: PLAY_AREA.x + (index - (count - 1) / 2) * stride, y: 490 };
}
/** Shared by the static hand and incoming cards so they land in the same slots. */
export function handCardPosition(index: number, count: number): Point {
  const stride = Math.min(128, (HAND.width - HAND.cardWidth) / Math.max(1, count - 1));
  return { x: HAND.x + (index - (count - 1) / 2) * stride, y: HAND.y };
}
/** Keep the five-player human portrait wholly inside the lower player area (y=668..900). */
export const IDENTITY_SELF = { x: 133, y: 781, width: 196, height: 218, judgeY: 620 } as const;
export const EQUIPMENT_ROW = { height: 22, gap: 2, iconSize: 20 } as const;
export const IDENTITY_JUDGE = { width: 42, height: 60 } as const;
export const DECK = { x: 1340, y: 438 } as const;
export function deckPosition(playerCount: number): Point {
  return playerCount === 5 ? { x: 1530, y: 487 } : DECK;
}

/** Rotates by the viewer's seat; five players use wider spacing for the shared table. */
export function playerPosition(id: number, seatIds: readonly number[], selfId: number): Point {
  if (id === selfId) return seatIds.length === 5 ?
    { x: IDENTITY_SELF.x, y: IDENTITY_SELF.y } : { x: 133, y: 749 };
  const seats = [...seatIds].sort((a, b) => a - b);
  const offset = seats.indexOf(selfId);
  const others = [...seats.slice(offset + 1), ...seats.slice(0, offset)];
  const index = others.indexOf(id);
  if (index < 0) throw new Error('座位不属于当前牌桌');
  if (seatIds.length === 5) return [
    { x: 390, y: 320 }, { x: 665, y: 255 },
    { x: 1055, y: 255 }, { x: 1330, y: 320 },
  ][index];
  const angle = Math.PI + Math.PI * (index + 0.5) / others.length;
  return { x: 862 + Math.cos(angle) * 494, y: 452 + Math.sin(angle) * 248 };
}
/** Stack one equipment per row above the portrait's numeric health strip. */
export function equipmentRowPosition(id: number, seatIds: readonly number[], selfId: number,
  index: number, count: number): Point & { width: number } {
  const portrait = playerPosition(id, seatIds, selfId);
  const identity = seatIds.length === 5;
  const halfHeight = id === selfId ? (identity ? IDENTITY_SELF.height : 242) / 2 : identity ? 107 : 130;
  const portraitWidth = id === selfId ? IDENTITY_SELF.width : identity ? 172 : 204;
  // Use the whole visible art width, with 2px clearance from the name column.
  return { x: portrait.x + 16, width: portraitWidth - 44,
    y: portrait.y + halfHeight - 49 - (count - 1 - index) * (EQUIPMENT_ROW.height + EQUIPMENT_ROW.gap) };
}
/** Self judgement sits above the lower player area; equipment uses the shared row layout. */
export function identityZonePosition(id: number, seatIds: readonly number[], selfId: number,
  zone: 'equip' | 'judge', index: number, count: number): Point {
  const portrait = playerPosition(id, seatIds, selfId);
  if (zone === 'judge') return { x: portrait.x + (index - (count - 1) / 2) * 46,
    y: id === selfId ? IDENTITY_SELF.judgeY : portrait.y + 220 };
  return equipmentRowPosition(id, seatIds, selfId, index, count);
}
export function handPosition(id: number, seatIds: readonly number[], selfId: number): Point {
  if (id === selfId) return { x: HAND.x, y: HAND.y };
  const portrait = playerPosition(id, seatIds, selfId);
  return { x: portrait.x + 139, y: portrait.y + 70 };
}

export function hiddenHandSlot(slot: number, count: number): Point & { width: number; height: number } {
  const rows = count > 10 ? 2 : 1;
  const columns = Math.ceil(count / rows);
  const width = rows === 1 ? 124 : 108;
  const height = rows === 1 ? 170 : 148;
  const stride = Math.min(width + 22, (980 - width) / Math.max(1, columns - 1));
  const row = Math.floor(slot / columns), col = slot % columns;
  const inRow = Math.min(columns, count - row * columns);
  return { x: 800 + (col - (inRow - 1) / 2) * stride,
    y: rows === 1 ? 494 : row === 0 ? 445 : 585, width, height };
}
/** Park a resolving trick clear of the central hand/equipment picker. */
export function trickTablePosition(cname: string, index: number, count: number, choosingZone: boolean): Point {
  if (choosingZone && cname !== 'wugu') return {
    x: 1320 + (index - (count - 1) / 2) * 76,
    y: count > 3 ? 250 : 515,
  };
  return { x: (cname === 'wugu' ? 1110 : 790) + (index - (count - 1) / 2) * 110, y: 480 };
}
export function inside(point: Point, area: Point & { width: number; height: number }): boolean {
  return Math.abs(point.x - area.x) <= area.width / 2 && Math.abs(point.y - area.y) <= area.height / 2;
}
