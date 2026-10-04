import type { EquipSlot } from './state.ts';
export type CardZone =
  | { kind: 'deck' | 'discard' | 'table' }
  | { kind: 'hand' | 'judge'; owner: number }
  | { kind: 'equip'; owner: number; slot: EquipSlot };
