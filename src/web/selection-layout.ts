export interface SelectionCardLayout {
  x: number; y: number; width: number; height: number;
  portraitY: number; portraitWidth: number; portraitHeight: number;
  labelY: number; healthY: number; skillY: number;
  buttonY: number; buttonWidth: number; buttonHeight: number;
  compact: boolean;
}

/** Keep the full portrait, health row, skill seals and action inside every draft card. */
export function selectionRow(count: number, y: number): SelectionCardLayout[] {
  const step = 1460 / count;
  return Array.from({ length: count }, (_, index) => {
    const width = Math.min(230, step - 16);
    return { x: 70 + step * (index + 0.5), y, width, height: 296,
      portraitY: y - 49, portraitWidth: width - 20, portraitHeight: 182,
      labelY: y + 26, healthY: y + 63, skillY: y + 92,
      buttonY: y + 127, buttonWidth: width - 32, buttonHeight: 34, compact: true };
  });
}

export function selectionCards(count: number): SelectionCardLayout[] {
  const wide = count >= 4;
  const step = wide ? 1460 / count : 390;
  return Array.from({ length: count }, (_, index) => {
    const width = wide ? Math.min(270, step - 20) : 312;
    return { x: 800 + (index - (count - 1) / 2) * step, y: 461, width, height: 554,
      portraitY: 389, portraitWidth: width - 22, portraitHeight: 376,
      labelY: 544, healthY: 590, skillY: 627,
      buttonY: 687, buttonWidth: width - 64, buttonHeight: 52, compact: false };
  });
}
